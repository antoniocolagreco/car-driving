import { VETERANS } from '@core/config'
import type { Network } from './neural-network'

/** Pure archive ranking and admission helpers; input rosters are never mutated. */

export type VeteranRoster = readonly Network[]

export const raceCount = (network: Network): number => network.history.length

/** Median raw overtakes, chosen to resist the measured 12-to-40 layout variance. */
export const medianScore = (network: Network): number => {
    const scores: number[] = network.history.map((record) => record.overtakes).sort((a, b) => a - b)
    if (scores.length === 0) {
        return 0
    }
    const middle = Math.floor(scores.length / 2)
    return scores.length % 2 === 1 ? scores[middle] : (scores[middle - 1] + scores[middle]) / 2
}

export const bestScore = (network: Network): number =>
    network.history.reduce((best, record) => Math.max(best, record.overtakes), 0)

export const worstScore = (network: Network): number =>
    network.history.length === 0
        ? 0
        : network.history.reduce((worst, record) => Math.min(worst, record.overtakes), Infinity)

/** Completion share. A recorded finish time is the completion marker. */
export const completionRate = (network: Network): number => {
    if (network.history.length === 0) {
        return 0
    }
    const finished = network.history.filter((record) => record.seconds !== undefined).length
    return finished / network.history.length
}

/** Fastest recorded finish. */
export const bestTime = (network: Network): number | undefined => {
    let fastest: number | undefined
    for (const record of network.history) {
        if (record.seconds !== undefined && (fastest === undefined || record.seconds < fastest)) {
            fastest = record.seconds
        }
    }
    return fastest
}

/**
 * Ranks by completion rate, median overtakes, then fewest races. The last tie-break gives
 * equally ranked but less-tested networks the next retest.
 */
export const rankRoster = (roster: VeteranRoster): Network[] =>
    [...roster].sort(
        (left, right) =>
            completionRate(right) - completionRate(left) ||
            medianScore(right) - medianScore(left) ||
            raceCount(left) - raceCount(right),
    )

export const selectRacers = (roster: VeteranRoster, quantity: number): Network[] =>
    rankRoster(roster).slice(0, Math.floor(quantity * VETERANS.racingShare))

/** Adds unique entrants and evicts the lowest-ranked members above capacity. */
export const updateRoster = (roster: VeteranRoster, admitted: readonly Network[]): Network[] => {
    const next: Network[] = [...roster]
    for (const network of admitted) {
        if (!next.some((member) => member.id === network.id)) {
            next.push(network)
        }
    }

    const excess = next.length - VETERANS.rosterSize
    if (excess <= 0) {
        return next
    }

    // Exact reverse of `rankRoster`: first here is last there.
    const weakestFirst: Network[] = [...next].sort(
        (left, right) =>
            completionRate(left) - completionRate(right) ||
            medianScore(left) - medianScore(right) ||
            raceCount(left) - raceCount(right),
    )

    const dropped = new Set<string>(weakestFirst.slice(0, excess).map((network) => network.id))
    return next.filter((network) => !dropped.has(network.id))
}
