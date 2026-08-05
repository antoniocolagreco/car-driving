import { VETERANS } from '@core/config'
import type { Network } from './neural-network'

/**
 * The veterans archive: which networks are remembered, which of them race next, and
 * which are dropped. See `VETERANS` in `config.ts` for why any of this exists; this
 * file is only the mechanism.
 *
 * Pure and stateless. The roster is passed in and a new one is returned, never mutated
 * in place, so `simulation.ts` owns the single copy that is actually live.
 */

/** The archive, ordered by `rankRoster`: whoever should race next comes first. */
export type VeteranRoster = readonly Network[]

/** How many races a network has on record. */
export const raceCount = (network: Network): number => network.history.length

/**
 * The median of a network's raw overtakes across every race it has on record, or 0
 * when it has none.
 *
 * The median rather than the mean because the distribution is what makes this whole
 * problem hard: the same network was measured scoring 12 on one course and 40 on
 * another. A mean is dragged around by both extremes, so a single fortunate layout
 * inflates a network for the rest of its life and a single early crash buries a good
 * one. The median just asks what happens on a typical course, and that is the property
 * being selected for.
 */
export const medianScore = (network: Network): number => {
    const scores: number[] = network.history.map((record) => record.overtakes).sort((a, b) => a - b)
    if (scores.length === 0) {
        return 0
    }
    const middle = Math.floor(scores.length / 2)
    return scores.length % 2 === 1 ? scores[middle] : (scores[middle - 1] + scores[middle]) / 2
}

/** The highest raw overtake count a network has ever managed, or 0 before its first race. */
export const bestScore = (network: Network): number =>
    network.history.reduce((best, record) => Math.max(best, record.overtakes), 0)

/** The lowest raw overtake count on record, or 0 before the first race. */
export const worstScore = (network: Network): number =>
    network.history.length === 0
        ? 0
        : network.history.reduce((worst, record) => Math.min(worst, record.overtakes), Infinity)

/**
 * The fastest course this network ever cleared, or `undefined` if it never has.
 *
 * Only a cleared course carries a time, so this is also the answer to "has it ever
 * actually won one": a network that has never finished has nothing to compare.
 */
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
 * Orders the archive by descending median. That is the whole rule.
 *
 * Newcomers used to be pushed to the front until they had run a few races, on the
 * argument that a median over one race is just that race. The rule turned out to earn
 * nothing: admission already requires finishing in a race's top three, so a newcomer
 * arrives with a good score rather than an unknown one, and if that score was luck its
 * median is corrected the moment it races again. One that was simply weak sinks to the
 * bottom of the standings on its own and is evicted from there.
 *
 * Ties break on the number of races, fewest first, so nothing waits behind an equal peer
 * indefinitely and the least tested of two equals is the one that gets retested.
 */
export const rankRoster = (roster: VeteranRoster): Network[] =>
    [...roster].sort(
        (left, right) =>
            medianScore(right) - medianScore(left) || raceCount(left) - raceCount(right),
    )

/** The archive members that take part in a population of `quantity` cars, best first. */
export const selectRacers = (roster: VeteranRoster, quantity: number): Network[] =>
    rankRoster(roster).slice(0, Math.floor(quantity * VETERANS.racingShare))

/**
 * The archive after a finished race: `admitted` join it, and if that puts it over
 * `rosterSize` the weakest members are dropped until it fits again.
 *
 * Capacity is what drives eviction, rather than a fixed number of departures per race.
 * A fixed number larger than the number of arrivals would empty the archive at a steady
 * rate no matter how good its members were, which is the opposite of remembering them.
 *
 * Whoever holds the lowest median leaves, with no exemption for how recently they
 * arrived. Ties break on the number of races, fewest first: between two members equally
 * weak on the evidence, the one with less evidence behind it is the cheaper to lose.
 */
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

    // The exact reverse of `rankRoster`, so the member evicted first is always the one
    // that ranked last. Taking from the front of this gives the archive back its size
    // while removing the least defensible entries.
    const weakestFirst: Network[] = [...next].sort(
        (left, right) =>
            medianScore(left) - medianScore(right) || raceCount(left) - raceCount(right),
    )

    const dropped = new Set<string>(weakestFirst.slice(0, excess).map((network) => network.id))
    return next.filter((network) => !dropped.has(network.id))
}
