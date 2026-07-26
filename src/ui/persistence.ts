import { CARS_QUANTITY, DEFAULTS, MUTATION } from '@core/config'
import { clamp } from '@core/math'
import { type Network, deserializeNetwork, serializeNetwork } from '@core/neural-network'
import type { SimulationSettings } from '@core/simulation'

/**
 * The only module allowed to touch `localStorage` (see the layering rule in
 * CONTRACTS-2.md: `core/` never does, `app.ts` is the only caller of this file).
 *
 * Every key is suffixed `-v2` except neural-network saves, which use `-v6` so neither
 * an old sensor shape nor the old bipolar brake output is loaded. The module was
 * ported from `src/libs/persistence.ts`, but `deserializeNetwork`'s
 * `undefined` return (version/shape mismatch) is now surfaced as "nothing saved",
 * never logged as an error, and every loaded setting is clamped through the
 * limits in `@core/config` instead of trusted as-is.
 */

const STORAGE_KEYS = {
    champion: 'champion-network-v6',
    backup: 'backup-network-v6',
    carsQuantity: 'cars-quantity-v2',
    mutationRate: 'mutation-rate-v2',
    hiddenLayers: 'hidden-layers-v2',
} as const

/** Settings persisted alongside the champion. */
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

/** Loads the persisted champion network, or `undefined` if there is none (or it no longer deserializes). */
export const loadChampion = (): Network | undefined => readNetwork(STORAGE_KEYS.champion)

/** Persists `network` as the champion carried into the next generation. */
export const saveChampion = (network: Network): void => writeNetwork(STORAGE_KEYS.champion, network)

/** Removes the persisted champion, so the next load starts from a fresh population. */
export const clearChampion = (): void => localStorage.removeItem(STORAGE_KEYS.champion)

/** Loads the user-triggered backup network, or `undefined` if there is none. */
export const loadBackup = (): Network | undefined => readNetwork(STORAGE_KEYS.backup)

/** Persists `network` as a manual backup, independent of the champion slot. */
export const saveBackup = (network: Network): void => writeNetwork(STORAGE_KEYS.backup, network)

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
}
