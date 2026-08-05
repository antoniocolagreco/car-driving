import { CARS_QUANTITY, COURSE_INTERVALS, DEFAULTS, MUTATION } from '@core/config'
import { clamp } from '@core/math'
import { type Network, deserializeNetwork, serializeNetwork } from '@core/neural-network'
import type { SimulationSettings } from '@core/simulation'

/**
 * The only module allowed to touch `localStorage`: `core/` never does, and `app.ts` is
 * the only caller of this file.
 *
 * Storage key names stay stable; compatibility belongs to the serialized network's
 * internal format version, not to the key that contains it. `deserializeNetwork`'s
 * `undefined` return (version/shape mismatch) is surfaced as "nothing saved", never
 * logged as an error, and every loaded setting is clamped through the limits in
 * `@core/config` instead of trusted as-is.
 */

const STORAGE_KEYS = {
    winner: 'winner-network',
    /** The champion: the last network to finish a course, with the run that earned it. */
    champion: 'champion-record',
    /** The veterans archive, with each member's race history. */
    veterans: 'veterans-roster',
    carsQuantity: 'cars-quantity',
    mutationRate: 'mutation-rate',
    hiddenLayers: 'hidden-layers',
    generationsPerCourse: 'generations-per-course',
} as const

/**
 * Obsolete saves cannot consume the temporal input. They are removed on the next write
 * or explicit reset rather than migrated with an invented weight that would silently
 * change the saved policy.
 */
const OBSOLETE_WINNER_KEYS: readonly string[] = ['winner-network-v6', 'champion-network-v6']
const OBSOLETE_CHAMPION_KEYS: readonly string[] = ['champion-record-v2']

/** Settings persisted alongside the winner. */
export type StoredSettings = SimulationSettings

/** Reads and parses a network from `key`. `undefined` covers "nothing there" and "unreadable" alike. */
const readNetwork = (key: string): Network | undefined => {
    const raw = localStorage.getItem(key)
    if (!raw) {
        return undefined
    }
    try {
        const data: unknown = JSON.parse(raw)
        return deserializeNetwork(data)
    } catch {
        return undefined
    }
}

const writeNetwork = (key: string, network: Network): void => {
    localStorage.setItem(key, JSON.stringify(serializeNetwork(network)))
}

/** Loads the persisted winner network, or `undefined` if there is none (or it no longer deserializes). */
export const loadWinner = (): Network | undefined => readNetwork(STORAGE_KEYS.winner)

/** Persists `network` as the winner carried into the next generation. */
export const saveWinner = (network: Network): void => {
    writeNetwork(STORAGE_KEYS.winner, network)
    for (const key of OBSOLETE_WINNER_KEYS) {
        localStorage.removeItem(key)
    }
}

/** Removes the persisted winner, so the next load starts from a fresh population. */
export const clearWinner = (): void => {
    localStorage.removeItem(STORAGE_KEYS.winner)
    for (const key of OBSOLETE_WINNER_KEYS) {
        localStorage.removeItem(key)
    }
}

/**
 * The champion: the most recent network to clear a course, kept with the run that earned
 * it. Unlike the winner, this one is never overwritten by an ordinary round, only by
 * another finish, so it survives every generation in between.
 *
 * The seconds are a description of that run, not a qualification for the seat: a slower
 * finish still takes it. See `onCourseFinished` in `app.ts`.
 */
export type ChampionRecord = {
    readonly network: Network
    /** Race seconds from the start line to passing the last traffic car. */
    readonly seconds: number
    /** Traffic cars passed on that run, which for a finished course is the whole field. */
    readonly overtakes: number
}

/** Loads the champion, or `undefined` when nobody has finished a course yet. */
export const loadChampion = (): ChampionRecord | undefined => {
    const raw = localStorage.getItem(STORAGE_KEYS.champion)
    if (!raw) {
        return undefined
    }
    try {
        const data: unknown = JSON.parse(raw)
        if (typeof data !== 'object' || data === null) {
            return undefined
        }
        const { network, seconds, overtakes } = data as {
            network?: unknown
            seconds?: unknown
            overtakes?: unknown
        }
        const deserialized = deserializeNetwork(network)
        // A record without its time is not a record: it could never be beaten fairly.
        if (!deserialized || typeof seconds !== 'number' || !Number.isFinite(seconds)) {
            return undefined
        }
        return {
            network: deserialized,
            seconds,
            overtakes: typeof overtakes === 'number' && Number.isFinite(overtakes) ? overtakes : 0,
        }
    } catch {
        return undefined
    }
}

/** Persists `record` as the new champion, replacing whatever held the seat before it. */
export const saveChampion = (record: ChampionRecord): void => {
    localStorage.setItem(
        STORAGE_KEYS.champion,
        JSON.stringify({
            network: serializeNetwork(record.network),
            seconds: record.seconds,
            overtakes: record.overtakes,
        }),
    )
    for (const key of OBSOLETE_CHAMPION_KEYS) {
        localStorage.removeItem(key)
    }
}

/** Removes the champion, used on Reset and when its architecture no longer fits the settings. */
export const clearChampion = (): void => {
    localStorage.removeItem(STORAGE_KEYS.champion)
    for (const key of OBSOLETE_CHAMPION_KEYS) {
        localStorage.removeItem(key)
    }
}

/**
 * Loads the veterans archive, or an empty roster when there is none.
 *
 * Members that no longer deserialize are dropped individually rather than taking the
 * archive down with them: a hundred networks accumulated over a long run are worth more
 * than the tidiness of an all-or-nothing load.
 */
export const loadVeterans = (): Network[] => {
    const raw = localStorage.getItem(STORAGE_KEYS.veterans)
    if (!raw) {
        return []
    }
    try {
        const data: unknown = JSON.parse(raw)
        if (!Array.isArray(data)) {
            return []
        }
        const roster: Network[] = []
        for (const entry of data) {
            const network = deserializeNetwork(entry)
            if (network) {
                roster.push(network)
            }
        }
        return roster
    } catch {
        return []
    }
}

/**
 * Persists the archive.
 *
 * A hundred networks at two stored decimals is a few hundred kilobytes, which
 * localStorage holds comfortably but will not swallow silently if the numbers ever
 * change: a quota failure leaves the previous save in place and is not worth taking the
 * simulation down over, so it is swallowed here and the archive lives on in memory.
 */
export const saveVeterans = (roster: readonly Network[]): void => {
    try {
        localStorage.setItem(
            STORAGE_KEYS.veterans,
            JSON.stringify(roster.map((network) => serializeNetwork(network))),
        )
    } catch {
        return
    }
}

/** Empties the archive, so a reset starts from no remembered networks at all. */
export const clearVeterans = (): void => {
    localStorage.removeItem(STORAGE_KEYS.veterans)
}

/** Reads a number from `key`, falling back to `fallback` when absent or not finite. */
const readNumber = (key: string, fallback: number): number => {
    const raw = localStorage.getItem(key)
    if (raw === null) {
        return fallback
    }
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : fallback
}

const isPositiveInteger = (value: number): boolean =>
    Number.isFinite(value) && Number.isInteger(value) && value > 0

/** Reads the hidden-layers list, falling back to the default when missing or malformed. */
const readHiddenLayers = (): readonly number[] => {
    const raw = localStorage.getItem(STORAGE_KEYS.hiddenLayers)
    if (!raw) {
        return DEFAULTS.hiddenLayers
    }
    const parsed = raw.split(',').map((part) => Number(part.trim()))
    return parsed.length > 0 && parsed.every(isPositiveInteger) ? parsed : DEFAULTS.hiddenLayers
}

/**
 * The course interval is a choice from a fixed list, not a range, so it is checked for
 * membership rather than clamped: a stored 7 is not "close enough to 5", it is a value
 * the slider could never have produced and has to fall back to the default.
 *
 * Parsed here rather than through `readNumber`, which rejects anything non-finite, and
 * `Infinity` (the "never randomise the course" setting) is exactly that. Membership in
 * `COURSE_INTERVALS` is the whole validation this value needs.
 */
const readGenerationsPerCourse = (): number => {
    const raw = localStorage.getItem(STORAGE_KEYS.generationsPerCourse)
    const stored = raw === null ? Number.NaN : Number(raw)
    return COURSE_INTERVALS.includes(stored) ? stored : DEFAULTS.generationsPerCourse
}

/**
 * Loads every persisted setting, each clamped through its limits in `@core/config`
 * so a hand-edited or stale `localStorage` entry can never produce an out-of-range
 * simulation. The paused state is deliberately not part of this: a fresh page load
 * always starts running.
 */
export const loadSettings = (): StoredSettings => ({
    carsQuantity: clamp(
        readNumber(STORAGE_KEYS.carsQuantity, DEFAULTS.carsQuantity),
        CARS_QUANTITY.min,
        CARS_QUANTITY.max,
    ),
    mutationRate: clamp(
        readNumber(STORAGE_KEYS.mutationRate, DEFAULTS.mutationRate),
        MUTATION.minRate,
        MUTATION.maxRate,
    ),
    hiddenLayers: readHiddenLayers(),
    generationsPerCourse: readGenerationsPerCourse(),
})

/** Persists whichever fields of `settings` are present, leaving the rest untouched. */
export const saveSettings = (settings: Partial<StoredSettings>): void => {
    if (settings.carsQuantity !== undefined) {
        localStorage.setItem(STORAGE_KEYS.carsQuantity, String(settings.carsQuantity))
    }
    if (settings.mutationRate !== undefined) {
        localStorage.setItem(STORAGE_KEYS.mutationRate, String(settings.mutationRate))
    }
    if (settings.hiddenLayers !== undefined) {
        localStorage.setItem(STORAGE_KEYS.hiddenLayers, settings.hiddenLayers.join(','))
    }
    if (settings.generationsPerCourse !== undefined) {
        // `String(Infinity)` is `"Infinity"`, which `Number` reads back unchanged. The
        // "never randomise" setting therefore survives a reload like any other.
        localStorage.setItem(
            STORAGE_KEYS.generationsPerCourse,
            String(settings.generationsPerCourse),
        )
    }
}
