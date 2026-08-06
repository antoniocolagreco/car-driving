import { describe, expect, it } from 'vitest'
import { VETERANS } from '@core/config'
import type { Network, RaceRecord } from './neural-network'
import {
    bestScore,
    bestTime,
    completionRate,
    medianScore,
    rankRoster,
    selectRacers,
    updateRoster,
    worstScore,
} from './veterans'

/** Fixture with unfinished races only. */
const networkWith = (id: string, scores: readonly number[]): Network =>
    ({
        id,
        history: scores.map((overtakes) => ({ overtakes })),
    }) as unknown as Network

const networkWithRaces = (id: string, history: readonly RaceRecord[]): Network =>
    ({ id, history: [...history] }) as unknown as Network

const races = (count: number, finishedCount: number, overtakes: number): RaceRecord[] =>
    Array.from({ length: count }, (_, index) =>
        index < finishedCount ? { overtakes, seconds: 40 + index } : { overtakes },
    )

const idsOf = (roster: readonly Network[]): string[] => roster.map((network) => network.id)

const filler = (count: number, score = 20): Network[] =>
    Array.from({ length: count }, (_, index) =>
        networkWith(`filler-${index}`, [score, score, score]),
    )

describe('medianScore', () => {
    it('is 0 for a network that has never raced', () => {
        expect(medianScore(networkWith('fresh', []))).toBe(0)
    })

    it('takes the middle value of an odd number of races', () => {
        expect(medianScore(networkWith('odd', [12, 40, 22]))).toBe(22)
    })

    it('averages the two middle values of an even number of races', () => {
        expect(medianScore(networkWith('even', [10, 20, 30, 40]))).toBe(25)
    })

    it('ignores a single lucky course that a mean would be dragged up by', () => {
        expect(medianScore(networkWith('lucky', [20, 20, 20, 20, 40]))).toBe(20)
    })
})

describe('completionRate', () => {
    it('is 0 for a network that has never raced', () => {
        expect(completionRate(networkWith('fresh', []))).toBe(0)
    })

    it('is the share of its races that carry a finish time', () => {
        expect(completionRate(networkWithRaces('mixed', races(4, 3, 20)))).toBe(0.75)
    })

    it('is 0 for a network that has raced without ever clearing a course', () => {
        expect(completionRate(networkWith('never-finished', [20, 30, 40]))).toBe(0)
    })
})

describe('rankRoster', () => {
    it('puts the better finisher first, whatever the medians say', () => {
        const roster = [
            networkWithRaces('unfinished', races(10, 5, 30)),
            networkWithRaces('finisher', races(10, 9, 12)),
        ]

        expect(idsOf(rankRoster(roster))).toEqual(['finisher', 'unfinished'])
    })

    it('reads a finish out of an archive saved before the rate existed', () => {
        const roster = [
            networkWith('never-finished', [40, 40, 40, 40]),
            networkWithRaces('finished-once', [{ overtakes: 4, seconds: 51.2 }]),
        ]

        expect(idsOf(rankRoster(roster))).toEqual(['finished-once', 'never-finished'])
    })

    it('falls back to the median between equal finishers', () => {
        const roster = [
            networkWithRaces('lower', races(10, 8, 12)),
            networkWithRaces('higher', races(10, 8, 30)),
        ]

        expect(idsOf(rankRoster(roster))).toEqual(['higher', 'lower'])
    })

    it('orders by descending median', () => {
        const roster = [
            networkWith('weak', [10, 10, 10]),
            networkWith('strong', [30, 30, 30]),
            networkWith('middling', [20, 20, 20]),
        ]

        expect(idsOf(rankRoster(roster))).toEqual(['strong', 'middling', 'weak'])
    })

    it('gives a newcomer with a better median the better place', () => {
        const roster = [networkWith('established', [12, 12, 12, 12]), networkWith('newcomer', [30])]

        expect(idsOf(rankRoster(roster))).toEqual(['newcomer', 'established'])
    })

    it('sends the least-raced of two equal medians out first', () => {
        const roster = [networkWith('twice', [20, 20]), networkWith('once', [20])]

        expect(idsOf(rankRoster(roster))).toEqual(['once', 'twice'])
    })
})

describe('selectRacers', () => {
    it('fills the configured share of the grid, best first', () => {
        const roster = [
            networkWith('best', [30, 30, 30]),
            networkWith('good', [25, 25, 25]),
            networkWith('poor', [5, 5, 5]),
        ]

        expect(idsOf(selectRacers(roster, 20))).toEqual(['best', 'good'])
    })

    it('enters nobody when the population is too small to spare a slot', () => {
        expect(selectRacers(filler(10), 5)).toEqual([])
    })
})

describe('updateRoster', () => {
    it('admits the networks handed to it while there is room', () => {
        const admitted = networkWith('admitted', [18])

        expect(idsOf(updateRoster(filler(3), [admitted]))).toContain('admitted')
    })

    it('never lets the same network in twice', () => {
        const member = networkWith('member', [18, 18, 18])
        const again = networkWith('member', [18, 18, 18])

        expect(updateRoster([member], [again])).toHaveLength(1)
    })

    it('holds the archive at its configured size', () => {
        const full = filler(VETERANS.rosterSize)
        const admitted = [networkWith('a', [30]), networkWith('b', [30]), networkWith('c', [30])]

        expect(updateRoster(full, admitted)).toHaveLength(VETERANS.rosterSize)
    })

    it('drops the lowest medians first', () => {
        const full = [...filler(VETERANS.rosterSize - 1), networkWith('worst', [1, 1, 1])]
        const admitted = networkWith('newcomer', [22])

        expect(idsOf(updateRoster(full, [admitted]))).not.toContain('worst')
    })

    it('evicts a newcomer whose only race is the worst score in the archive', () => {
        const full = filler(VETERANS.rosterSize)
        const unlucky = networkWith('unlucky', [0])

        expect(idsOf(updateRoster(full, [unlucky]))).not.toContain('unlucky')
    })

    it('drops the worst finisher before a lower median that keeps clearing courses', () => {
        const established = Array.from({ length: VETERANS.rosterSize - 2 }, (_, index) =>
            networkWithRaces(`filler-${index}`, races(10, 7, 20)),
        )
        const full = [
            ...established,
            networkWithRaces('unfinished', races(10, 2, 40)),
            networkWithRaces('finisher', races(10, 9, 8)),
        ]

        const kept = idsOf(updateRoster(full, [networkWithRaces('newcomer', races(1, 1, 22))]))

        expect(kept).toContain('finisher')
        expect(kept).not.toContain('unfinished')
    })

    it('drops exactly whoever ranked last', () => {
        const full = [...filler(VETERANS.rosterSize - 1), networkWith('last', [2, 2, 2])]
        const ranked = rankRoster(full)

        const kept = idsOf(updateRoster(full, [networkWith('newcomer', [40])]))

        expect(kept).not.toContain(idsOf(ranked).at(-1))
        expect(kept).toContain('newcomer')
    })
})

describe('the numbers the standings show', () => {
    it('reports the highest and lowest overtake counts on record', () => {
        const network = networkWith('spread', [12, 40, 22])

        expect(bestScore(network)).toBe(40)
        expect(worstScore(network)).toBe(12)
    })

    it('reports zeroes for a network that has never raced', () => {
        const network = networkWith('fresh', [])

        expect(bestScore(network)).toBe(0)
        expect(worstScore(network)).toBe(0)
    })

    it('has no best time until a course is actually cleared', () => {
        expect(bestTime(networkWith('never-finished', [12, 22, 30]))).toBeUndefined()
    })

    it('reports the fastest of several cleared courses', () => {
        const network = {
            id: 'finisher',
            history: [
                { overtakes: 40, seconds: 44.2 },
                { overtakes: 12 },
                { overtakes: 40, seconds: 39.8 },
            ],
        } as unknown as Network

        expect(bestTime(network)).toBe(39.8)
    })
})
