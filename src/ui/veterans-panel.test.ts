import { describe, expect, it } from 'vitest'
import { compareValues } from './veterans-panel'

describe('compareValues', () => {
    it('orders numbers smallest first when ascending', () => {
        expect([3, 1, 2].sort((a, b) => compareValues(a, b, true))).toEqual([1, 2, 3])
    })

    it('orders numbers largest first when descending', () => {
        expect([3, 1, 2].sort((a, b) => compareValues(a, b, false))).toEqual([3, 2, 1])
    })

    it('orders text alphabetically when ascending', () => {
        expect(['c', 'a', 'b'].sort((a, b) => compareValues(a, b, true))).toEqual(['a', 'b', 'c'])
    })

    // A missing best time means the network never cleared a course. Sorting those to the
    // top would bury every network that has a time under every network that has none,
    // which is the opposite of what somebody sorting by best time is looking for.
    it('keeps missing values last in both directions', () => {
        const values: (number | undefined)[] = [undefined, 30, undefined, 10]

        expect([...values].sort((a, b) => compareValues(a, b, true))).toEqual([
            10,
            30,
            undefined,
            undefined,
        ])
        expect([...values].sort((a, b) => compareValues(a, b, false))).toEqual([
            30,
            10,
            undefined,
            undefined,
        ])
    })
})
