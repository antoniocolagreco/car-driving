/**
 * The reward system: turns raw driving observations into a single fitness number
 * that decides which network survives into the next generation.
 *
 * The rule that shapes every term below: reward outcomes, never actions. The original
 * scoring system paid a car per frame for having the brake pressed near an obstacle,
 * and per frame for steering hard near one. That rewards the *act* of braking and
 * steering, not what they achieve, and evolution found the exploit immediately: the
 * highest-scoring behaviour was to tuck in behind a slow traffic car and stay
 * there forever, pumping the brake and wiggling the wheel, farming reward frames
 * without ever overtaking. A car that never reaches the finish line was
 * out-scoring cars that did.
 *
 * This version pays for cars passed, ground gained on the traffic, speed used while the
 * path ahead was free, and staying alive. It charges for crashing (the more speed at
 * impact, the more it costs), standing still, driving in reverse, and carrying more
 * speed than the available path can safely absorb.
 *
 * The hazard term judges outcomes, not controls. Braking helps by shrinking the stopping
 * distance; steering helps only when it actually opens the path. Merely moving either
 * control no longer makes an unsafe state disappear from the score.
 *
 * The exact coefficients and the reasoning behind each one live in `core/config.ts`
 * under `REWARD`, `PENALTY` and `DRIVING`; this file only wires them together, so
 * consult that file when a number looks wrong.
 *
 * This module is deliberately decoupled from `car.ts`, `sensor.ts`, `road.ts` and
 * `traffic.ts`. It knows nothing about a `Car`, a ray-casting sensor or a canvas —
 * every observation it needs arrives through `FitnessSample`, one frame at a time.
 * That means the reward system can be built, tested and reasoned about without a
 * car, a road or a canvas anywhere in sight.
 *
 * Mutability rule: `CarStats` is a mutable record, stepped in
 * place once per simulation step by `updateStats`. `FitnessBreakdown` returned by
 * `computeFitness` is a fresh value each time — it is cheap and it is exactly the
 * kind of value the HUD wants to diff against the previous frame.
 */

import type { Vec2 } from '@core/geometry'
import { clamp, lerp } from '@core/math'
import { DRIVING, PENALTY, REWARD, SIMULATION } from '@core/config'

/** Per-term fitness contributions, kept separate so the HUD can show where the score comes from. */
export type FitnessBreakdown = {
    /** Rewards are positive. */
    overtakes: number
    progress: number
    pace: number
    survival: number
    /** Penalties are stored NEGATIVE, so the HUD can just list every term and sum them. */
    crash: number
    stall: number
    hazard: number
    reverse: number
    total: number
}

/** Accumulated driving history for one car's current run, plus its cached fitness. */
export type CarStats = {
    /** World-space y the car started at. Progress is measured as `startY - position.y`. */
    readonly startY: number
    /**
     * Ground gained ON THE TRAFFIC, in px: `max((startY - y) - trafficDrift)`. Monotone,
     * so falling back cannot reduce it.
     *
     * Measured against the moving course rather than against the tarmac, and that is
     * the whole point. Traffic rolls forward, so a car that tucks in behind the pack
     * and does nothing is carried along and racks up tarmac for free: measured, one
     * champion covered 9930 px with two overtakes by braking 98 % of the time and
     * riding the convoy for a full minute. Relative to the traffic that run gained
     * almost nothing, which is exactly what it deserves. Overtaking is now the only
     * way this number grows, and it grows smoothly instead of in jumps of one car.
     */
    forwardProgress: number
    /**
     * Distance covered on the tarmac, in px, regardless of the traffic. Not part of
     * the reward — it exists so `isStuck` can answer the physical question "is this
     * car moving at all?", which has nothing to do with whether it is earning.
     */
    groundProgress: number
    /** `max` count of traffic cars currently left behind, so falling back does not un-credit it. */
    overtakes: number
    /** Elapsed seconds when `overtakes` most recently reached a new maximum; zero before any overtake. */
    lastOvertakeAtSeconds: number
    /** Seconds since the most recent new overtake; starts at the beginning of the round. */
    secondsSinceLastOvertake: number
    /** True once the car misses the overtake deadline and becomes ineligible for selection. */
    overtakeTimedOut: boolean
    aliveSeconds: number
    /** Seconds since ground progress last grew by `SIMULATION.idleProgressThreshold`. Drives `isStuck`. */
    idleSeconds: number
    /** `groundProgress` the last time `idleSeconds` was reset; the baseline the threshold is measured from. */
    progressAtIdleReset: number
    reverseDistance: number
    stalledSeconds: number
    /** Σ (speed / maxSpeed) · dt while the road ahead is clear: how much speed was USED when it was free. */
    paceScore: number
    /** Σ closeness · dt spent carrying unsafe speed for the available path. */
    hazardScore: number
    topSpeed: number
    crashed: boolean
    /** Speed at the moment of impact, as a fraction of top speed. Scales the crash cost. */
    impactSpeedRatio: number
    /** Cached `computeFitness(this).total`, refreshed by every `updateStats`/`recordCrash` call. */
    fitness: number
    breakdown: FitnessBreakdown
}

/**
 * One step's worth of observation — everything the reward system is allowed to see.
 * Deliberately flat and car-agnostic: whoever drives the simulation loop (which does
 * know about cars and sensors) builds this from a `Car` and a `SensorState` and hands
 * it over; the reward system never reaches back into either.
 */
export type FitnessSample = {
    readonly position: Vec2
    readonly speed: number
    /**
     * `speed / maxSpeed`, so the reward system can judge speed without knowing what
     * car it belongs to. Negative while reversing.
     */
    readonly speedRatio: number
    /**
     * Distance, in px, to the nearest obstacle IN THE CAR'S PATH — the corridor its body
     * sweeps along its current heading, guard rails included. `Infinity` when the path is
     * clear. Not a cone: see `PENALTY.hazard`.
     */
    readonly pathDistance: number
    /** How far this car needs to stop from its current speed, in px. Sets the hazard zone. */
    readonly stoppingDistance: number
    /** How many traffic cars are currently behind this car. */
    readonly overtakes: number
    /**
     * How far the traffic itself has rolled forward since the round began, in px.
     * Subtracted from the car's own advance so progress means ground gained on the
     * course, not ground handed to it by a moving course.
     */
    readonly trafficDrift: number
}

const ZERO_BREAKDOWN: FitnessBreakdown = {
    overtakes: 0,
    progress: 0,
    pace: 0,
    survival: 0,
    crash: 0,
    stall: 0,
    hazard: 0,
    reverse: 0,
    total: 0,
}

export const createStats = (startPosition: Vec2): CarStats => {
    const stats: CarStats = {
        startY: startPosition.y,
        forwardProgress: 0,
        groundProgress: 0,
        overtakes: 0,
        lastOvertakeAtSeconds: 0,
        secondsSinceLastOvertake: 0,
        overtakeTimedOut: false,
        aliveSeconds: 0,
        idleSeconds: 0,
        progressAtIdleReset: 0,
        reverseDistance: 0,
        stalledSeconds: 0,
        paceScore: 0,
        hazardScore: 0,
        topSpeed: 0,
        crashed: false,
        impactSpeedRatio: 0,
        fitness: 0,
        breakdown: ZERO_BREAKDOWN,
    }
    stats.breakdown = computeFitness(stats)
    stats.fitness = stats.breakdown.total
    return stats
}

/**
 * Folds one step's observation into the stats and recomputes `fitness`. Mutates `stats`.
 *
 * The idle timer is measured from an explicit baseline, `progressAtIdleReset`: the timer
 * resets only when the car has covered a full `SIMULATION.idleProgressThreshold` px of
 * GROUND since the last reset. Baseline and elapsed time therefore always describe the
 * same interval, which is what makes `isStuck` a genuine minimum-average-speed test. It
 * deliberately reads `groundProgress`, not the traffic-relative `forwardProgress`: being
 * stuck is a question about the car and the road, not about the race.
 */
export const updateStats = (stats: CarStats, sample: FitnessSample, dt: number): void => {
    stats.aliveSeconds += dt
    stats.topSpeed = Math.max(stats.topSpeed, sample.speed)
    const previousOvertakes: number = stats.overtakes
    stats.overtakes = Math.max(previousOvertakes, sample.overtakes)
    if (stats.overtakes > previousOvertakes) {
        stats.lastOvertakeAtSeconds = stats.aliveSeconds
        stats.secondsSinceLastOvertake = 0
    } else {
        stats.secondsSinceLastOvertake += dt
    }

    const advance = stats.startY - sample.position.y
    stats.groundProgress = Math.max(stats.groundProgress, advance)
    stats.forwardProgress = Math.max(stats.forwardProgress, advance - sample.trafficDrift)

    if (stats.groundProgress - stats.progressAtIdleReset >= SIMULATION.idleProgressThreshold) {
        stats.progressAtIdleReset = stats.groundProgress
        stats.idleSeconds = 0
    } else {
        stats.idleSeconds += dt
    }

    if (sample.speed < 0) {
        stats.reverseDistance += Math.abs(sample.speed) * dt * 60
    }

    const pathIsClear = sample.pathDistance > DRIVING.reactionDistance

    // Stopped with nothing ahead to justify it: pure indecision.
    if (Math.abs(sample.speed) < DRIVING.stallSpeed && pathIsClear) {
        stats.stalledSeconds += dt
    }

    // Speed used while the path was free — the reason not to crawl everywhere.
    if (sample.speedRatio > 0 && pathIsClear) {
        stats.paceScore += sample.speedRatio * dt
    }

    // Unsafe speed for the space ahead. This deliberately reads no control input:
    // braking earns its way out by shrinking `stoppingDistance`, while steering only
    // succeeds when it really increases `pathDistance`. Scaling the fixed margin by
    // forward speed makes the whole zone collapse to zero when the car has stopped.
    const forwardSpeedRatio: number = clamp(sample.speedRatio, 0, 1)
    const safeDistance: number =
        sample.stoppingDistance * DRIVING.hazardFactor + DRIVING.hazardMargin * forwardSpeedRatio
    if (safeDistance > 0 && sample.pathDistance < safeDistance) {
        const closeness: number = 1 - sample.pathDistance / safeDistance
        stats.hazardScore += closeness * dt
    }

    stats.breakdown = computeFitness(stats)
    stats.fitness = stats.breakdown.total
}

/**
 * Marks the run as crashed at `impactSpeedRatio` (speed at impact over top speed) and
 * re-applies the crash penalty. Mutates `stats`.
 */
export const recordCrash = (stats: CarStats, impactSpeedRatio: number): void => {
    stats.crashed = true
    stats.impactSpeedRatio = clamp(impactSpeedRatio, 0, 1)
    stats.breakdown = computeFitness(stats)
    stats.fitness = stats.breakdown.total
}

/** Marks a missed overtake deadline. Score remains telemetry; selection rejects the run. */
export const recordOvertakeTimeout = (stats: CarStats): void => {
    stats.overtakeTimedOut = true
}

/** Pure: recomputes the breakdown and the total from the accumulated counters. */
export const computeFitness = (stats: CarStats): FitnessBreakdown => {
    const overtakes = stats.overtakes * REWARD.overtake
    const progress = stats.forwardProgress * REWARD.forwardProgress
    const pace = stats.paceScore * REWARD.pace
    const survival = stats.aliveSeconds * REWARD.survival
    const stall = -stats.stalledSeconds * PENALTY.stall
    const hazard = -stats.hazardScore * PENALTY.hazard
    const reverse = -stats.reverseDistance * PENALTY.reverse

    // A crash costs a fraction of what the run earned — never a flat number — and the
    // fraction rises to 100 % at full-speed impact, so shedding speed before an
    // unavoidable hit always pays while deliberate high-speed exits preserve nothing. See
    // `PENALTY.crashAtRest` / `crashAtFullSpeed`. Expressed as a negative term like
    // every other penalty, so the breakdown still adds up.
    const earned = overtakes + progress + pace + survival
    const crashFraction = lerp(
        PENALTY.crashAtRest,
        PENALTY.crashAtFullSpeed,
        stats.impactSpeedRatio,
    )
    const crash = stats.crashed ? -earned * crashFraction : 0

    // The total never goes below zero: a score is "what this car earned", and a car
    // cannot earn less than nothing. The individual terms are still the raw signed
    // contributions, so a breakdown that adds up below zero shows exactly why the car
    // ended on 0. Selection eligibility remains a separate race-result decision.
    const total = Math.max(0, earned + crash + stall + hazard + reverse)

    return {
        overtakes,
        progress,
        pace,
        survival,
        crash,
        stall,
        hazard,
        reverse,
        total,
    }
}

/**
 * The race result wins: more overtakes outrank every other measure. At equal overtakes,
 * fitness comes next so crash speed, unsafe approach, pace and survival actually affect
 * which network reproduces. Progress and then the time needed to reach the overtake total
 * only break the remaining ties. This preserves the absolute rule that ten overtakes beat
 * nine without making the reward system irrelevant among equally successful overtakers.
 *
 * A result is eligible when it made real forward progress (or an overtake) and was not
 * eliminated by the overtake timeout. Fitness may legitimately be zero after hazard and
 * crash penalties; excluding that car would let a barely-moving early wreck beat a model
 * that travelled much further. When nobody moved forward, there is still no winner.
 *
 * This is NOT the original capability gate, which required a car to have accelerated AND
 * turned left AND turned right AND braked AND overtaken someone before it could win; in
 * early generations nobody satisfied all five, so no champion was ever saved and the
 * simulation sat on "NO WINNER" forever. The condition here is on the outcome, not
 * on a checklist of actions: moving forward counts unless the overtake timeout excludes it.
 */
const compareRacePerformance = (left: CarStats, right: CarStats): number =>
    right.overtakes - left.overtakes ||
    right.fitness - left.fitness ||
    right.forwardProgress - left.forwardProgress ||
    left.lastOvertakeAtSeconds - right.lastOvertakeAtSeconds

const hasRaceResult = (stats: CarStats): boolean =>
    !stats.overtakeTimedOut && (stats.overtakes > 0 || stats.forwardProgress > 0)

export const selectBest = <T extends { stats: CarStats }>(cars: readonly T[]): T | undefined => {
    let best: T | undefined
    for (const car of cars) {
        if (
            hasRaceResult(car.stats) &&
            (best === undefined || compareRacePerformance(car.stats, best.stats) < 0)
        ) {
            best = car
        }
    }
    return best
}

/**
 * The `count` best eligible race results, best first. Fewer than `count` — even none —
 * when not enough cars moved forward. This uses the same ordering as `selectBest`.
 */
export const selectParents = <T extends { stats: CarStats }>(
    cars: readonly T[],
    count: number,
): T[] =>
    cars
        .filter((car) => hasRaceResult(car.stats))
        .sort((left, right) => compareRacePerformance(left.stats, right.stats))
        .slice(0, count)

/** True when the car has been idle longer than the timeout and should die. */
export const isStuck = (stats: CarStats): boolean =>
    stats.idleSeconds >= SIMULATION.idleTimeoutSeconds

/** True when no new overtake arrived within the configured deadline. */
export const hasMissedOvertakeDeadline = (stats: CarStats): boolean =>
    stats.secondsSinceLastOvertake >= SIMULATION.overtakeTimeoutSeconds
