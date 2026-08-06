/** Tunable simulation values. This module is independent of the DOM. */

/**
 * One-off brake-discovery bonus, paid only after a real overtake. Without that gate the
 * population learned to brake at the start and scored zero overtakes for 24 generations.
 * It affects ranking only; course completion still uses raw overtakes.
 */
export const BRAKE_BONUSES: readonly number[] = [0, 1, 3, 5, 10]

/** Physics runs on a fixed step so the simulation behaves identically on any display. */
export const SIMULATION = {
    /** Seconds per physics step (60 Hz). */
    stepSeconds: 1 / 60,
    /** Maximum catch-up steps after a stalled frame. */
    maxStepsPerFrame: 240,
    /** End-of-round overlay duration. */
    gameOverSeconds: 3,
    /** Victory parade duration before the round closes. */
    victoryCelebrationSeconds: 5,
    /** Round ceiling. Survivors are retired without a score penalty. */
    maxRoundSeconds: 120,
    /** Deadline for covering `idleProgressThreshold`; independent of the overtake deadline. */
    idleTimeoutSeconds: 6,
    /** Forward progress that resets the idle timer, in pixels. */
    idleProgressThreshold: 100,
    /** Maximum seconds between overtakes. */
    overtakeTimeoutSeconds: 12,
    /** Followed car's vertical screen position as a fraction of canvas height. */
    cameraHeightRatio: 0.7,
    /** How many traffic rows the course is made of. */
    trafficRows: 20,
    /** Clear road after the deepest car in a row, not a fixed row-to-row pitch. */
    trafficRowSpacing: 500,
} as const

export const WORLD = {
    width: 1000,
    height: 100_000,
    roadWidth: 240,
    laneCount: 3,
} as const

export const RACING_CAR = {
    maxSpeed: 10,
    acceleration: 0.05,
    maxReverse: 1,
    brakePower: 0.2,
    width: 42,
    height: 96,
} as const

/** Traffic drives straight at half the racing cars' top speed. */
export const TRAFFIC_CAR = {
    maxSpeed: 5,
    acceleration: 0.02,
    maxReverse: 1,
    brakePower: 0.05,
    width: 42,
    height: 96,
} as const

/** Perception range, deepest in front and shortest at the flanks. */
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

export const SENSOR = {
    sideSectorDegrees: 15,
    /** Number of sector zones per side. */
    sideSectorsPerSide: 3,
    /** Outer edge of each lateral escape zone. */
    lateralCoverageDegrees: 90,
} as const

/** Per-frame learning rate while a human is driving. */
export const LEARNING_RATE = 0.02

export const MANUAL_TRAINING = {
    /** Covers the longest possible round plus timing slack. */
    experienceCapacity: 5000,
    realtimeBatchSize: 8,
    consolidationEpochs: 60,
    consolidationLearningRate: 0.05,
} as const

/** Four parents replaced a measured single-lineage plateau at 6 overtakes. */
export const PARENT_COUNT = 4

export const MUTATION = {
    minRate: 0,
    maxRate: 1,
    /** Mutation floor for the near-clone band. */
    lowRateFloor: 0.01,
    /** Caps explorers relative to the slider; the old independent cap produced near-random cars. */
    explorerFactor: 4,
    /** Maximum absolute perturbation of one selected parameter. */
    perturbation: 0.3,
} as const

/** Population shares by mutation intensity. They must sum to 1. */
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
 * Long-term archive used to retest networks across layouts. It was added after one
 * finisher cleared only 9 of 40 unseen courses and ranged from 12 to 40 overtakes.
 */
export const VETERANS = {
    rosterSize: 100,
    /** Limits how quickly one lineage can fill the archive. */
    admittedPerRace: 3,
    racingShare: 0.1,
    historyLimit: 100,
} as const

/**
 * Generations sharing one traffic layout. `1` maximizes evaluation noise; `Infinity`
 * enables controlled measurements but previously produced a nine-generation plateau.
 */
export const COURSE_INTERVALS: readonly number[] = [1, 3, 5, 10, Number.POSITIVE_INFINITY]

export const DEFAULTS = {
    mutationRate: 0.3,
    carsQuantity: 80,
    /** Must be one of `COURSE_INTERVALS`. */
    generationsPerCourse: 3,
    /** Must be one of `BRAKE_BONUSES`. */
    brakeBonus: 10,
    /** Hidden layers only; input and output sizes are fixed. */
    hiddenLayers: [16, 12, 8],
} as const

export const CARS_QUANTITY = {
    min: 10,
    max: 100,
    step: 1,
} as const
