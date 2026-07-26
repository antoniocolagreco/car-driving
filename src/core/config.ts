/**
 * Every tunable number of the simulation, in one place.
 *
 * Nothing here depends on the DOM: the whole `core/` folder is pure logic, so it can
 * be unit tested and, in principle, run without a browser at all.
 *
 * Evolution currently uses a deliberately sparse objective: only overtakes earn points.
 */

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
	 */
	maxRoundSeconds: 60,
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
	/**
	 * How many consecutive generations share one course layout. Within a block the
	 * course is identical, so fitness is directly comparable and the champion can
	 * only be dethroned by a car that genuinely out-drove it on the same obstacles;
	 * every block the layout changes, so a champion cannot coast on a memorised one.
	 */
	generationsPerCourse: 3,
	/** How many traffic rows the course is made of. */
	trafficRows: 20,
	/** Vertical spacing between two traffic rows, in pixels. */
	trafficRowSpacing: 500,
} as const;

/** The world is a very tall corridor; the road sits inside it. */
export const WORLD = {
	width: 1000,
	height: 100_000,
	roadWidth: 240,
	laneCount: 3,
} as const;

/** Physical characteristics of the AI-driven cars. */
export const RACING_CAR = {
	maxSpeed: 10,
	acceleration: 0.05,
	maxReverse: 1,
	brakePower: 0.2,
	width: 42,
	height: 96,
} as const;

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
} as const;

const SENSOR_RANGE = 700;

/** Fixed eleven-zone perception shared by every racing car and network. */
export const SENSOR = {
	range: SENSOR_RANGE,
	/** Side areas project outwards as far as every other perception area. */
	sideClearanceRange: SENSOR_RANGE,
	sideSectorDegrees: 15,
	/** The fixed `LEFT_*`/`RIGHT_*` identifiers contain exactly this many zones per side. */
	sideSectorsPerSide: 3,
	/** Outer edge of the additional escape-direction zone on each side. */
	lateralCoverageDegrees: 90,
} as const;

/**
 * How fast the network learns from a human driving it (`trainBatch` in
 * `neural-network.ts`). Small on purpose: one step runs 60 times a second, so a single
 * second of driving is 60 corrections, and a rate large enough to feel immediate would
 * make the network chase the last frame instead of the shape of the driving.
 */
export const LEARNING_RATE = 0.02;

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
} as const;

/**
 * How many of a generation's best cars get to breed the next one.
 *
 * One is the obvious choice and it is a trap: a population where every car is a
 * variation of a single network is a hill climber wearing a genetic algorithm's
 * clothes, and it stalls the moment that one network sits in a local optimum —
 * measured, the champion plateaued at 6 overtakes for a dozen generations at a time.
 * Breeding from the top few keeps genuinely different strategies alive in parallel,
 * and elitism still guarantees the very best network survives untouched.
 */
export const PARENT_COUNT = 4;

export const MUTATION = {
	minRate: 0,
	maxRate: 1,
	/**
	 * The floor used for the "barely mutated" share of the population. Cloning the
	 * champion exactly would waste those cars, so even they get a nudge.
	 */
	lowRateFloor: 0.01,
	/**
	 * The explorer band mutates at up to this multiple of the chosen rate — never at
	 * a rate of its own. It used to explore between the chosen rate and `maxRate`,
	 * which meant the slider was ignored by a third of the population: measured with
	 * the slider at 2 %, 22 cars out of 100 were still mutated above 20 % and one at
	 * 93 %, i.e. very nearly random networks that carried nothing of the champion.
	 * Asking for a 2 % mutation has to produce a generation that drives like the
	 * champion, not a lottery with a 2 % label on it.
	 */
	explorerFactor: 4,
	/**
	 * How far a single mutation can move one weight or bias, on a [-1, 1] scale.
	 * The rate decides HOW MANY parameters change; this decides BY HOW MUCH. Small
	 * enough that a mutated child still drives like its parent, large enough that a
	 * few generations of them explore real alternatives.
	 */
	perturbation: 0.3,
} as const;

/**
 * How the mutation budget is spread across a generation.
 *
 * A single mutation rate is a bad bet: too low and the population never explores,
 * too high and it forgets what the champion already knew. So the generation is split
 * into bands. The elite (car 0) is the champion itself, untouched, which guarantees a
 * generation can never be worse than the one before it.
 *
 * The four shares below must sum to 1.
 */
export const MUTATION_DISTRIBUTION = {
	/** Almost-clones, mutated at `MUTATION.lowRateFloor`: they refine the champion. */
	minimal: 0.25,
	/** Mutated somewhere between the floor and the user's rate. */
	low: 0.35,
	/** Mutated at exactly the user's rate. */
	target: 0.25,
	/** Mutated between the user's rate and `MUTATION.explorerFactor` times it. */
	high: 0.15,
} as const;

/** Sparse evolutionary objective: every completed overtake earns a fixed reward. */
export const REWARD = {
	/** Passing one traffic car. No other event changes fitness. */
	overtake: 50,
} as const;

/** The only fitness penalty: the fraction lost after a collision or death timeout. */
export const PENALTY = {
	/** A very low-speed collision removes half of the earned overtake score. */
	crashAtMinimumSpeed: 0.5,
	/** A collision at maximum speed removes ninety percent of the earned score. */
	crashAtMaximumSpeed: 0.9,
} as const;

/** Defaults for the settings the user can change, before anything is stored. */
export const DEFAULTS = {
	/**
	 * Ten percent gives the smaller population enough variation to explore materially
	 * different policies while elitism preserves the best network unchanged.
	 */
	mutationRate: 0.1,
	carsQuantity: 80,
	/**
	 * Hidden layers only; the fixed perception contributes eleven readings plus speed.
	 *
	 * Three tapered layers can combine local clearance readings into manoeuvres without
	 * making the evolutionary search unnecessarily large.
	 */
	hiddenLayers: [16, 12, 8],
} as const;

export const CARS_QUANTITY = {
	min: 10,
	max: 100,
	step: 1,
} as const;
