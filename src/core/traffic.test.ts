import { describe, expect, it } from 'vitest'
import { polygonsIntersect } from '@core/geometry'
import { SIMULATION } from '@core/config'
import { carShape } from './car'
import { type Road, createRoad, lanePosition } from './road'
import { type TrafficPattern, TRAFFIC_PATTERNS, generateTraffic } from './traffic'

/** Finds the lane whose centre is closest to `x`, to recover a car's lane from its position. */
const nearestLane = (road: Road, x: number): number => {
    let closestLane = 0
    let closestDistance = Infinity
    for (let lane = 0; lane < road.laneCount; lane++) {
        const distance = Math.abs(lanePosition(road, lane).x - x)
        if (distance < closestDistance) {
            closestDistance = distance
            closestLane = lane
        }
    }
    return closestLane
}

/**
 * Re-derives which `TrafficPattern` produced each row of generated traffic, purely
 * from car positions. Row spacing (400px) is far larger than any pattern's internal
 * stagger (at most 100px), so a row index and each car's offset within it can be
 * recovered unambiguously.
 */
const identifyPatternPerRow = (
    road: Road,
    traffic: ReturnType<typeof generateTraffic>,
    rows: number,
) => {
    const base = lanePosition(road, 0, 0).y
    const rowsOfCars: { lane: number; offset: number }[][] = Array.from({ length: rows }, () => [])

    for (const car of traffic) {
        const rowIndexPlusOne = Math.round((base - car.position.y) / SIMULATION.trafficRowSpacing)
        const rowIndex = rowIndexPlusOne - 1
        const rowOffsetBase = base - SIMULATION.trafficRowSpacing * rowIndexPlusOne
        const relativeOffset = Math.round(car.position.y - rowOffsetBase)
        rowsOfCars[rowIndex]?.push({
            lane: nearestLane(road, car.position.x),
            offset: relativeOffset,
        })
    }

    const byLaneThenOffset = (
        a: { lane: number; offset: number },
        b: { lane: number; offset: number },
    ) => a.lane - b.lane || a.offset - b.offset

    return rowsOfCars.map((cars) => {
        const sortedCars = [...cars].sort(byLaneThenOffset)
        const match = TRAFFIC_PATTERNS.find((pattern) => {
            if (pattern.cars.length !== sortedCars.length) {
                return false
            }
            const sortedPattern = [...pattern.cars].sort(byLaneThenOffset)
            return sortedPattern.every(
                (spot, index) =>
                    spot.lane === sortedCars[index].lane &&
                    spot.offset === sortedCars[index].offset,
            )
        })
        return match?.name
    })
}

describe('generateTraffic', () => {
    it('produces an identical layout for the same seed', () => {
        const road = createRoad()

        const first = generateTraffic(road, 20, 'layout-seed')
        const second = generateTraffic(road, 20, 'layout-seed')

        expect(second.map((car) => car.position)).toEqual(first.map((car) => car.position))
    })

    it('produces a different layout for a different seed', () => {
        const road = createRoad()

        const a = generateTraffic(road, 20, 'seed-a')
        const b = generateTraffic(road, 20, 'seed-b')

        expect(b.map((car) => car.position)).not.toEqual(a.map((car) => car.position))
    })

    it('places every car within the road bounds and in a valid lane', () => {
        const road = createRoad()
        const traffic = generateTraffic(road, 20, 'bounds-seed')
        const laneCentres = Array.from(
            { length: road.laneCount },
            (_, lane) => lanePosition(road, lane).x,
        )

        for (const car of traffic) {
            expect(car.position.x).toBeGreaterThanOrEqual(road.left)
            expect(car.position.x).toBeLessThanOrEqual(road.left + road.width)
            expect(laneCentres.some((x) => Math.abs(x - car.position.x) < 0.001)).toBe(true)
        }
    })

    it('never places two traffic cars overlapping each other', () => {
        const road = createRoad()
        const traffic = generateTraffic(road, 20, 'overlap-seed')

        for (let i = 0; i < traffic.length; i++) {
            for (let j = i + 1; j < traffic.length; j++) {
                expect(polygonsIntersect(carShape(traffic[i]), carShape(traffic[j]))).toBe(false)
            }
        }
    })

    it('creates every traffic car rolling forward at full throttle', () => {
        const road = createRoad()
        const traffic = generateTraffic(road, 20, 'throttle-seed')

        for (const car of traffic) {
            expect(car.controls.throttle).toBe(1)
            expect(car.controls.steering).toBe(0)
        }
    })

    it('covers every pattern of each difficulty within its own course section', () => {
        const road = createRoad()
        // 40 rows: divisible by 4, and each resulting section (10 rows) is bigger
        // than every difficulty's pattern count, so section boundaries line up
        // exactly with quarters of the course.
        const rows = 40
        const traffic = generateTraffic(road, rows, 'coverage-seed')
        const patternPerRow = identifyPatternPerRow(road, traffic, rows)

        const sectionSize = rows / 4
        const sections: Record<TrafficPattern['difficulty'], (string | undefined)[]> = {
            easy: patternPerRow.slice(0, sectionSize),
            medium: patternPerRow.slice(sectionSize, sectionSize * 2),
            hard: patternPerRow.slice(sectionSize * 2, sectionSize * 3),
            veryHard: patternPerRow.slice(sectionSize * 3, sectionSize * 4),
        }

        for (const difficulty of ['easy', 'medium', 'hard', 'veryHard'] as const) {
            const expectedNames = TRAFFIC_PATTERNS.filter(
                (pattern) => pattern.difficulty === difficulty,
            ).map((pattern) => pattern.name)
            for (const name of expectedNames) {
                expect(sections[difficulty]).toContain(name)
            }
        }
    })
})
