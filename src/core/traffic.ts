import { type Random, createRandom } from '@core/random'

/**
 * Every traffic car shares one dark body colour on purpose. Traffic is scenery to be
 * read at a glance — "these are the obstacles" — while the learning population gets
 * the colourful bodies. Giving traffic random colours too makes it impossible to tell
 * at a glance who is driving and who is being driven around.
 */
const TRAFFIC_COLOR = '#1c1917'
import { SIMULATION } from '@core/config'
import { type Car, TRAFFIC_CAR_SPEC, createCar } from './car'
import { type Road, lanePosition } from './road'

/**
 * Deterministic traffic generation. The obstacle course a car has to drive
 * through is built from a fixed catalogue of row layouts ("patterns") instead
 * of the old file's 12 near-identical functions plus a 12-case switch: the
 * course is data, and reading `TRAFFIC_PATTERNS` shows the whole design at a
 * glance instead of requiring a trip through a dozen tiny functions.
 */

/** One row of the traffic course: which lanes are occupied, and by how much each car is offset. */
export type TrafficPattern = {
    readonly name: string
    readonly difficulty: 'easy' | 'medium' | 'hard' | 'veryHard'
    /** Cars in this row: lane index plus an extra offset in px (0 = on the row line). */
    readonly cars: readonly { readonly lane: number; readonly offset: number }[]
}

export const TRAFFIC_PATTERNS: readonly TrafficPattern[] = [
    // Easy: a single car, or two cars that leave the middle lane open.
    { name: 'singleCenter', difficulty: 'easy', cars: [{ lane: 1, offset: 0 }] },
    { name: 'singleLeft', difficulty: 'easy', cars: [{ lane: 0, offset: 0 }] },
    { name: 'singleRight', difficulty: 'easy', cars: [{ lane: 2, offset: 0 }] },
    {
        name: 'bothSides',
        difficulty: 'easy',
        cars: [
            { lane: 0, offset: 0 },
            { lane: 2, offset: 0 },
        ],
    },
    // Medium: two cars, one lane still open but closer to the others.
    {
        name: 'doubleLeft',
        difficulty: 'medium',
        cars: [
            { lane: 0, offset: 0 },
            { lane: 1, offset: 0 },
        ],
    },
    {
        name: 'doubleRight',
        difficulty: 'medium',
        cars: [
            { lane: 1, offset: 0 },
            { lane: 2, offset: 0 },
        ],
    },
    // FIX: the old `doubleMiddle` was byte-for-byte identical to `bothSides`
    // (lanes 0 and 2, no offset) — a dead duplicate, not a distinct pattern.
    // Staggering the second car makes it an actually different obstacle to solve.
    {
        name: 'doubleMiddle',
        difficulty: 'medium',
        cars: [
            { lane: 0, offset: 0 },
            { lane: 2, offset: -80 },
        ],
    },
    // FIX: the old `doubleBothSides` placed two cars at the exact same lane 0
    // position and two more at the exact same lane 2 position, i.e. two pairs of
    // cars spawning on top of each other. Stagger each pair instead.
    {
        name: 'doubleBothSides',
        difficulty: 'medium',
        cars: [
            { lane: 0, offset: 0 },
            { lane: 0, offset: -100 },
            { lane: 2, offset: 0 },
            { lane: 2, offset: -100 },
        ],
    },
    // Hard: a diagonal "staircase" the car must weave through.
    {
        name: 'leftStairs',
        difficulty: 'hard',
        cars: [
            { lane: 0, offset: 0 },
            { lane: 1, offset: -80 },
        ],
    },
    {
        name: 'rightStairs',
        difficulty: 'hard',
        cars: [
            { lane: 1, offset: -80 },
            { lane: 2, offset: 0 },
        ],
    },
    // Very hard: a three-car "L" shape that blocks two lanes at two different depths.
    {
        name: 'rightL',
        difficulty: 'veryHard',
        cars: [
            { lane: 2, offset: 0 },
            { lane: 1, offset: 0 },
            { lane: 1, offset: -100 },
        ],
    },
    {
        name: 'leftL',
        difficulty: 'veryHard',
        cars: [
            { lane: 0, offset: 0 },
            { lane: 1, offset: 0 },
            { lane: 1, offset: -100 },
        ],
    },
] as const

/** Used when the caller does not pass a seed, so a plain `generateTraffic(road, rows)` call still repeats. */
const DEFAULT_SEED = '1234'

const patternsOf = (...difficulties: readonly TrafficPattern['difficulty'][]): TrafficPattern[] =>
    TRAFFIC_PATTERNS.filter((pattern) => difficulties.includes(pattern.difficulty))

/**
 * Builds one quarter of the course: every pattern of `difficulty` is guaranteed
 * to appear at least once, then the row is padded up to `length` with random
 * patterns of `difficulty` or easier, and the whole thing is shuffled.
 *
 * If the guaranteed patterns alone already exceed `length` (few rows requested,
 * many patterns of that difficulty), no patterns are dropped — the guarantee
 * always wins over the requested length.
 */
const buildSection = (
    random: Random,
    difficulty: TrafficPattern['difficulty'],
    pool: readonly TrafficPattern[],
    length: number,
): TrafficPattern[] => {
    const section = [...patternsOf(difficulty)]
    while (section.length < length) {
        section.push(pool[random.nextInt(0, pool.length)])
    }
    return random.shuffle(section)
}

/** Builds the full, ordered row-by-row course: easy, then medium, then hard, then very hard. */
const buildCourse = (random: Random, rows: number): TrafficPattern[] => {
    const sectionSize = Math.floor(rows / 4)

    const easy = buildSection(random, 'easy', patternsOf('easy'), sectionSize)
    const medium = buildSection(random, 'medium', patternsOf('easy', 'medium'), sectionSize)
    const hard = buildSection(random, 'hard', patternsOf('easy', 'medium', 'hard'), sectionSize)
    const veryHardLength = rows - sectionSize * 3
    const veryHard = buildSection(
        random,
        'veryHard',
        patternsOf('easy', 'medium', 'hard', 'veryHard'),
        veryHardLength,
    )

    return [...easy, ...medium, ...hard, ...veryHard]
}

/**
 * Generates the traffic course ahead of the start line: `rows` rows of the road,
 * each filled by a pattern picked as described by `buildCourse`, spaced
 * `SIMULATION.trafficRowSpacing` px apart. Deterministic for a given `road` and
 * `seed` — the same seed always produces cars in the same positions, which is
 * what makes fitness comparable across a generation and across runs.
 *
 * Traffic rolls forward at a constant speed, full throttle and no steering: these
 * are moving obstacles, not parked ones. What matters is HOW FAST relative to the
 * racing cars — see `TRAFFIC_CAR.maxSpeed`. Measured with traffic at half the
 * racer's top speed, the closing speed halved and the champion covered 5563 px
 * while passing only 3 cars: the course was running away from it, "forward
 * progress" degenerated into cruising along with the pack, and the overtake reward
 * nearly stopped paying out.
 */
export const generateTraffic = (
    road: Road,
    rows: number,
    seed: string | number = DEFAULT_SEED,
): Car[] => {
    const random = createRandom(seed)
    const course = buildCourse(random, rows)
    const traffic: Car[] = []

    course.forEach((pattern, rowIndex) => {
        const rowOffset = -SIMULATION.trafficRowSpacing * (rowIndex + 1)

        for (const spot of pattern.cars) {
            const position = lanePosition(road, spot.lane, rowOffset + spot.offset)
            const car = createCar(position, TRAFFIC_CAR_SPEC, TRAFFIC_COLOR)
            car.controls.throttle = 1
            traffic.push(car)
        }
    })

    return traffic
}
