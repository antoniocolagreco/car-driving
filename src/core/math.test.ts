import { describe, expect, it } from 'vitest'
import {
    clamp,
    lerp,
    normalize,
    normalizeWithThreshold,
    toHexDualColorRange,
    weightedAverage,
} from './math'

describe('clamp', () => {
    it('leaves a value inside the range untouched', () => {
        expect(clamp(5, 0, 10)).toBe(5)
    })

    it('clamps a value below the minimum', () => {
        expect(clamp(-5, 0, 10)).toBe(0)
    })

    it('clamps a value above the maximum', () => {
        expect(clamp(15, 0, 10)).toBe(10)
    })
})

describe('lerp', () => {
    it('returns start at t=0', () => {
        expect(lerp(0, 10, 0)).toBe(0)
    })

    it('returns end at t=1', () => {
        expect(lerp(0, 10, 1)).toBe(10)
    })

    it('interpolates at t=0.5', () => {
        expect(lerp(0, 10, 0.5)).toBe(5)
    })
})

describe('normalize', () => {
    it('maps a value proportionally into the target range', () => {
        expect(normalize(5, 0, 10, 0, 100)).toBe(50)
    })

    it('clamps below the target minimum', () => {
        expect(normalize(-5, 0, 10, 0, 100)).toBe(0)
    })

    it('clamps above the target maximum', () => {
        expect(normalize(15, 0, 10, 0, 100)).toBe(100)
    })
})

describe('normalizeWithThreshold', () => {
    it('maps the threshold itself to 0', () => {
        expect(normalizeWithThreshold(0, -5, 10, -1, 1, 0)).toBeCloseTo(0)
    })

    it('maps a negative value between fromMin and the threshold into [toMin, 0]', () => {
        // Halfway between fromMin=-5 and threshold=0 should land halfway between toMin=-1 and 0.
        expect(normalizeWithThreshold(-2.5, -5, 10, -1, 1, 0)).toBeCloseTo(-0.5)
    })

    it('maps a positive value between the threshold and fromMax into [0, toMax]', () => {
        // Halfway between threshold=0 and fromMax=10 should land halfway between 0 and toMax=1.
        expect(normalizeWithThreshold(5, -5, 10, -1, 1, 0)).toBeCloseTo(0.5)
    })
})

describe('weightedAverage', () => {
    it('weighs values equally when weights are equal', () => {
        expect(weightedAverage({ value: 0, weight: 1 }, { value: 10, weight: 1 })).toBe(5)
    })

    it('pulls the result toward the heavier weight', () => {
        const result = weightedAverage({ value: 0, weight: 3 }, { value: 10, weight: 1 })
        expect(result).toBeCloseTo(2.5)
    })
})

describe('toHexDualColorRange', () => {
    it('returns black at zero', () => {
        expect(toHexDualColorRange(0, -10, 10)).toBe('#000000')
    })

    it('returns a shade of red for negative values', () => {
        // -10 is the extreme of the range and maps to intensity 0, so use a
        // mid-range negative value to get a non-zero red channel.
        const color = toHexDualColorRange(-5, -10, 10)
        expect(color.startsWith('#')).toBe(true)
        expect(color.slice(1, 3)).not.toBe('00') // red channel
        expect(color.slice(3, 5)).toBe('00') // green channel
    })

    it('returns a shade of green for positive values', () => {
        const color = toHexDualColorRange(5, -10, 10)
        expect(color.slice(1, 3)).toBe('00') // red channel
        expect(color.slice(3, 5)).not.toBe('00') // green channel
    })
})
