import { describe, expect, it } from 'vitest'
import { createRandom } from './random'

describe('createRandom', () => {
    it('produces the same sequence of next() values for the same numeric seed', () => {
        const first = createRandom(42)
        const second = createRandom(42)

        const firstSequence = [first.next(), first.next(), first.next()]
        const secondSequence = [second.next(), second.next(), second.next()]

        expect(firstSequence).toEqual(secondSequence)
    })

    it('produces the same sequence of next() values for the same string seed', () => {
        const first = createRandom('road-layout')
        const second = createRandom('road-layout')

        const firstSequence = [first.next(), first.next(), first.next()]
        const secondSequence = [second.next(), second.next(), second.next()]

        expect(firstSequence).toEqual(secondSequence)
    })

    it('diverges for different seeds', () => {
        const a = createRandom(1)
        const b = createRandom(2)

        expect(a.next()).not.toBe(b.next())
    })

    it('accepts both string and numeric seeds', () => {
        expect(() => createRandom('some-seed').next()).not.toThrow()
        expect(() => createRandom(123).next()).not.toThrow()
    })

    it('keeps nextInt within the requested bounds', () => {
        const random = createRandom('bounds-check')

        for (let i = 0; i < 200; i++) {
            const value = random.nextInt(5, 10)
            expect(value).toBeGreaterThanOrEqual(5)
            expect(value).toBeLessThan(10)
        }
    })

    it('shuffle returns a permutation containing the same items', () => {
        const random = createRandom('shuffle-seed')
        const items = [1, 2, 3, 4, 5]

        const shuffled = random.shuffle(items)

        expect(shuffled).toHaveLength(items.length)
        expect([...shuffled].sort()).toEqual([...items].sort())
    })

    it('shuffle does not mutate the input array', () => {
        const random = createRandom('shuffle-seed')
        const items = [1, 2, 3, 4, 5]
        const copy = [...items]

        random.shuffle(items)

        expect(items).toEqual(copy)
    })
})
