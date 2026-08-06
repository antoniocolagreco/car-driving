import { BRAKE_BONUSES, CARS_QUANTITY, COURSE_INTERVALS, DEFAULTS, MUTATION } from '@core/config'
import { clamp } from '@core/math'
import { type Network, deserializeNetwork, serializeNetwork } from '@core/neural-network'
import type { SimulationSettings } from '@core/simulation'

/** localStorage boundary. Network versions own compatibility; settings are validated on load. */

const STORAGE_KEYS = {
    winner: 'winner-network',
    champion: 'champion-record',
    veterans: 'veterans-roster',
    carsQuantity: 'cars-quantity',
    mutationRate: 'mutation-rate',
    hiddenLayers: 'hidden-layers',
    generationsPerCourse: 'generations-per-course',
    brakeBonus: 'brake-bonus',
} as const

/** Incompatible input layouts are removed instead of inventing migration weights. */
const OBSOLETE_WINNER_KEYS: readonly string[] = ['winner-network-v6', 'champion-network-v6']
const OBSOLETE_CHAMPION_KEYS: readonly string[] = ['champion-record-v2']

export type StoredSettings = SimulationSettings

/** Reads a network; missing and unreadable values both return `undefined`. */
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

export const loadWinner = (): Network | undefined => readNetwork(STORAGE_KEYS.winner)

export const saveWinner = (network: Network): void => {
    writeNetwork(STORAGE_KEYS.winner, network)
    for (const key of OBSOLETE_WINNER_KEYS) {
        localStorage.removeItem(key)
    }
}

export const clearWinner = (): void => {
    localStorage.removeItem(STORAGE_KEYS.winner)
    for (const key of OBSOLETE_WINNER_KEYS) {
        localStorage.removeItem(key)
    }
}

/** Latest finisher and the run that earned the seat; a slower later finish still replaces it. */
export type ChampionRecord = {
    readonly network: Network
    readonly seconds: number
    readonly overtakes: number
}

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

export const clearChampion = (): void => {
    localStorage.removeItem(STORAGE_KEYS.champion)
    for (const key of OBSOLETE_CHAMPION_KEYS) {
        localStorage.removeItem(key)
    }
}

/** Loads valid archive members individually; one malformed entry does not discard the rest. */
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

/** Persists the archive; quota failures leave it alive in memory. */
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

export const clearVeterans = (): void => {
    localStorage.removeItem(STORAGE_KEYS.veterans)
}

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

const readHiddenLayers = (): readonly number[] => {
    const raw = localStorage.getItem(STORAGE_KEYS.hiddenLayers)
    if (!raw) {
        return DEFAULTS.hiddenLayers
    }
    const parsed = raw.split(',').map((part) => Number(part.trim()))
    return parsed.length > 0 && parsed.every(isPositiveInteger) ? parsed : DEFAULTS.hiddenLayers
}

/** Validates list membership rather than clamping; Infinity is a valid interval choice. */
const readGenerationsPerCourse = (): number => {
    const raw = localStorage.getItem(STORAGE_KEYS.generationsPerCourse)
    const stored = raw === null ? Number.NaN : Number(raw)
    return COURSE_INTERVALS.includes(stored) ? stored : DEFAULTS.generationsPerCourse
}

const readBrakeBonus = (): number => {
    const raw = localStorage.getItem(STORAGE_KEYS.brakeBonus)
    const stored = raw === null ? Number.NaN : Number(raw)
    return BRAKE_BONUSES.includes(stored) ? stored : DEFAULTS.brakeBonus
}

/** Loads persisted settings, validating every value against core limits. */
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
    brakeBonus: readBrakeBonus(),
})

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
        localStorage.setItem(
            STORAGE_KEYS.generationsPerCourse,
            String(settings.generationsPerCourse),
        )
    }
    if (settings.brakeBonus !== undefined) {
        localStorage.setItem(STORAGE_KEYS.brakeBonus, String(settings.brakeBonus))
    }
}
