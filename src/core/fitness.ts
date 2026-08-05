/**
 * Sparse race objective: the score is the number of traffic cars passed, one point each,
 * plus a single brake bonus for a car that both braked and passed somebody. Time enters
 * only between cars that cleared the course, and below that nothing breaks a tie at all.
 *
 * There is nothing else. No points for progress, speed, survival, steering or for
 * crashing gently, and no malus for crashing at all. Every knob of that kind that has
 * been tried here was found and exploited within a few dozen generations: paying per
 * frame for braking near an obstacle produced cars that tucked in behind traffic and
 * pumped the brake forever; discounting the crash malus at traffic pace produced cars
 * that deliberately bumped the wall sideways at exactly that speed; and scaling a malus
 * by impact speed produced cars that had learned to crash gently. A reward is an
 * instruction, and the population always follows the instruction rather than the
 * intention behind it, so the only safe instruction is the goal itself: pass every
 * traffic car, and get there first.
 *
 * The brake bonus is the one exception, and it is shaped to expire rather than to be
 * followed: it pays once per race for one press, so there is no behaviour to escalate
 * into, and once every car has it the ranking is decided by overtakes again. It also
 * cannot be collected instead of racing, which is exactly what it did when it was first
 * tried without that condition. See `BRAKE_BONUSES`.
 *
 * Crashing needs no penalty of its own. A wreck stops overtaking, and the cars that keep
 * going pass it in the only currency there is.
 *
 * There is no separate fitness number, either: at one point per overtake it would have
 * been the same integer under a second name.
 */

import { DEFAULTS, SIMULATION } from '@core/config'
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
    /** Whether the brake was ever pressed while moving: worth the brake bonus, once. */
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
 * The bonus is passed in rather than read from `config`, so that the whole of this file
 * stays a function of its arguments: the size of that bonus is a live setting the user
 * moves mid-run, and a module reading it directly would answer differently on Tuesday
 * for reasons its caller could not see. See `BRAKE_BONUSES`.
 *
 * Kept apart from `stats.overtakes`, which stays the literal number of cars passed,
 * because that count is also what decides whether the course has been cleared and what
 * the Champion record stores. Inflating it would let a car "finish" a course it never
 * drove to the end of.
 */
export const raceScore = (stats: CarStats, brakeBonus: number = DEFAULTS.brakeBonus): number =>
    stats.overtakes + (stats.usedBrake && stats.overtakes > 0 ? brakeBonus : 0)

/** Everything the ranking needs beyond the cars themselves. */
export type RankingRules = {
    /** What one brake press is worth, in overtakes. See `BRAKE_BONUSES`. */
    readonly brakeBonus: number
    /** Traffic cars on this course, which is what tells a finisher from a wreck. */
    readonly trafficCount: number
}

/**
 * A higher score always wins. Among equal scores a car that cleared the course beats one
 * that did not, and between two that cleared it the faster one wins. Overtake-timed-out
 * cars and cars that scored nothing at all are excluded.
 *
 * Below a finish there is no tie-break at all, and that absence is the point. The time
 * used to decide every tie, which is harmless while cars are dying at different rows and
 * ruinous the moment they stop: at a row the population cannot pass, the whole top of the
 * field ties on overtakes, and "who got there first" becomes "who drove fastest into the
 * wall". Speed is exactly what makes such a row impassable, twice over. Steering power is
 * `0.000444v² - 0.007667v + 0.037222`, so a car at full speed turns at half the rate of
 * one at 5; and since traffic moves at 5, a car at 10 closes the 500 px between rows in
 * 100 steps where a car at 7 gets 250. Arriving slower is worth roughly 2.7 times the
 * lateral room. The old tie-break selected against all of it, every generation, and the
 * harder the row the harder it pushed. That is not a plateau, it is a downhill gradient
 * with no way out.
 *
 * Nothing replaces it below a finish, deliberately. Ranking equal wrecks by how far they
 * got was tried as partial credit for getting CLOSE to the next traffic car, and measured
 * worse: peak overtakes dropped from 20/23/18 to 17/10/14 over three runs of 40 races,
 * because the gap is longitudinal and shrinking it rewards the car that charges the row
 * head-on and dies ten pixels deeper over the car that lifts off to set up the lane change
 * that actually passes. A deceptive gradient is worse than no gradient.
 */
const compareRacePerformance = (left: CarStats, right: CarStats, rules: RankingRules): number => {
    const byScore: number = raceScore(right, rules.brakeBonus) - raceScore(left, rules.brakeBonus)
    if (byScore !== 0) {
        return byScore
    }

    // Equal scores can still mean very different races, because the brake bonus is worth
    // ten overtakes: a car that stopped short with the bonus can tie a car that finished
    // without it. The one that finished takes it.
    const leftFinished: boolean = hasClearedCourse(left, rules.trafficCount)
    const rightFinished: boolean = hasClearedCourse(right, rules.trafficCount)
    if (leftFinished !== rightFinished) {
        return leftFinished ? -1 : 1
    }

    return leftFinished ? left.lastOvertakeAtSeconds - right.lastOvertakeAtSeconds : 0
}

const hasRaceResult = (stats: CarStats, brakeBonus: number): boolean =>
    !stats.overtakeTimedOut && raceScore(stats, brakeBonus) > 0

export const selectBest = <T extends { stats: CarStats }>(
    cars: readonly T[],
    rules: RankingRules,
): T | undefined => {
    let best: T | undefined
    for (const car of cars) {
        if (
            hasRaceResult(car.stats, rules.brakeBonus) &&
            (best === undefined || compareRacePerformance(car.stats, best.stats, rules) < 0)
        ) {
            best = car
        }
    }
    return best
}

/**
 * Returns the best eligible overtake results, best first.
 *
 * The sort is stable, which is what "no tie-break below a finish" leaves the ordering to:
 * cars that cannot be told apart keep the order they were given, and since the elite is
 * car 0 that means an unbeaten incumbent stays at the head of its own tie.
 */
export const selectParents = <T extends { stats: CarStats }>(
    cars: readonly T[],
    count: number,
    rules: RankingRules,
): T[] =>
    cars
        .filter((car) => hasRaceResult(car.stats, rules.brakeBonus))
        .sort((left, right) => compareRacePerformance(left.stats, right.stats, rules))
        .slice(0, count)

/** True when the car has not covered enough ground within the idle deadline. */
export const isStuck = (stats: CarStats): boolean =>
    stats.idleSeconds >= SIMULATION.idleTimeoutSeconds

/** True when no new overtake arrived within the configured deadline. */
export const hasMissedOvertakeDeadline = (stats: CarStats): boolean =>
    stats.secondsSinceLastOvertake >= SIMULATION.overtakeTimeoutSeconds
