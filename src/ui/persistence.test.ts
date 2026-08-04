import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Network, createNetwork } from '@core/neural-network'
import {
    type ChampionRecord,
    type StoredSettings,
    saveChampion,
    saveSettings,
    saveWinner,
} from './persistence'

const values: Map<string, string> = new Map()

const storage: Storage = {
    get length(): number {
        return values.size
    },
    clear(): void {
        values.clear()
    },
    getItem(key: string): string | null {
        return values.get(key) ?? null
    },
    key(index: number): string | null {
        return [...values.keys()][index] ?? null
    },
    removeItem(key: string): void {
        values.delete(key)
    },
    setItem(key: string, value: string): void {
        values.set(key, value)
    },
}

describe('persistence storage keys', () => {
    beforeEach(() => {
        values.clear()
        vi.stubGlobal('localStorage', storage)
    })

    it('uses stable unversioned keys while the network payload keeps its own version', () => {
        const network: Network = createNetwork([2, 3])
        const champion: ChampionRecord = { network, seconds: 12.5, overtakes: 20 }
        const settings: StoredSettings = {
            carsQuantity: 80,
            mutationRate: 0.1,
            hiddenLayers: [16, 12, 8],
        }

        saveWinner(network)
        saveChampion(champion)
        saveSettings(settings)

        expect([...values.keys()].sort()).toEqual([
            'cars-quantity',
            'champion-record',
            'hidden-layers',
            'mutation-rate',
            'winner-network',
        ])
        const winnerPayload: unknown = JSON.parse(values.get('winner-network') ?? '{}')
        expect((winnerPayload as { version?: unknown }).version).toBe(8)
    })
})
