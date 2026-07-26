/**
 * Every tunable number of the simulation, in one place.
 *
 * Nothing here depends on the DOM: the whole `core/` folder is pure logic, so it can
 * be unit tested and, in principle, run without a browser at all.
 *
 * The values that shape *learning* are the ones under `REWARD` and `PENALTY`. If the
 * cars are learning the wrong lesson, that is where to look first.
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
	 * Read these two numbers together: they define a *minimum average speed* of
	 * 200 px / 3 s ≈ 67 px/s, about a ninth of a racing car's top speed (10 px per
	 * step = 600 px/s). That ratio is the whole point. The previous pair — 50 px in
	 * 10 s — asked for 5 px/s, and a car creeping forward at 6 px/s reset the timer
	 * forever: it counted as stalled by every other measure, bled stall penalties,
	 * and still never died, so the generation ran for as long as anyone watched it.
	 * The threshold has to demand real driving, not mere motion.
	 */
	idleTimeoutSeconds: 3,
	/** Forward progress, in pixels, that counts as "still making progress" and resets the idle timer. */
	idleProgressThreshold: 200,
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

/**
 * Distances and speeds that define what counts as a dangerous situation.
 * Used by the reward system to decide whether the car is driving sensibly.
 */
export const DRIVING = {
	/**
	 * Clear-road lookahead, in px. Beyond this there is nothing worth reacting to, so
	 * speed earns `REWARD.pace`.
	 */
	reactionDistance: 300,
	/** Below this speed the car counts as not really moving. */
	stallSpeed: 0.2,
	/**
	 * The hazard zone is this multiple of the car's own stopping distance, plus
	 * `hazardMargin`. The multiple is the difference between punishing a car for not
	 * reacting and punishing it for having already failed: at the bare stopping
	 * distance, half-speed gives a zone 62 px deep, which the car crosses in 0.21 s —
	 * there is nothing left to decide by then, so nothing to learn. Three times that,
	 * plus a car length of margin, is about a second of warning at any speed, which is
	 * roughly what a human driver uses to pick a lane.
	 */
	hazardFactor: 3,
	/** Added at full speed and scaled to zero while stopping: early-reaction slack in px. */
	hazardMargin: 80,
} as const;

/**
 * REWARDS — what we want. Every term is an *outcome*, never an action.
 *
 * This is the key lesson of this file. The previous version of the simulation paid
 * cars for the act of braking and steering near an obstacle, and got exactly what it
 * paid for: the best strategy became creeping along behind traffic while pumping the
 * brake, because that farmed reward frames forever. Braking is not a goal, it is a
 * means. So we pay for distance covered, cars passed and speed sustained, and let
 * braking emerge because crashing is expensive.
 */
export const REWARD = {
	/** Passing a traffic car. The primary objective, and by far the biggest prize. */
	overtake: 50,
	/**
	 * Per pixel of ground gained on the traffic: the one smooth, always-available
	 * gradient, and therefore the term that has to dominate.
	 */
	forwardProgress: 0.05,
	/**
	 * Per second of driving at FULL SPEED ON A CLEAR ROAD, scaled down by however
	 * much of that the car actually used — the other half of "modulate your speed".
	 *
	 * This replaced a flat average-speed reward, which paid for speed no matter what
	 * was in front of the car and made flooring the throttle into the first obstacle a
	 * rewarded strategy. Removing it entirely was worse: with nothing to gain from
	 * speed, the population settled on crawling everywhere, which dodged every
	 * speed-related penalty and never needed the brake at all — measured, the champion
	 * cruised at a fifth of its top speed and braked in 0 % of its steps. Speed is
	 * only worth paying for when the road ahead is empty; that is precisely when it is
	 * safe, and it is exactly what the car has to learn to recognise.
	 */
	pace: 3,
	/** Per second alive. Small, but it keeps the very first generations comparable. */
	survival: 0.5,
} as const;

/**
 * PENALTIES — what we do not want. Subtracted from the fitness.
 *
 * Crash cost is graded rather than binary: slowing before contact preserves results,
 * while using a wall as a high-speed escape route preserves nothing.
 */
export const PENALTY = {
	/**
	 * Crashing costs a FRACTION of everything the run earned, and the fraction depends
	 * on how fast the car was going when it hit: `crashAtRest` when it barely touched,
	 * up to `crashAtFullSpeed` for a flat-out frontal impact.
	 *
	 * The shape is the whole point, in two steps.
	 *
	 * A flat number of points was wrong in both directions: small enough not to erase
	 * results (50) it made dying almost free — a run holding 300 points of overtakes
	 * lost only 50 by wrecking, and the champion pressed the brake in 0 % of its steps
	 * — while large enough to matter (200) it deleted the achievements themselves, so a
	 * car that overtook someone and then crashed finished on zero.
	 *
	 * A fraction fixed that, but a fraction alone is still a STEP function: crashed or
	 * not crashed, with nothing in between. Evolution needs a slope to climb, and
	 * between "hit the obstacle at 10" and "hit it at 2" there was no difference to
	 * find, even though the second is a car that has learned almost everything the
	 * first has not. Steering had a slope (a car that swerves a little gets a little
	 * further) which is exactly why the population learned to swerve and never to brake.
	 * Scaling the cost with impact speed gives braking its own slope: every bit of speed
	 * shed before an unavoidable impact pays immediately, which is how the behaviour
	 * gets discovered before it is perfected.
	 *
	 * A full-speed impact now costs 100 %. This closes the discovered exploit where a car
	 * blocked before its overtake deadline deliberately turned into the guardrail: dying
	 * froze its timeout clock while the old 50 % ceiling let it keep enough score to win.
	 * Gentle contact still costs only 10 %, preserving a continuous evolutionary slope.
	 */
	crashAtRest: 0.1,
	crashAtFullSpeed: 1,
	/** Per second spent stationary with nothing in the way — pure indecision. */
	stall: 5,
	/**
	 * THE ONE THAT TEACHES BRAKING. Charged per second while the available path is shorter
	 * than the safe distance implied by current speed, graded by how unsafe it is.
	 *
	 * Read "in its path" literally: the corridor the car's own body sweeps along its
	 * current heading, guard rails included (see `pathDistance` in `simulation.ts`).
	 * That is the only definition under which "there is something ahead of me" means
	 * what a driver means by it. A forward cone, which is what this used to use, calls
	 * the rail beside an outer lane an obstacle 105 px away at all times, and a car
	 * driving perfectly straight down that lane is charged for a hazard that does not
	 * exist.
	 *
	 * This is outcome-based: braking reduces the stopping distance, and steering removes
	 * the charge only after it really opens the swept corridor. A steering command by
	 * itself no longer excuses a trajectory that still ends inside an obstacle.
	 */
	hazard: 30,
	/** Per pixel driven backwards. Reverse is a manoeuvre, not a way to travel. */
	reverse: 0.05,
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
