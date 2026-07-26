/**
 * Sparse race objective: passing traffic is the only source of fitness.
 *
 * Progress is still measured for the idle death timeout, and elapsed time is still
 * measured for the overtake death timeout. Neither contributes points. A collision
 * removes a speed-dependent fraction of the earned overtake score. A timeout applies
 * the same fraction as a maximum-speed impact; no other event changes fitness.
 */

import { PENALTY, REWARD, SIMULATION } from '@core/config'
import type { Vec2 } from '@core/geometry'
import { clamp, lerp } from '@core/math'

/** The only reward contribution and its total, kept explicit for the HUD. */
export type FitnessBreakdown = {
    overtakes: number
    /** Negative fraction of the overtake reward removed by a collision or timeout. */
    crash: number
    total: number
}

/** Runtime counters for one car's current race. */
export type CarStats = {
    /** World-space y at the start of the race. */
    readonly startY: number
    /** Furthest forward distance reached, used exclusively by the idle timeout. */
    groundProgress: number
    /** Maximum number of traffic cars left behind during this race. */
    overtakes: number
    /** Race time when the current overtake maximum was first reached. */
    lastOvertakeAtSeconds: number
    /** Time since the most recent overtake, used exclusively by the overtake timeout. */
    secondsSinceLastOvertake: number
    /** A timed-out result cannot be selected as winner or parent. */
    overtakeTimedOut: boolean
    /** Whether either death timeout retired this car. */
    timedOut: boolean
    /** Elapsed race time, needed to timestamp overtakes. */
    aliveSeconds: number
    /** Time since enough ground progress was last made. */
    idleSeconds: number
    /** Ground-progress baseline from which the idle threshold is measured. */
    progressAtIdleReset: number
    /** Whether this run ended in a physical collision. */
    crashed: boolean
    /** Absolute impact speed divided by the car's maximum speed. */
    impactSpeedRatio: number
    /** Cached sparse fitness. */
    fitness: number
    breakdown: FitnessBreakdown
}

/** The observations required by scoring and the two death timeouts. */
export type FitnessSample = {
    readonly position: Vec2
    readonly overtakes: number
}

const ZERO_BREAKDOWN: FitnessBreakdown = {
    overtakes: 0,
    crash: 0,
    total: 0,
}

export const createStats = (startPosition: Vec2): CarStats => ({
    startY: startPosition.y,
    groundProgress: 0,
    overtakes: 0,
    lastOvertakeAtSeconds: 0,
    secondsSinceLastOvertake: 0,
    overtakeTimedOut: false,
    timedOut: false,
    aliveSeconds: 0,
    idleSeconds: 0,
    progressAtIdleReset: 0,
    crashed: false,
    impactSpeedRatio: 0,
    fitness: 0,
    breakdown: ZERO_BREAKDOWN,
})

/** Updates sparse fitness and the independent timeout counters. Mutates `stats`. */
export const updateStats = (stats: CarStats, sample: FitnessSample, dt: number): void => {
    stats.aliveSeconds += dt

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

    stats.breakdown = computeFitness(stats)
    stats.fitness = stats.breakdown.total
}

/** Records an impact and reapplies the sole penalty to the earned overtake score. */
export const recordCrash = (stats: CarStats, impactSpeedRatio: number): void => {
    stats.crashed = true
    stats.impactSpeedRatio = clamp(impactSpeedRatio, 0, 1)
    stats.breakdown = computeFitness(stats)
    stats.fitness = stats.breakdown.total
}

/** Applies the maximum 90% failure penalty for either death timeout. */
export const recordTimeout = (stats: CarStats): void => {
    stats.timedOut = true
    stats.breakdown = computeFitness(stats)
    stats.fitness = stats.breakdown.total
}

/** Marks a missed overtake deadline as ineligible and applies the timeout penalty. */
export const recordOvertakeTimeout = (stats: CarStats): void => {
    stats.overtakeTimedOut = true
    recordTimeout(stats)
}

/** Overtakes are the only reward; collision speed or a timeout determines the only penalty. */
export const computeFitness = (stats: CarStats): FitnessBreakdown => {
    const overtakes: number = stats.overtakes * REWARD.overtake
    const impactPenalty: number = stats.crashed
        ? lerp(PENALTY.crashAtMinimumSpeed, PENALTY.crashAtMaximumSpeed, stats.impactSpeedRatio)
        : 0
    const penaltyFraction: number = stats.timedOut
        ? Math.max(impactPenalty, PENALTY.crashAtMaximumSpeed)
        : impactPenalty
    const crash: number = penaltyFraction > 0 ? -overtakes * penaltyFraction : 0
    return { overtakes, crash, total: overtakes + crash }
}

/**
 * More overtakes always win. At equal counts, residual fitness after the failure
 * penalty comes next, then the earlier overtake time as a deterministic tie-breaker.
 * Overtake-timed-out cars and cars with zero overtakes are excluded.
 */
const compareRacePerformance = (left: CarStats, right: CarStats): number =>
    right.overtakes - left.overtakes ||
    right.fitness - left.fitness ||
    left.lastOvertakeAtSeconds - right.lastOvertakeAtSeconds

const hasRaceResult = (stats: CarStats): boolean => !stats.overtakeTimedOut && stats.overtakes > 0

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
