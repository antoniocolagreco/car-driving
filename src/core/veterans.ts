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

/** True while a network has too few races for its median to mean anything. */
export const isProvisional = (network: Network): boolean =>
    raceCount(network) < VETERANS.provisionalRaces

/**
 * Orders the archive: provisional members first, then by descending median.
 *
 * Provisional members go first because they are the ones whose number is not yet worth
 * anything, and racing is the only thing that fixes that. It also closes the hole that
 * would otherwise sink the archive: a member that never races keeps whatever median it
 * entered with, so if the track slots always went to the current best medians, an entry
 * admitted on one lucky 40 would sit at the top untested forever while the veterans
 * that do race have their numbers honestly pulled down by hard courses.
 *
 * Ties break on the number of races, fewest first, so nothing waits behind an equal
 * peer indefinitely.
 */
export const rankRoster = (roster: VeteranRoster): Network[] =>
    [...roster].sort((left, right) => {
        const leftProvisional = isProvisional(left)
        if (leftProvisional !== isProvisional(right)) {
            return leftProvisional ? -1 : 1
        }
        return medianScore(right) - medianScore(left) || raceCount(left) - raceCount(right)
    })

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
 * Provisional members go last in the eviction order, so in normal running they are
 * never touched: they are only in the archive because nobody knows yet whether they are
 * any good, and dropping them on a median taken from one race is exactly the mistake
 * this whole mechanism exists to prevent. They are not immune, though. A population
 * small enough to offer one track slot per generation admits members faster than it can
 * put them through their probation, and a rule that refused to evict them at all would
 * let the archive grow without limit. The cap always holds.
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

    // Established members ranked by their median, weakest first, then the provisional
    // ones with the least evidence behind them. Taking from the front of that gives the
    // archive back its size while removing the least defensible entries.
    const established: Network[] = next
        .filter((network) => !isProvisional(network))
        .sort((left, right) => medianScore(left) - medianScore(right))
    const probationers: Network[] = next
        .filter(isProvisional)
        .sort((left, right) => raceCount(left) - raceCount(right))

    const dropped = new Set<string>(
        [...established, ...probationers].slice(0, excess).map((network) => network.id),
    )
    return next.filter((network) => !dropped.has(network.id))
}
