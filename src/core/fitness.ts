/**
 * Sparse objective: raw overtakes plus one gated brake-discovery bonus. Time breaks ties
 * only between finishers; unfinished ties stay stable. See `failures.md` for rejected
 * reward variants.
 */

import { DEFAULTS, SIMULATION } from '@core/config'
import type { Vec2 } from '@core/geometry'

export type CarStats = {
    readonly startY: number
    /** Furthest forward distance, used only by the idle timeout. */
    groundProgress: number
    overtakes: number
    /** Time when the current overtake count was first reached. */
    lastOvertakeAtSeconds: number
    secondsSinceLastOvertake: number
    /** Missed either deadline: scores zero and cannot be selected as winner or parent. */
    eliminated: boolean
    /** Whether the brake was pressed while moving. */
    usedBrake: boolean
    aliveSeconds: number
    idleSeconds: number
    progressAtIdleReset: number
}

export type FitnessSample = {
    readonly position: Vec2
    readonly overtakes: number
    readonly brake: number
    readonly speed: number
}

export const createStats = (startPosition: Vec2): CarStats => ({
    startY: startPosition.y,
    groundProgress: 0,
    overtakes: 0,
    lastOvertakeAtSeconds: 0,
    secondsSinceLastOvertake: 0,
    eliminated: false,
    usedBrake: false,
    aliveSeconds: 0,
    idleSeconds: 0,
    progressAtIdleReset: 0,
})

/** Updates scoring and timeout counters in place. */
export const updateStats = (stats: CarStats, sample: FitnessSample, dt: number): void => {
    stats.aliveSeconds += dt

    // A brake held at rest must not earn the discovery bonus.
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

export const eliminate = (stats: CarStats): void => {
    stats.eliminated = true
}

/** Empty courses have no finish; otherwise passing all traffic completes the course. */
export const hasClearedCourse = (stats: CarStats, trafficCount: number): boolean =>
    trafficCount > 0 && stats.overtakes >= trafficCount

/** Ranking score. Raw overtakes remain separate because they define course completion. */
export const raceScore = (stats: CarStats, brakeBonus: number = DEFAULTS.brakeBonus): number =>
    stats.eliminated
        ? 0
        : stats.overtakes + (stats.usedBrake && stats.overtakes > 0 ? brakeBonus : 0)

export type RankingRules = {
    readonly brakeBonus: number
    readonly trafficCount: number
}

/**
 * Unfinished ties remain stable: time rewarded faster crashes, while distance-to-next-car
 * partial credit reduced three 40-race peaks from `20/23/18` to `17/10/14`. Finishers
 * still rank by completion time.
 */
const compareRacePerformance = (left: CarStats, right: CarStats, rules: RankingRules): number => {
    const byScore: number = raceScore(right, rules.brakeBonus) - raceScore(left, rules.brakeBonus)
    if (byScore !== 0) {
        return byScore
    }

    // A real finish outranks an equal bonus-adjusted score that stopped short.
    const leftFinished: boolean = hasClearedCourse(left, rules.trafficCount)
    const rightFinished: boolean = hasClearedCourse(right, rules.trafficCount)
    if (leftFinished !== rightFinished) {
        return leftFinished ? -1 : 1
    }

    return leftFinished ? left.lastOvertakeAtSeconds - right.lastOvertakeAtSeconds : 0
}

const hasRaceResult = (stats: CarStats, brakeBonus: number): boolean =>
    !stats.eliminated && raceScore(stats, brakeBonus) > 0

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

/** Returns eligible results best first; unfinished ties preserve input order. */
export const selectParents = <T extends { stats: CarStats }>(
    cars: readonly T[],
    count: number,
    rules: RankingRules,
): T[] =>
    cars
        .filter((car) => hasRaceResult(car.stats, rules.brakeBonus))
        .sort((left, right) => compareRacePerformance(left.stats, right.stats, rules))
        .slice(0, count)

export const isStuck = (stats: CarStats): boolean =>
    stats.idleSeconds >= SIMULATION.idleTimeoutSeconds

export const hasMissedOvertakeDeadline = (stats: CarStats): boolean =>
    stats.secondsSinceLastOvertake >= SIMULATION.overtakeTimeoutSeconds
