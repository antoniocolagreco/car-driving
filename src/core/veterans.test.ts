import { describe, expect, it } from 'vitest'
import { VETERANS } from '@core/config'
import type { Network } from './neural-network'
import { medianScore, rankRoster, selectRacers, updateRoster } from './veterans'

/** A network stripped to what the archive actually reads: an identity and a record. */
const networkWith = (id: string, scores: readonly number[]): Network =>
    ({
        id,
        history: scores.map((overtakes) => ({ overtakes })),
    }) as unknown as Network

const idsOf = (roster: readonly Network[]): string[] => roster.map((network) => network.id)

/** `count` distinct established members, all with the same unremarkable record. */
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

    // The whole reason the archive ranks on the median: one 40 taken on an easy course
    // must not promote a network that does 20 on everything else.
    it('ignores a single lucky course that a mean would be dragged up by', () => {
        expect(medianScore(networkWith('lucky', [20, 20, 20, 20, 40]))).toBe(20)
    })
})

describe('rankRoster', () => {
    it('puts networks that have not served their probation ahead of everybody', () => {
        const roster = [networkWith('established', [38, 38, 38, 38]), networkWith('newcomer', [3])]

        expect(idsOf(rankRoster(roster))).toEqual(['newcomer', 'established'])
    })

    it('orders established members by descending median', () => {
        const roster = [
            networkWith('weak', [10, 10, 10]),
            networkWith('strong', [30, 30, 30]),
            networkWith('middling', [20, 20, 20]),
        ]

        expect(idsOf(rankRoster(roster))).toEqual(['strong', 'middling', 'weak'])
    })

    it('sends the least-raced of two equal probationers out first', () => {
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

    // The rule that makes the median mean anything: a newcomer is admitted on one race,
    // and one race is not evidence. Without this a good network admitted on a hard course
    // would be evicted on the way in, having scored less than a hundred established
    // members whose numbers came from courses it never drove.
    it('keeps a probationer even when its single race is the worst score in the archive', () => {
        const full = filler(VETERANS.rosterSize)
        const unlucky = networkWith('unlucky', [0])

        expect(idsOf(updateRoster(full, [unlucky]))).toContain('unlucky')
    })

    // Not a contradiction of the rule above: probationers go last in the eviction order,
    // not out of it. An archive that could never evict them would grow without limit
    // whenever members arrive faster than the grid can put them through probation.
    it('evicts probationers rather than let the archive grow past its size', () => {
        const full = Array.from({ length: VETERANS.rosterSize }, (_, index) =>
            networkWith(`probationer-${index}`, [10]),
        )

        expect(updateRoster(full, [networkWith('newcomer', [10])])).toHaveLength(
            VETERANS.rosterSize,
        )
    })
})
