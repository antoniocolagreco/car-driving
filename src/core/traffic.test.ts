import { describe, expect, it } from 'vitest'
import { RACING_CAR, SIMULATION, TRAFFIC_CAR } from '@core/config'
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
 * Re-derives which `TrafficPattern` produced each row of generated traffic, purely from
 * car positions.
 *
 * Rows are found by clustering rather than by dividing through a fixed pitch, because
 * there is no fixed pitch: `generateTraffic` measures its gaps from the deepest car of
 * each row, so a staggered row pushes the next one further away. A row spans at most
 * 120 px of its own while the clear road between rows is 500, so any gap over 300
 * separates two rows and nothing else can.
 */
const identifyPatternPerRow = (road: Road, traffic: ReturnType<typeof generateTraffic>) => {
    const ROW_GAP_THRESHOLD = 300
    // Nearest the start line first: forward is -y, so that is descending y.
    const byDepth = [...traffic].sort((a, b) => b.position.y - a.position.y)

    const rowsOfCars: { lane: number; offset: number }[][] = []
    let rowLine = 0

    for (const car of byDepth) {
        const current = rowsOfCars[rowsOfCars.length - 1]
        if (!current || rowLine - car.position.y > ROW_GAP_THRESHOLD) {
            rowLine = car.position.y
            rowsOfCars.push([])
        }
        rowsOfCars[rowsOfCars.length - 1].push({
            lane: nearestLane(road, car.position.x),
            offset: Math.round(car.position.y - rowLine),
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

    // The rule the whole layout rests on: what a car is given is CLEAR ROAD, and a row
    // that stands two cars deep must not pay for its own depth out of the gap behind it.
    it('leaves the same clear road after a staggered row as after a flat one', () => {
        const road = createRoad()
        const traffic = generateTraffic(road, 20, 'staggered-gaps')

        // Nearest the start line first, one entry per distinct depth.
        const depths = [...new Set(traffic.map((car) => Math.round(car.position.y)))].sort(
            (a, b) => b - a,
        )

        // A row spans at most 120 px of its own and the gap between rows is 500, so any
        // step larger than that threshold is the boundary between two rows.
        const gaps: number[] = []
        for (let index = 1; index < depths.length; index++) {
            const step = depths[index - 1] - depths[index]
            if (step > 300) {
                gaps.push(step)
            }
        }

        expect(gaps.length).toBeGreaterThan(10)
        for (const gap of gaps) {
            expect(gap).toBe(SIMULATION.trafficRowSpacing)
        }
    })

    it('gives two patterns the same kind exactly when they leave the same lanes open', () => {
        // The whole generation rule rests on this: a kind stands for the gap a row
        // leaves, so "a different kind than the row before" means "a different gap".
        const openLanes = (pattern: TrafficPattern): string =>
            [0, 1, 2].filter((lane) => !pattern.cars.some((spot) => spot.lane === lane)).join(',')

        for (const left of TRAFFIC_PATTERNS) {
            for (const right of TRAFFIC_PATTERNS) {
                expect({
                    pair: `${left.name}/${right.name}`,
                    sameKind: left.kind === right.kind,
                }).toEqual({
                    pair: `${left.name}/${right.name}`,
                    sameKind: openLanes(left) === openLanes(right),
                })
            }
        }
    })

    it('never leaves the same gap open in two consecutive rows', () => {
        const road = createRoad()
        const rows = 20
        const kindOf = (name: string | undefined): string | undefined =>
            TRAFFIC_PATTERNS.find((pattern) => pattern.name === name)?.kind

        for (let seed = 0; seed < 100; seed++) {
            const traffic = generateTraffic(road, rows, `no-repeat-${seed}`)
            const kinds = identifyPatternPerRow(road, traffic).map(kindOf)

            for (let row = 1; row < kinds.length; row++) {
                expect({ seed, row, kind: kinds[row] }).not.toEqual({
                    seed,
                    row,
                    kind: kinds[row - 1],
                })
            }
        }
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

        // Traffic never steers, so every body stays axis-aligned: two of them are clear
        // of each other exactly when they are a full car apart on one of the two axes.
        for (let i = 0; i < traffic.length; i++) {
            for (let j = i + 1; j < traffic.length; j++) {
                const a = traffic[i]
                const b = traffic[j]
                const apart =
                    Math.abs(a.position.x - b.position.x) >= a.spec.size.width ||
                    Math.abs(a.position.y - b.position.y) >= a.spec.size.height
                expect(apart).toBe(true)
            }
        }
    })

    it('leaves every pattern passable by a straight line down the road', () => {
        const road = createRoad()
        const passingClearance = (RACING_CAR.width + TRAFFIC_CAR.width) / 2
        const halfCar = RACING_CAR.width / 2

        // A straight line at constant x is the only guarantee that a row can be driven
        // through at all, and it is not a conservative one: cars are 96px long while a
        // pattern staggers them by at most 200px, so two of them leave a few px of clear
        // road between their bodies — never the ~96px a car would need to sit in the gap
        // and swap sides, let alone the ~400px of closing distance a lane change costs at
        // top speed. A row with no straight corridor is therefore a wall, not a puzzle.
        for (const pattern of TRAFFIC_PATTERNS) {
            const clears = (x: number): boolean =>
                pattern.cars.every(
                    (spot) => Math.abs(x - lanePosition(road, spot.lane).x) >= passingClearance,
                )

            const corridor: number[] = []
            for (let x = road.left + halfCar; x <= road.left + road.width - halfCar; x++) {
                if (clears(x)) {
                    corridor.push(x)
                }
            }

            expect({ pattern: pattern.name, corridor: corridor.length > 0 }).toEqual({
                pattern: pattern.name,
                corridor: true,
            })
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

    it('never puts a pattern in a section easier than its own difficulty', () => {
        const road = createRoad()
        const rows = 20
        const sectionSize = rows / 4
        // Read as "by the end of this quarter, these difficulties are allowed".
        const allowedBySection: readonly TrafficPattern['difficulty'][][] = [
            ['easy'],
            ['easy', 'medium'],
            ['easy', 'medium', 'hard'],
            ['easy', 'medium', 'hard', 'veryHard'],
        ]
        const difficultyOf = (name: string | undefined): string | undefined =>
            TRAFFIC_PATTERNS.find((pattern) => pattern.name === name)?.difficulty

        for (let seed = 0; seed < 50; seed++) {
            const traffic = generateTraffic(road, rows, `ramp-${seed}`)
            const perRow = identifyPatternPerRow(road, traffic)

            perRow.forEach((name, row) => {
                const section = Math.floor(row / sectionSize)
                const difficulty = difficultyOf(name)
                expect({ seed, row, difficulty, allowed: true }).toEqual({
                    seed,
                    row,
                    difficulty,
                    allowed: allowedBySection[section].includes(
                        difficulty as TrafficPattern['difficulty'],
                    ),
                })
            })
        }
    })

    it('uses every pattern of the catalogue at least once', () => {
        const road = createRoad()
        const rows = 20

        for (let seed = 0; seed < 50; seed++) {
            const traffic = generateTraffic(road, rows, `coverage-${seed}`)
            const used = new Set(identifyPatternPerRow(road, traffic))

            for (const pattern of TRAFFIC_PATTERNS) {
                expect({ seed, name: pattern.name, used: used.has(pattern.name) }).toEqual({
                    seed,
                    name: pattern.name,
                    used: true,
                })
            }
        }
    })
})
