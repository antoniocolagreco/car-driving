/**
 * Every tunable number of the simulation, in one place.
 *
 * Nothing here depends on the DOM: the whole `core/` folder is pure logic, so it can
 * be unit tested and, in principle, run without a browser at all.
 *
 * Evolution uses a deliberately sparse objective: overtakes earn points, plus the one
 * bootstrapping bonus in `BRAKE_BONUSES`.
 */

/**
 * One-off bonus, counted in overtakes, for a car that presses the brake at least once
 * while moving AND passes at least one traffic car. Awarded once per race, no matter
 * how often the brake is used after that.
 *
 * This is an ignition, not a reward for braking: half the row-to-row transitions in a
 * course cannot be taken at full throttle, so a car that never discovers the pedal has
 * a ceiling it cannot pass, and evolution has no reason to find it because the first
 * touch of the brake pays nothing on its own. Ten points is deliberately more than a
 * typical round's overtake count, so while braking is still rare a braking car outranks
 * a non-braking one even when it drives worse. It then cancels itself out: once the
 * whole field brakes, every car carries the same +10 and the ranking is decided by
 * overtakes again.
 *
 * The overtake requirement is not a detail, it is what makes the bonus survivable.
 * Without it, measured over 25 generations, the population collapsed within one
 * generation onto a car that braked, crawled, passed nobody and still scored 10, and
 * every generation after that produced a field with ZERO overtakes: braking at the
 * start line and dying of the idle timeout is cheaper than racing, and it pays the same.
 * Gated behind one overtake the same run climbed from 8 to 17 overtakes while the share
 * of braking cars went from 1 in 81 to 45 in 81.
 *
 * It never counts towards clearing the course, which still means passing every traffic
 * car for real, and pressing the brake at a standstill earns nothing.
 *
 * The size of it is a real question rather than a settled one, which is why it is a
 * slider. Measured over 40 races at 10, the bonus handed the generation to a car with
 * fewer overtakes than the best in the field 4 times, once to a car that had passed 1
 * against a field best of 10, while 53% of the field was already braking. That is the
 * whole trade in one sentence: high enough to be discovered, high enough to be worth
 * more than the race itself. `0` turns it off and ranks on overtakes alone; `1` makes it
 * a tie-break between equal overtakes rather than an override; the middle values sit
 * between an ignition and a policy.
 */
export const BRAKE_BONUSES: readonly number[] = [0, 1, 3, 5, 10]

/** Physics runs on a fixed step so the simulation behaves identically on any display. */
export const SIMULATION = {
    /** Seconds per physics step (60 Hz). The renderer may run faster or slower. */
    stepSeconds: 1 / 60,
    /** Safety valve: never run more than this many steps to catch up after a stall. */
    maxStepsPerFrame: 240,
    /** How long the "X WINS" screen stays up before the next generation starts. */
    gameOverSeconds: 3,
    /** Time between clearing the course and closing the round, used for the victory banner. */
    victoryCelebrationSeconds: 5,
    /**
     * Hard ceiling on a single round, in simulated seconds. The course is finite but
     * the world is not: a car that survives past the last traffic row would otherwise
     * drive down an empty road for minutes on end, and the generation could not end
     * until it did. Whoever is still alive at the ceiling is retired, not penalised.
     *
     * It has to be read against the length of the course. Traffic runs at half the racing
     * cars' top speed, so the gap closes at 5 px/step at best, and 20 rows 800 px apart is
     * 16000 px of closing: 3200 steps, or 53 seconds flat out. At 60 this ceiling was the
     * binding constraint, forcing an average above 8 and leaving no room to lift off for a
     * difficult row. At 120 there is roughly a minute of slack to spend on manoeuvring.
     */
    maxRoundSeconds: 120,
    /**
     * A car that has not covered `idleProgressThreshold` px in this many seconds is
     * considered stuck and dies.
     *
     * Read these two numbers together: they define a minimum average speed of roughly
     * 17 px/s. Six seconds gives a car time to negotiate dense traffic at low speed,
     * while the separate overtake deadline still eliminates policies that merely creep
     * forever without passing anybody.
     */
    idleTimeoutSeconds: 6,
    /** Forward progress, in pixels, that counts as "still making progress" and resets the idle timer. */
    idleProgressThreshold: 100,
    /** Maximum seconds allowed between overtakes before the car is eliminated and excluded. */
    overtakeTimeoutSeconds: 12,
    /** Vertical position of the followed car on screen, as a fraction of canvas height. */
    cameraHeightRatio: 0.7,
    /** How many traffic rows the course is made of. */
    trafficRows: 20,
    /**
     * Vertical spacing between two traffic rows, in pixels.
     *
     * This is the room a car has to complete a manoeuvre, and the manoeuvre has a price
     * that can be worked out rather than guessed. Steering power is
     * `0.000444v² - 0.007667v + 0.037222` rad per step, so at a cruising 8.5 the lateral
     * offset builds as `v · s · N² / 2`: 67 steps to cross one lane, 95 to cross two. The
     * gap to the row ahead closes at `v - 5`, which at 8.5 is 3.5 px/step, so those 95
     * steps eat 333 px.
     *
     * At 500 that was two thirds of everything available, with the steering held hard over
     * from the instant the previous row was cleared. The rows that demand two lanes, the
     * stairs and the L shapes, were therefore at the edge of what the car can physically
     * do, and a tenth of a second late was a head-on crash. At 800 the same manoeuvre
     * takes 42% of the gap, which is margin rather than a limit.
     */
    trafficRowSpacing: 800,
} as const

/** The world is a very tall corridor; the road sits inside it. */
export const WORLD = {
    width: 1000,
    height: 100_000,
    roadWidth: 240,
    laneCount: 3,
} as const

/** Physical characteristics of the AI-driven cars. */
export const RACING_CAR = {
    maxSpeed: 10,
    acceleration: 0.05,
    maxReverse: 1,
    brakePower: 0.2,
    width: 42,
    height: 96,
} as const

/**
 * Physical characteristics of the traffic cars, which just drive straight ahead at
 * full throttle and never steer. Half the racing cars' top speed, as in the original.
 *
 * Traffic that moves is not just scenery: it halves the closing speed, which sounds
 * like it makes overtaking harder and in fact makes it easier, because what a car has
 * to solve is a row of obstacles arriving at 5 px/step instead of 10. It gets twice as
 * long to pick a lane and steer into it — and steering is this car's bottleneck, since
 * agility falls off with speed (see the steering curve in `car.ts`).
 */
export const TRAFFIC_CAR = {
    maxSpeed: 5,
    acceleration: 0.02,
    maxReverse: 1,
    brakePower: 0.05,
    width: 42,
    height: 96,
} as const

/** Range and resolution of each perception zone, deepest in front and shortest at the flanks. */
export const SENSOR_RANGE = {
    front: 700,
    inner: 600,
    middle: 500,
    outer: 400,
    lateral: 300,
    side: 200,
} as const

/** The deepest zone: the broad-phase reach for skipping obstacles no zone can see. */
export const SENSOR_MAX_RANGE: number = Math.max(...Object.values(SENSOR_RANGE))

/** Fixed eleven-zone perception shared by every racing car and network. */
export const SENSOR = {
    sideSectorDegrees: 15,
    /** The fixed `LEFT_*`/`RIGHT_*` identifiers contain exactly this many zones per side. */
    sideSectorsPerSide: 3,
    /** Outer edge of the additional escape-direction zone on each side. */
    lateralCoverageDegrees: 90,
} as const

/**
 * How fast the network learns from a human driving it (`trainBatch` in
 * `neural-network.ts`). Small on purpose: one step runs 60 times a second, so a single
 * second of driving is 60 corrections, and a rate large enough to feel immediate would
 * make the network chase the last frame instead of the shape of the driving.
 */
export const LEARNING_RATE = 0.02

/** Human-demonstration learning: lightweight replay while driving, exact consolidation after. */
export const MANUAL_TRAINING = {
    /** The longest possible round is 3600 frames; leave room for small timing variations. */
    experienceCapacity: 5000,
    /** Current observation plus seven older examples, rotated deterministically. */
    realtimeBatchSize: 8,
    /** Full passes over every recorded frame before the player's network is promoted. */
    consolidationEpochs: 60,
    /** Full-batch updates are smoother than single-frame SGD, so they can use a larger step. */
    consolidationLearningRate: 0.05,
} as const

/**
 * How many of a generation's best cars get to breed the next one.
 *
 * One is the obvious choice and it is a trap: a population where every car is a
 * variation of a single network is a hill climber wearing a genetic algorithm's
 * clothes, and it stalls the moment that one network sits in a local optimum —
 * measured, the winner plateaued at 6 overtakes for a dozen generations at a time.
 * Breeding from the top few keeps genuinely different strategies alive in parallel,
 * and elitism still guarantees the very best network survives untouched.
 */
export const PARENT_COUNT = 4

export const MUTATION = {
    minRate: 0,
    maxRate: 1,
    /**
     * The floor used for the "barely mutated" share of the population. Cloning the
     * winner exactly would waste those cars, so even they get a nudge.
     */
    lowRateFloor: 0.01,
    /**
     * The explorer band mutates at up to this multiple of the chosen rate — never at
     * a rate of its own. It used to explore between the chosen rate and `maxRate`,
     * which meant the slider was ignored by a third of the population: measured with
     * the slider at 2 %, 22 cars out of 100 were still mutated above 20 % and one at
     * 93 %, i.e. very nearly random networks that carried nothing of the winner.
     * Asking for a 2 % mutation has to produce a generation that drives like the
     * winner, not a lottery with a 2 % label on it.
     */
    explorerFactor: 4,
    /**
     * How far a single mutation can move one weight or bias, on a [-1, 1] scale.
     * The rate decides HOW MANY parameters change; this decides BY HOW MUCH. Small
     * enough that a mutated child still drives like its parent, large enough that a
     * few generations of them explore real alternatives.
     */
    perturbation: 0.3,
} as const

/**
 * How the mutation budget is spread across a generation.
 *
 * A single mutation rate is a bad bet: too low and the population never explores,
 * too high and it forgets what the winner already knew. So the generation is split
 * into bands. The elite (car 0) is the winner itself, untouched, which guarantees a
 * generation can never be worse than the one before it.
 *
 * The four shares below must sum to 1.
 */
export const MUTATION_DISTRIBUTION = {
    /** Almost-clones, mutated at `MUTATION.lowRateFloor`: they refine the winner. */
    minimal: 0.25,
    /** Mutated somewhere between the floor and the user's rate. */
    low: 0.35,
    /** Mutated at exactly the user's rate. */
    target: 0.25,
    /** Mutated between the user's rate and `MUTATION.explorerFactor` times it. */
    high: 0.15,
} as const

/**
 * The veterans archive: a long-term memory of networks, kept across generations and
 * across runs, so a good one can no longer be deleted by a single unlucky course.
 *
 * The problem it solves, measured: the network that first cleared a course, run alone
 * on 40 unseen courses, cleared 9 of them and scored anywhere from 12 to 40. A round's
 * score therefore describes the course at least as much as the driver, and selection
 * (which keeps only the round's best) throws away the best network ever found the first
 * time it draws a bad layout.
 *
 * The archive answers that with a statistic a single race cannot distort: each network
 * keeps the MEDIAN of its own raw overtakes across every race it has run. The median
 * ignores both the lucky 40 and the catastrophic 0, and answers "what does this network
 * do on a typical course", which is the actual question.
 *
 * Ranking is the median and nothing else: the best medians race, the worst are dropped.
 *
 * A newcomer whose median comes from a single race is not a special case needing its own
 * rule. Admission already requires finishing in a race's top three, so it arrives with a
 * good score rather than an unknown one; if that score was luck, the median is corrected
 * the first time it races again, and racing is what the best medians are given. If it was
 * simply weak, it sinks in the standings on its own and is evicted from the bottom.
 */
export const VETERANS = {
    /** How many networks the archive holds. */
    rosterSize: 100,
    /**
     * How many of a finished race's best networks are admitted.
     *
     * Deliberately small. The top ten of a round are ten mutated children of the same
     * winner, so admitting ten per race would leave the archive holding a hundred
     * variations of one lineage within ten races, which is the opposite of what an
     * archive is for. Three per race fills the same hundred slots across thirty-odd
     * races, drawn from thirty-odd different winners.
     */
    admittedPerRace: 3,
    /** Share of the population handed to archive members, racing unmutated. */
    racingShare: 0.1,
    /** Races remembered per network; the oldest is dropped past this. */
    historyLimit: 100,
} as const

/**
 * How many consecutive generations may share one course layout, as offered by the UI.
 *
 * "Course layout" and "traffic layout" are the same thing here: the road itself is two
 * fixed guard rails, so the only thing a seed decides is where the traffic cars are, and
 * that arrangement IS the course. This value is what the traffic seed is divided by.
 *
 * Within a block the course is identical, so fitness is directly comparable and the
 * winner can only be dethroned by a car that genuinely out-drove it on the same
 * obstacles; every block the layout changes, so a winner cannot coast on a memorised one.
 *
 * The two ends of the slider are both traps, and both are worth being able to reach:
 *
 * At 1 the layout changes every generation, so no two scores in a run are comparable and
 * the population is judged on a course it has never seen. That is the honest test, and it
 * is also the noisiest signal evolution can be given.
 *
 * At infinity the course never changes. Measured, this is how the winner stalled at
 * 1935 px for nine generations straight: the population stops learning to drive and
 * starts memorising one arrangement of obstacles. It is still the only setting that makes
 * a long run's scores directly comparable, which is what makes it useful for measuring
 * a change rather than for training against.
 */
export const COURSE_INTERVALS: readonly number[] = [1, 3, 5, 10, Number.POSITIVE_INFINITY]

/** Defaults for the settings the user can change, before anything is stored. */
export const DEFAULTS = {
    /**
     * Ten percent gives the smaller population enough variation to explore materially
     * different policies while elitism preserves the best network unchanged.
     */
    mutationRate: 0.1,
    carsQuantity: 80,
    /**
     * Three generations per course: long enough for a winner to be beaten on the same
     * obstacles rather than on a luckier layout, short enough that it cannot live off
     * a course it has memorised. Must be one of `COURSE_INTERVALS`.
     */
    generationsPerCourse: 3,
    /**
     * The value the bonus was measured at for most of this project's life, kept as the
     * default so a run started today is comparable with the ones already recorded.
     * Must be one of `BRAKE_BONUSES`.
     */
    brakeBonus: 10,
    /**
     * Hidden layers only; the fixed perception contributes eleven readings plus speed.
     *
     * Three tapered layers can combine local clearance readings into manoeuvres without
     * making the evolutionary search unnecessarily large.
     */
    hiddenLayers: [16, 12, 8],
} as const

export const CARS_QUANTITY = {
    min: 10,
    max: 100,
    step: 1,
} as const
