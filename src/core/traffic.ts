import { SIMULATION } from '@core/config'
import { type Car, TRAFFIC_CAR_SPEC, createCar } from './car'
import { type Random, createRandom } from '@core/random'
import { type Road, lanePosition } from './road'

/** Shared dark color keeps traffic distinct from the evolving population. */
const TRAFFIC_COLOR = '#1c1917'

type TrafficPatternKind =
    'left' | 'middle' | 'right' | 'left-middle' | 'left-right' | 'right-middle'
export type TrafficPattern = {
    readonly name: string
    readonly difficulty: 'easy' | 'medium' | 'hard' | 'veryHard'
    readonly kind: TrafficPatternKind
    /** Lane plus depth offset; zero sits on the row line. */
    readonly cars: readonly { readonly lane: number; readonly offset: number }[]
}

export const TRAFFIC_PATTERNS: readonly TrafficPattern[] = [
    // Easy rows.
    {
        name: 'singleCenter',
        difficulty: 'easy',
        kind: 'middle',
        cars: [{ lane: 1, offset: 0 }],
    },

    {
        name: 'singleLeft',
        difficulty: 'easy',
        kind: 'left',
        cars: [{ lane: 0, offset: 0 }],
    },
    {
        name: 'singleRight',
        difficulty: 'easy',
        kind: 'right',
        cars: [{ lane: 2, offset: 0 }],
    },
    {
        name: 'bothSides',
        difficulty: 'easy',
        kind: 'left-right',
        cars: [
            { lane: 0, offset: 0 },
            { lane: 2, offset: 0 },
        ],
    },
    // Medium rows.
    {
        name: 'doubleLeft',
        difficulty: 'medium',
        kind: 'left-middle',
        cars: [
            { lane: 0, offset: 0 },
            { lane: 1, offset: 0 },
        ],
    },
    {
        name: 'doubleRight',
        difficulty: 'medium',
        kind: 'right-middle',
        cars: [
            { lane: 1, offset: 0 },
            { lane: 2, offset: 0 },
        ],
    },
    // Staggering makes this distinct from a level left-right row.
    {
        name: 'doubleMiddle',
        difficulty: 'medium',
        kind: 'left-right',
        cars: [
            { lane: 0, offset: 0 },
            { lane: 2, offset: -100 },
        ],
    },
    // Offsets prevent same-lane cars from overlapping.
    {
        name: 'doubleBothSides',
        difficulty: 'medium',
        kind: 'left-right',
        cars: [
            { lane: 0, offset: 0 },
            { lane: 0, offset: -120 },
            { lane: 2, offset: 0 },
            { lane: 2, offset: -120 },
        ],
    },
    // Hard staircase.
    {
        name: 'leftStairs',
        difficulty: 'hard',

        kind: 'left-middle',
        cars: [
            { lane: 0, offset: 0 },
            { lane: 1, offset: -100 },
        ],
    },
    {
        name: 'rightStairs',
        difficulty: 'hard',

        kind: 'right-middle',
        cars: [
            { lane: 1, offset: -100 },
            { lane: 2, offset: 0 },
        ],
    },
    // Very hard L shapes.
    {
        name: 'rightL',
        difficulty: 'veryHard',
        kind: 'right-middle',
        cars: [
            { lane: 2, offset: 0 },
            { lane: 1, offset: 0 },
            { lane: 1, offset: -120 },
        ],
    },
    {
        name: 'leftL',
        difficulty: 'veryHard',
        kind: 'left-middle',
        cars: [
            { lane: 0, offset: 0 },
            { lane: 1, offset: 0 },
            { lane: 1, offset: -120 },
        ],
    },
] as const

/** Keeps calls without an explicit seed deterministic. */
const DEFAULT_SEED = '1234'

const patternsOf = (...difficulties: readonly TrafficPattern['difficulty'][]): TrafficPattern[] =>
    TRAFFIC_PATTERNS.filter((pattern) => difficulties.includes(pattern.difficulty))

/**
 * Builds four increasing-difficulty sections. Unused patterns are preferred for coverage,
 * and adjacent rows cannot leave the same gap (`kind`).
 */
const buildCourse = (random: Random, rows: number): TrafficPattern[] => {
    const sectionSize: number = Math.floor(rows / 4)
    const course: TrafficPattern[] = []
    const unused = new Set<string>(TRAFFIC_PATTERNS.map((pattern) => pattern.name))

    const appendSection = (pool: readonly TrafficPattern[], length: number): void => {
        for (let row = 0; row < length; row++) {
            const previousKind: TrafficPatternKind | undefined = course[course.length - 1]?.kind

            // Fallback supports a future pool containing only one kind.
            const allowed: readonly TrafficPattern[] = pool.filter(
                (pattern) => pattern.kind !== previousKind,
            )
            const candidates: readonly TrafficPattern[] = allowed.length > 0 ? allowed : pool

            const fresh: TrafficPattern[] = candidates.filter((pattern) => unused.has(pattern.name))
            const choices: readonly TrafficPattern[] = fresh.length > 0 ? fresh : candidates

            const chosen: TrafficPattern = choices[random.nextInt(0, choices.length)]
            unused.delete(chosen.name)
            course.push(chosen)
        }
    }

    appendSection(patternsOf('easy'), sectionSize)
    appendSection(patternsOf('easy', 'medium'), sectionSize)
    appendSection(patternsOf('easy', 'medium', 'hard'), sectionSize)
    // The last section absorbs rounding leftovers.
    appendSection(TRAFFIC_PATTERNS, rows - sectionSize * 3)

    return course
}

/** Pattern depth beyond its row line; forward offsets are negative y. */
export const patternDepth = (pattern: TrafficPattern): number =>
    pattern.cars.reduce((deepest, spot) => Math.max(deepest, -spot.offset), 0)

/**
 * Generates a deterministic course. Row spacing is clear road measured after the deepest
 * car, so staggered patterns do not consume their own manoeuvring gap.
 */
export const generateTraffic = (
    road: Road,
    rows: number,
    seed: string | number = DEFAULT_SEED,
): Car[] => {
    const random = createRandom(seed)
    const course = buildCourse(random, rows)
    const traffic: Car[] = []

    // The next clear gap starts after the deepest car placed so far.
    let deepest = 0

    for (const pattern of course) {
        const rowLine = deepest - SIMULATION.trafficRowSpacing

        for (const spot of pattern.cars) {
            const position = lanePosition(road, spot.lane, rowLine + spot.offset)
            const car = createCar(position, TRAFFIC_CAR_SPEC, TRAFFIC_COLOR)
            car.controls.throttle = 1
            traffic.push(car)
        }

        deepest = rowLine - patternDepth(pattern)
    }

    return traffic
}
