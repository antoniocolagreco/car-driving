/**
 * Sparse race objective: the score is the number of traffic cars passed, one point each,
 * plus a single `BRAKE_DISCOVERY_BONUS` for a car that both braked and passed somebody,
 * and doing it sooner is the only tie-breaker.
 *
 * There is nothing else. No points for progress, speed, survival, steering or for
 * crashing gently, and no malus for crashing at all. Every knob of that kind that has
 * been tried here was found and exploited within a few dozen generations: paying per
 * frame for braking near an obstacle produced cars that tucked in behind traffic and
 * pumped the brake forever, and discounting the crash malus at traffic pace produced
 * cars that deliberately bumped the wall sideways at exactly that speed. A reward is an
 * instruction, and the population always follows the instruction rather than the
 * intention behind it, so the only safe instruction is the goal itself: pass every
 * traffic car, and get there first.
 *
 * The brake bonus is the one exception, and it is shaped to expire rather than to be
 * followed: it pays once per race for one press, so there is no behaviour to escalate
 * into, and once every car has it the ranking is decided by overtakes again. It also
 * cannot be collected instead of racing, which is exactly what it did when it was first
 * tried without that condition. See `BRAKE_DISCOVERY_BONUS`.
 *
 * Crashing needs no penalty of its own. A wreck stops overtaking, and the cars that keep
 * going pass it in the only currency there is.
 *
 * There is no separate fitness number, either: at one point per overtake it would have
 * been the same integer under a second name.
 */

import { BRAKE_DISCOVERY_BONUS, SIMULATION } from '@core/config'
import type { Vec2 } from '@core/geometry'

/** Runtime counters for one car's current race. */
export type CarStats = {
    /** World-space y at the start of the race. */
    readonly startY: number
    /** Furthest forward distance reached, used exclusively by the idle timeout. */
    groundProgress: number
    /** Maximum number of traffic cars left behind during this race. */
    overtakes: number
    /** Race time when the current overtake maximum was first reached: the tie-breaker. */
    lastOvertakeAtSeconds: number
    /** Time since the most recent overtake, used exclusively by the overtake timeout. */
    secondsSinceLastOvertake: number
    /** A car that missed the overtake deadline cannot be selected as winner or parent. */
    overtakeTimedOut: boolean
    /**
     * Taken out of the race by its own driving: a wreck, the idle timeout or the overtake
     * deadline. Being stopped because the round ended is not this, and neither is crossing
     * the finish line, so `!retired` is exactly what "survived the race" means.
     */
    retired: boolean
    /** Whether the brake was ever pressed while moving: worth `BRAKE_DISCOVERY_BONUS`, once. */
    usedBrake: boolean
    /** Elapsed race time, needed to timestamp overtakes. */
    aliveSeconds: number
    /** Time since enough ground progress was last made. */
    idleSeconds: number
    /** Ground-progress baseline from which the idle threshold is measured. */
    progressAtIdleReset: number
}

/** The observations required by scoring and the two death timeouts. */
export type FitnessSample = {
    readonly position: Vec2
    readonly overtakes: number
    /** Brake pressure applied this step, in [0, 1]. */
    readonly brake: number
    /** Current speed, so that holding the brake at a standstill earns nothing. */
    readonly speed: number
}

export const createStats = (startPosition: Vec2): CarStats => ({
    startY: startPosition.y,
    groundProgress: 0,
    overtakes: 0,
    lastOvertakeAtSeconds: 0,
    secondsSinceLastOvertake: 0,
    overtakeTimedOut: false,
    retired: false,
    usedBrake: false,
    aliveSeconds: 0,
    idleSeconds: 0,
    progressAtIdleReset: 0,
})

/** Updates the overtake count, the brake bonus flag and the timeout counters. Mutates `stats`. */
export const updateStats = (stats: CarStats, sample: FitnessSample, dt: number): void => {
    stats.aliveSeconds += dt

    // Only while moving: a brake held at a standstill changes nothing about the driving,
    // and paying for it would hand the bonus to every car that never sets off.
    if (sample.brake > 0 && sample.speed !== 0) {
        stats.usedBrake = true
    }

    const previousOvertakes: number = stats.overtakes
    stats.overtakes = Math.max(previousOvertakes, sample.overtakes)
    if (stats.overtakes > previousOvertakes) {
        stats.lastOvertakeAtSeconds = stats.aliveSeconds
        stats.secondsSinceLastOvertake = 0
    } else {
        stats.secondsSinceLastOvertake += dt
    }

    const advance: number = stats.startY - sample.position.y
    stats.groundProgress = Math.max(stats.groundProgress, advance)
    if (stats.groundProgress - stats.progressAtIdleReset >= SIMULATION.idleProgressThreshold) {
        stats.progressAtIdleReset = stats.groundProgress
        stats.idleSeconds = 0
    } else {
        stats.idleSeconds += dt
    }
}

/**
 * Marks a missed overtake deadline. This is an elimination, not a penalty: the score is
 * left exactly as earned, and the car is simply no longer allowed to win or breed. A car
 * that stops overtaking has stopped racing, and its remaining points are telemetry.
 */
export const recordOvertakeTimeout = (stats: CarStats): void => {
    stats.overtakeTimedOut = true
}

/** Marks a car as taken out of the race by its own driving. See `CarStats.retired`. */
export const recordRetirement = (stats: CarStats): void => {
    stats.retired = true
}

/**
 * True once a car has passed every traffic car on the course.
 *
 * The finish line is a count, not a place on the road: there is nothing beyond the last
 * traffic row but empty tarmac, so having nobody left to pass IS the finish. An empty
 * course has no finish line at all, which is why a zero traffic count answers false
 * rather than true for everybody at once.
 */
export const hasClearedCourse = (stats: CarStats, trafficCount: number): boolean =>
    trafficCount > 0 && stats.overtakes >= trafficCount

/**
 * What the ranking compares: traffic cars passed, plus the one-off brake bonus for a
 * car that both braked and got at least one car past it. A car that never overtook
 * scores nothing, however much it braked.
 *
 * Kept apart from `stats.overtakes`, which stays the literal number of cars passed,
 * because that count is also what decides whether the course has been cleared and what
 * the Champion record stores. Inflating it would let a car "finish" a course it never
 * drove to the end of.
 */
export const raceScore = (stats: CarStats): number =>
    stats.overtakes + (stats.usedBrake && stats.overtakes > 0 ? BRAKE_DISCOVERY_BONUS : 0)

/**
 * A higher score always wins; at equal scores the car that got there first does. That is
 * the whole ranking, and it is exactly the goal: pass everybody, as soon as possible.
 * Overtake-timed-out cars and cars that scored nothing at all are excluded.
 *
 * Partial credit for getting CLOSE to the next traffic car was tried as a middle
 * tie-break and measured worse, so do not reach for it again. The motivation was real:
 * the overtake count is a staircase rather than a slope, because a row of traffic is
 * passed whole, so on a fixed course 25 of 81 cars tied on EXACTLY 8 and the scores 3, 6
 * and 9 never occurred at all. Ranking those ties by the smallest gap ever reached to the
 * next traffic car dropped peak overtakes from 20/23/18 to 17/10/14 over three runs of 40
 * races. The gap is longitudinal, so shrinking it rewards the car that charges the row
 * head-on and dies ten pixels deeper over the car that lifts off to set up the lane
 * change that actually passes. A deceptive gradient is worse than no gradient.
 */
const compareRacePerformance = (left: CarStats, right: CarStats): number =>
    raceScore(right) - raceScore(left) || left.lastOvertakeAtSeconds - right.lastOvertakeAtSeconds

const hasRaceResult = (stats: CarStats): boolean => !stats.overtakeTimedOut && raceScore(stats) > 0

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

/** Returns the best eligible overtake results, best first. */
export const selectParents = <T extends { stats: CarStats }>(
    cars: readonly T[],
    count: number,
): T[] =>
    cars
        .filter((car) => hasRaceResult(car.stats))
        .sort((left, right) => compareRacePerformance(left.stats, right.stats))
        .slice(0, count)

/** True when the car has not covered enough ground within the idle deadline. */
export const isStuck = (stats: CarStats): boolean =>
    stats.idleSeconds >= SIMULATION.idleTimeoutSeconds

/** True when no new overtake arrived within the configured deadline. */
export const hasMissedOvertakeDeadline = (stats: CarStats): boolean =>
    stats.secondsSinceLastOvertake >= SIMULATION.overtakeTimeoutSeconds
