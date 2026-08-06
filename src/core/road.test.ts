import { describe, expect, it } from 'vitest'
import { createRoad, lanePosition } from './road'

describe('createRoad', () => {
    it('has the two borders sitting exactly at the road edges', () => {
        const road = createRoad()

        for (const border of road.borders) {
            expect(Math.abs(border.a.x)).toBeCloseTo(road.width / 2)
            expect(Math.abs(border.b.x)).toBeCloseTo(road.width / 2)
        }
        const borderXs = road.borders.map((border) => border.a.x).sort((a, b) => a - b)
        expect(borderXs[0]).toBeCloseTo(road.left)
        expect(borderXs[1]).toBeCloseTo(-road.left)
    })
})

describe('lanePosition', () => {
    it('spaces lane centres evenly, all inside the road width', () => {
        const road = createRoad()

        const centres = Array.from(
            { length: road.laneCount },
            (_, lane) => lanePosition(road, lane).x,
        )

        for (let i = 1; i < centres.length; i++) {
            expect(centres[i] - centres[i - 1]).toBeCloseTo(road.laneWidth)
        }
        for (const x of centres) {
            expect(x).toBeGreaterThanOrEqual(road.left)
            expect(x).toBeLessThanOrEqual(road.left + road.width)
        }
    })

    it('clamps an out-of-range lane index to the nearest valid lane', () => {
        const road = createRoad()

        expect(lanePosition(road, -5).x).toBeCloseTo(lanePosition(road, 0).x)
        expect(lanePosition(road, road.laneCount + 5).x).toBeCloseTo(
            lanePosition(road, road.laneCount - 1).x,
        )
    })

    it('shifts y by exactly the given offset', () => {
        const road = createRoad()

        const base = lanePosition(road, 1, 0).y
        const shifted = lanePosition(road, 1, 250).y

        expect(shifted - base).toBeCloseTo(250)
    })
})
