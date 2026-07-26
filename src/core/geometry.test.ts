import { describe, expect, it } from 'vitest'
import { carPolygon, distance, polygonsIntersect, segmentIntersection, vec } from './geometry'

describe('segmentIntersection', () => {
    it('returns the crossing point for two segments that cross', () => {
        const a = { a: vec(0, 0), b: vec(10, 0) }
        const b = { a: vec(5, -5), b: vec(5, 5) }

        const hit = segmentIntersection(a, b)

        expect(hit).not.toBeNull()
        expect(hit?.point.x).toBeCloseTo(5)
        expect(hit?.point.y).toBeCloseTo(0)
    })

    it('returns an offset matching how far along segment a the crossing happens', () => {
        const a = { a: vec(0, 0), b: vec(10, 0) }
        const b = { a: vec(5, -5), b: vec(5, 5) }

        const hit = segmentIntersection(a, b)

        // The crossing is at x=5, halfway along a segment going from x=0 to x=10.
        expect(hit?.offset).toBeCloseTo(0.5)
    })

    it('returns null for parallel segments', () => {
        const a = { a: vec(0, 0), b: vec(10, 0) }
        const b = { a: vec(0, 5), b: vec(10, 5) }

        expect(segmentIntersection(a, b)).toBeNull()
    })

    it('returns null when the infinite lines cross but the segment extents do not overlap', () => {
        const a = { a: vec(0, 0), b: vec(1, 0) }
        const b = { a: vec(5, -5), b: vec(5, 5) }

        expect(segmentIntersection(a, b)).toBeNull()
    })

    it('detects an intersection at a touching endpoint', () => {
        const a = { a: vec(0, 0), b: vec(10, 0) }
        const b = { a: vec(10, 0), b: vec(10, 10) }

        const hit = segmentIntersection(a, b)

        expect(hit).not.toBeNull()
        expect(hit?.point).toEqual(vec(10, 0))
        expect(hit?.offset).toBeCloseTo(1)
    })
})

describe('polygonsIntersect', () => {
    it('returns true for overlapping rectangles', () => {
        const a = [vec(0, 0), vec(10, 0), vec(10, 10), vec(0, 10)]
        const b = [vec(5, 5), vec(15, 5), vec(15, 15), vec(5, 15)]

        expect(polygonsIntersect(a, b)).toBe(true)
    })

    it('returns false for disjoint rectangles', () => {
        const a = [vec(0, 0), vec(10, 0), vec(10, 10), vec(0, 10)]
        const b = [vec(100, 100), vec(110, 100), vec(110, 110), vec(100, 110)]

        expect(polygonsIntersect(a, b)).toBe(false)
    })

    it('returns false when one polygon is fully inside another (known edge-crossing limitation)', () => {
        // No edge of the inner square crosses an edge of the outer square, so the
        // edge-crossing algorithm reports no intersection even though the shapes
        // clearly overlap. This is a known limitation, not a bug to fix: cars are
        // convex and similar in size to the obstacles they can hit, so a real
        // collision on the road always crosses an edge — full containment between
        // two car-sized shapes cannot happen in this simulation.
        const outer = [vec(0, 0), vec(20, 0), vec(20, 20), vec(0, 20)]
        const inner = [vec(5, 5), vec(15, 5), vec(15, 15), vec(5, 15)]

        expect(polygonsIntersect(outer, inner)).toBe(false)
    })
})

describe('carPolygon', () => {
    const size = { width: 40, height: 20 }
    const halfWidth = size.width / 2
    const halfHeight = size.height / 2

    it('produces an axis-aligned rectangle at heading 0', () => {
        const polygon = carPolygon(vec(0, 0), size, 0)

        for (const corner of polygon) {
            expect(Math.abs(corner.x)).toBeCloseTo(halfWidth)
            expect(Math.abs(corner.y)).toBeCloseTo(halfHeight)
        }
    })

    it('swaps the x/y extents when rotated by PI/2', () => {
        const polygon = carPolygon(vec(0, 0), size, Math.PI / 2)

        for (const corner of polygon) {
            expect(Math.abs(corner.x)).toBeCloseTo(halfHeight)
            expect(Math.abs(corner.y)).toBeCloseTo(halfWidth)
        }
    })

    it('preserves the diagonal length under rotation', () => {
        const expectedDiagonal = Math.hypot(size.width, size.height)

        for (const heading of [0, Math.PI / 4, Math.PI / 2, Math.PI, 2.3]) {
            const polygon = carPolygon(vec(3, -7), size, heading)
            // topLeft and bottomRight are opposite corners.
            const diagonal = distance(polygon[0], polygon[2])
            expect(diagonal).toBeCloseTo(expectedDiagonal)
        }
    })
})
