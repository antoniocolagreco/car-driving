import { SIMULATION } from '@core/config'
import { type Car, TRAFFIC_CAR_SPEC, createCar } from './car'
import { type Random, createRandom } from '@core/random'
import { type Road, lanePosition } from './road'

/**
 * Every traffic car shares one dark body colour on purpose. Traffic is scenery to be
 * read at a glance — "these are the obstacles" — while the learning population gets
 * the colourful bodies. Giving traffic random colours too makes it impossible to tell
 * at a glance who is driving and who is being driven around.
 */
const TRAFFIC_COLOR = '#1c1917'

/**
 * Deterministic traffic generation. The obstacle course a car has to drive
 * through is built from a fixed catalogue of row layouts ("patterns"): the
 * course is data, and reading `TRAFFIC_PATTERNS` shows the whole design at a
 * glance instead of requiring a trip through a dozen tiny functions.
 */

type TrafficPatternKind =
    'left' | 'middle' | 'right' | 'left-middle' | 'left-right' | 'right-middle'
/** One row of the traffic course: which lanes are occupied, and by how much each car is offset. */
export type TrafficPattern = {
    readonly name: string
    readonly difficulty: 'easy' | 'medium' | 'hard' | 'veryHard'
    readonly kind: TrafficPatternKind
    /** Cars in this row: lane index plus an extra offset in px (0 = on the row line). */
    readonly cars: readonly { readonly lane: number; readonly offset: number }[]
}

export const TRAFFIC_PATTERNS: readonly TrafficPattern[] = [
    // Easy: a single car, or two cars that leave the middle lane open.
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
    // Medium: two cars, one lane still open but closer to the others.
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
    // The second car is staggered on purpose: without the offset this row would be
    // `bothSides` again (lanes 0 and 2, level) rather than a distinct obstacle.
    {
        name: 'doubleMiddle',
        difficulty: 'medium',
        kind: 'left-right',
        cars: [
            { lane: 0, offset: 0 },
            { lane: 2, offset: -100 },
        ],
    },
    // Two cars per outer lane, each pair staggered: without the offsets the two cars
    // of a pair would spawn on top of each other.
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
    // Hard: a diagonal "staircase" the car must weave through.
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
    // Very hard: a three-car "L" shape that blocks two lanes at two different depths.
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

/** Used when the caller does not pass a seed, so a plain `generateTraffic(road, rows)` call still repeats. */
const DEFAULT_SEED = '1234'

const patternsOf = (...difficulties: readonly TrafficPattern['difficulty'][]): TrafficPattern[] =>
    TRAFFIC_PATTERNS.filter((pattern) => difficulties.includes(pattern.difficulty))

/**
 * Builds the row-by-row course: one quarter per difficulty, easy first, and each
 * quarter drawn from its own difficulty or anything easier.
 *
 * The ramp is the point. Without it a car that has not yet learned to hold the road
 * meets a two-lane weave on row two, and what it learns there it cannot keep: it
 * evolves a hard overtake in one round and forgets the plain single-lane one in the
 * next, dying against the guard rail before it ever reaches the traffic. Skills have
 * to stack, so the opening rows have to be survivable by a car that can do nothing
 * but dodge one car.
 *
 * Two rules hold across the whole course, section boundaries included:
 *
 * - every pattern of the catalogue appears at least once, which is what the
 *   `unused` preference below is for: a pattern that has not been placed yet wins
 *   over one that has, so coverage falls out of the ordinary draw instead of
 *   needing slots reserved for it;
 * - no row has the same `kind` as the row before it, because two rows leaving the
 *   same gap are one obstacle with a hole in it and are cleared by driving straight.
 */
const buildCourse = (random: Random, rows: number): TrafficPattern[] => {
    const sectionSize: number = Math.floor(rows / 4)
    const course: TrafficPattern[] = []
    const unused = new Set<string>(TRAFFIC_PATTERNS.map((pattern) => pattern.name))

    const appendSection = (pool: readonly TrafficPattern[], length: number): void => {
        for (let row = 0; row < length; row++) {
            const previousKind: TrafficPatternKind | undefined = course[course.length - 1]?.kind

            // Every pool holds at least two kinds, so the fallback to `pool` is only
            // ever reached by a future catalogue with a single-kind difficulty.
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
    // The last section takes whatever the flooring left over, so short courses still
    // end on the full catalogue rather than losing rows.
    appendSection(TRAFFIC_PATTERNS, rows - sectionSize * 3)

    return course
}

/**
 * How far beyond its own row line a pattern reaches, in pixels: 0 for the rows whose
 * cars all sit on the line, and the deepest stagger for the ones that do not.
 *
 * Offsets are negative because forward is -y, so the deepest car is the largest `-offset`.
 */
export const patternDepth = (pattern: TrafficPattern): number =>
    pattern.cars.reduce((deepest, spot) => Math.max(deepest, -spot.offset), 0)

/**
 * Generates the traffic course ahead of the start line: `rows` rows of the road, each
 * filled by a pattern picked as described by `buildCourse`. Deterministic for a given
 * `road` and `seed` — the same seed always produces cars in the same positions, which is
 * what makes fitness comparable across a generation and across runs.
 *
 * `SIMULATION.trafficRowSpacing` is the CLEAR ROAD between rows, not the pitch of the row
 * lines: each row is placed that far beyond the deepest car of the one before it. A row
 * that stands two cars deep therefore pushes the next one further away by exactly the
 * depth it occupies.
 *
 * The distinction is the whole difference between a course a car can drive and one it
 * cannot. Placing rows on a fixed pitch meant a staggered row ate its own stagger out of
 * the gap that followed it: a 120 px L left 380 px of road to complete a manoeuvre that
 * needs 333, while a single car on the line left the full 500. The rows that demand the
 * most were the ones given the least room to do it in.
 *
 * Traffic rolls forward at a constant speed, full throttle and no steering: these
 * are moving obstacles, not parked ones. What matters is HOW FAST relative to the
 * racing cars — see `TRAFFIC_CAR.maxSpeed`. Measured with traffic at half the
 * racer's top speed, the closing speed halved and the winner covered 5563 px
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

    // Tracks the deepest point of the course so far, which is where the next gap is
    // measured from: the start line to begin with, then the last car of each row placed.
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
