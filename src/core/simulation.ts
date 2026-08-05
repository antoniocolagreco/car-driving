import { type Segment, type Vec2, polygonSegments, segmentIntersection } from '@core/geometry'
import {
    LEARNING_RATE,
    MANUAL_TRAINING,
    PARENT_COUNT,
    RACING_CAR,
    SENSOR_MAX_RANGE,
    SIMULATION,
    VETERANS,
} from '@core/config'
import {
    type Network,
    type NetworkGradients,
    type TrainingExample,
    accumulateNetworkGradients,
    applyAverageGradients,
    createNetworkGradients,
    feedForward,
    recordRace,
    trainBatch,
} from './neural-network'
import { rankRoster, selectRacers, updateRoster } from './veterans'
import { castSensors } from './sensor'
import {
    type FitnessSample,
    hasClearedCourse,
    hasMissedOvertakeDeadline,
    isStuck,
    recordOvertakeTimeout,
    selectBest,
    selectParents,
    updateStats,
} from './fitness'
import {
    type Car,
    type Controls,
    carShape,
    controlsFromOutputs,
    crash,
    networkInputs,
    stepCar,
} from './car'
import { type Road, createRoad } from './road'
import { generateTraffic } from './traffic'
import {
    type PopulationOptions,
    type RacingCar,
    createPlayerCar,
    createPopulation,
    isCompatibleNetwork,
} from './population'

/**
 * The orchestrator: wires the road, the population and the traffic together and
 * advances all of them by one fixed physics step at a time. This is the file to
 * read to understand the whole simulation, so `step` below is written to be read
 * top to bottom as the numbered sequence it implements, not as clever code.
 *
 * Mutability rule: `SimulationState` is one long-lived mutable
 * record, stepped in place 60 times a second; only its `readonly` fields (`road`)
 * never change after creation.
 */

/** The settings a user can change from the UI; a new population is built from these on `restart`. */
export type SimulationSettings = {
    readonly carsQuantity: number
    readonly mutationRate: number
    readonly hiddenLayers: readonly number[]
    /**
     * How many consecutive generations share one course layout. `Infinity` keeps the very
     * first layout forever, which is the one value that makes a whole run's scores
     * comparable. See `COURSE_INTERVALS`.
     */
    readonly generationsPerCourse: number
    /**
     * What one brake press is worth, counted in overtakes, to a car that also passed
     * somebody. Unlike everything else here it takes effect immediately rather than at the
     * next restart: it decides only how the field is RANKED, so applying it to the round
     * being watched costs nothing and answers the question the slider was moved to ask.
     * See `BRAKE_BONUSES`.
     */
    readonly brakeBonus: number
}

/** Everything the render and UI layers need to draw one frame and describe the race. */
export type SimulationState = {
    readonly road: Road
    cars: RacingCar[]
    traffic: Car[]
    aliveCars: RacingCar[]
    /** The car the camera follows: the leader while racing, the winner once the round ends. */
    activeCar?: RacingCar
    bestCar?: RacingCar
    /** The player's car: always part of `cars`, driven by hand only while asked. */
    playerCar?: RacingCar
    /** 1-based generation counter for the UI. */
    generation: number
    /** The best network so far: `parents[0]`, and the one the UI persists. */
    winner?: Network
    /** The networks the next generation is bred from, best first. */
    parents: Network[]
    /** The veterans archive, ordered by `rankRoster`. See `core/veterans.ts`. */
    veterans: Network[]
    /** The record holder, entered in every race while it is set. */
    champion?: Network
    gameOver: boolean
    /** True when a car passed every traffic car: the course is beaten, not merely survived. */
    courseCleared: boolean
    /** The first car to clear the course; retained throughout the victory celebration. */
    courseWinner?: RacingCar
    /** Seconds elapsed since `courseWinner` cleared the course. */
    victorySeconds: number
    /** Seconds spent on the game-over screen so far. */
    gameOverSeconds: number
    /** Seconds of simulated time in the current round. */
    elapsedSeconds: number
    /** Manual mode is armed, but physics stays frozen until the first driving input. */
    waitingForManualInput: boolean
    /** True while the player's car is controlled by the keyboard rather than its network. */
    manualDriving: boolean
}

/** The evolutionary loop: owns `state` and advances it, one fixed step at a time. */
export type Simulation = {
    readonly state: SimulationState
    /** Advances the world by one fixed step. */
    step(dt: number): void
    /** Starts a new generation. Keeps the current winner unless one is given. */
    restart(winner?: Network): void
    updateSettings(settings: SimulationSettings): void
    /** Starts a fresh round under manual control, initially frozen. */
    startManualDriving(controls: Controls): void
    /** Releases a manually armed round after the first driving key is pressed. */
    beginManualDriving(): void
    /** Gives the player's car back to its neural network without restarting the round. */
    stopManualDriving(): void
    /** Promotes the current best network immediately. */
    promoteBest(): Network | undefined
    /** Sets the record holder that races in every round from the next one on. */
    setChampion(champion: Network | undefined): void
}

/**
 * A completed course: everything the UI needs to decide whether this run is the new
 * record. `core/` does not know what a record is, it only reports the finish.
 */
export type CourseResult = {
    readonly network: Network
    /** Race seconds from the start line to passing the last traffic car. */
    readonly seconds: number
    /** How many traffic cars it passed, which for a finished course is all of them. */
    readonly overtakes: number
}

type ConsolidationState = {
    readonly network: Network
    epoch: number
    exampleIndex: number
    gradients: NetworkGradients
}

/** Turns `SimulationSettings` plus the networks entered by name into `PopulationOptions`. */
const toPopulationOptions = (
    settings: SimulationSettings,
    parents: readonly Network[],
    veterans: readonly Network[],
    champion: Network | undefined,
): PopulationOptions => ({
    quantity: settings.carsQuantity,
    hiddenLayers: settings.hiddenLayers,
    mutationRate: settings.mutationRate,
    parents,
    veterans,
    champion,
})

/**
 * A segment is only relevant to a car if it could possibly be touched by one of
 * its fixed perception areas: a cheap y-distance test against the deepest zone,
 * checked before polygon clipping. This avoids scanning distant obstacles for every car.
 * The deepest zone rather than each zone's own range, deliberately — this is a broad
 * phase, and it may only ever discard segments that NO zone could have seen.
 */
const isWithinRange = (segment: Segment, position: Vec2): boolean => {
    const reach = SENSOR_MAX_RANGE + RACING_CAR.height / 2
    const nearestY = Math.min(segment.a.y, segment.b.y) - reach
    const farthestY = Math.max(segment.a.y, segment.b.y) + reach
    return position.y >= nearestY && position.y <= farthestY
}

/** True when any edge of `polygon` crosses any of `segments` — a car-shaped polygon vs. a flat obstacle list. */
const polygonHitsSegments = (polygon: readonly Vec2[], segments: readonly Segment[]): boolean => {
    const edges = polygonSegments(polygon)
    for (const edge of edges) {
        for (const segment of segments) {
            if (segmentIntersection(edge, segment) !== null) {
                return true
            }
        }
    }
    return false
}

/**
 * Counts how many values in `ascendingYs` (sorted ascending) are strictly
 * greater than `y`, via binary search. Used to count overtakes without an
 * O(cars x traffic) scan every step: the traffic list is sorted once per step,
 * and every car answers "how many traffic cars are behind me" in O(log n).
 */
const countGreaterThan = (ascendingYs: readonly number[], y: number): number => {
    let low = 0
    let high = ascendingYs.length
    while (low < high) {
        const mid = (low + high) >>> 1
        if (ascendingYs[mid] <= y) {
            low = mid + 1
        } else {
            high = mid
        }
    }
    return ascendingYs.length - low
}

/** The car with the smallest y among `cars` — furthest along the road, since forward is -y. */
const leader = (cars: readonly RacingCar[]): RacingCar | undefined =>
    cars.reduce<RacingCar | undefined>(
        (best, car) =>
            best === undefined || car.car.position.y < best.car.position.y ? car : best,
        undefined,
    )

/**
 * Builds the pure evolutionary-loop simulation: no DOM, no canvas, no
 * localStorage. The winner network flows in through `options.winner` and
 * back out through `options.onGenerationEnd` — `app.ts` is what actually reads
 * and writes localStorage with it.
 */
export const createSimulation = (
    settings: SimulationSettings,
    options?: {
        readonly winner?: Network
        /** The stored veterans archive, restored across runs. */
        readonly veterans?: readonly Network[]
        /** The stored record holder, entered in every race from the first one on. */
        readonly champion?: Network
        readonly trafficSeed?: string | number
        /** Fired when a generation ends, with the network worth persisting. */
        readonly onGenerationEnd?: (winner: Network | undefined) => void
        /** Fired when a round ended with the course beaten, once, with the finisher's run. */
        readonly onCourseFinished?: (result: CourseResult) => void
        /** Fired when a generation ends, with the archive as it now stands. */
        readonly onVeteransChanged?: (veterans: readonly Network[]) => void
    },
): Simulation => {
    let currentSettings = settings
    /** While set, the player's car is driven by these instead of by its network. */
    let manualControls: Controls | undefined
    /** Whether a human actually held the wheel at any point during the current round. */
    let playerWasDriven = false
    /** Every demonstrated state/action pair in this manual round, in chronological order. */
    let manualExperiences: TrainingExample[] = []
    /** Rotates realtime replay across old examples without random omissions. */
    let realtimeReplayCursor = 0
    /** Full-dataset training accumulated at unchanged weights, one exact epoch at a time. */
    let consolidation: ConsolidationState | undefined
    const trafficSeed = options?.trafficSeed
    const onGenerationEnd = options?.onGenerationEnd
    const onCourseFinished = options?.onCourseFinished
    const onVeteransChanged = options?.onVeteransChanged
    const road = createRoad()

    const state: SimulationState = {
        road,
        cars: [],
        traffic: [],
        aliveCars: [],
        activeCar: undefined,
        bestCar: undefined,
        playerCar: undefined,
        generation: 0,
        winner: undefined,
        parents: [],
        veterans: [...(options?.veterans ?? [])],
        champion: options?.champion,
        gameOver: false,
        courseCleared: false,
        courseWinner: undefined,
        victorySeconds: 0,
        gameOverSeconds: 0,
        elapsedSeconds: 0,
        waitingForManualInput: false,
        manualDriving: false,
    }

    /** True once `racingCar` has passed the last traffic car of the current course. */
    const hasFinished = (racingCar: RacingCar): boolean =>
        hasClearedCourse(racingCar.stats, state.traffic.length)

    const currentObstacleSegments = (): Segment[] => {
        const segments: Segment[] = [...state.road.borders]
        for (const trafficCar of state.traffic) {
            segments.push(...polygonSegments(carShape(trafficCar)))
        }
        return segments
    }

    /**
     * Starts a new generation. Keeps the current winner unless one is given.
     *
     * The course is seeded by the generation number divided by
     * `settings.generationsPerCourse`, so a block of consecutive generations shares one
     * layout and the next block draws a new one. Fully reproducible for a whole run, and
     * varied enough that a winner has to re-earn its place on layouts it has never seen,
     * so what survives is the skill and not the memory. `COURSE_INTERVALS` documents what
     * both ends of that setting cost.
     */
    const restart = (winner?: Network): void => {
        // A winner handed in from outside (a restored backup) replaces the whole
        // parent pool: the user asked for that network, not for its old rivals.
        const requestedParents: readonly Network[] = winner ? [winner] : state.parents
        const parents: Network[] = requestedParents.filter((parent) =>
            isCompatibleNetwork(parent, currentSettings.hiddenLayers),
        )

        state.generation += 1

        // Recomputed every round rather than held: the ordering depends on medians that
        // the previous round has just moved.
        const racingVeterans: Network[] = selectRacers(state.veterans, currentSettings.carsQuantity)

        const options = toPopulationOptions(
            currentSettings,
            parents,
            racingVeterans,
            state.champion,
        )
        state.cars = createPopulation(road, options)

        // The player's car is always in the field: one more competitor, drawn, colliding,
        // scored and able to win the winnership. Whether a keyboard or its own network
        // holds the wheel is decided by `startManualDriving` / `stopManualDriving`.
        state.playerCar = createPlayerCar(road, options)
        state.cars.push(state.playerCar)
        playerWasDriven = false
        manualExperiences = []
        realtimeReplayCursor = 0
        consolidation = undefined
        // Dividing by `Infinity` is what makes the "never randomise" setting free: every
        // generation floors to seed 0, so the course stays exactly the one the run opened on.
        state.traffic = generateTraffic(
            road,
            SIMULATION.trafficRows,
            trafficSeed ??
                Math.floor((state.generation - 1) / currentSettings.generationsPerCourse),
        )
        state.aliveCars = state.cars
        state.activeCar = state.cars[0]
        state.bestCar = undefined
        state.parents = parents
        state.winner = parents[0]
        state.gameOver = false
        state.courseCleared = false
        state.courseWinner = undefined
        state.victorySeconds = 0
        state.gameOverSeconds = 0
        state.elapsedSeconds = 0
        state.waitingForManualInput = false
        state.manualDriving = manualControls !== undefined
    }

    // The first generation, right away.
    restart(options?.winner)

    const rememberExperience = (experience: TrainingExample): void => {
        if (manualExperiences.length >= MANUAL_TRAINING.experienceCapacity) {
            manualExperiences.shift()
            realtimeReplayCursor = Math.max(0, realtimeReplayCursor - 1)
        }
        manualExperiences.push(experience)
    }

    /** Current example plus a deterministic rotating slice of the previous experience. */
    const realtimeBatch = (current: TrainingExample): TrainingExample[] => {
        const batch: TrainingExample[] = [current]
        const olderCount: number = manualExperiences.length - 1
        const replayCount: number = Math.min(MANUAL_TRAINING.realtimeBatchSize - 1, olderCount)

        for (let offset = 0; offset < replayCount; offset++) {
            const index: number = (realtimeReplayCursor + offset) % olderCount
            batch.push(manualExperiences[index])
        }
        if (olderCount > 0) {
            realtimeReplayCursor = (realtimeReplayCursor + replayCount) % olderCount
        }
        return batch
    }

    const beginConsolidation = (network: Network): void => {
        if (manualExperiences.length === 0 || consolidation?.network === network) {
            return
        }
        consolidation = {
            network,
            epoch: 0,
            exampleIndex: 0,
            gradients: createNetworkGradients(network),
        }
    }

    /** Processes at most `budget` examples; weights change only after a whole epoch. */
    const processConsolidation = (budget: number): void => {
        if (!consolidation) {
            return
        }

        let remaining: number = budget
        while (remaining > 0 && consolidation.epoch < MANUAL_TRAINING.consolidationEpochs) {
            const example: TrainingExample = manualExperiences[consolidation.exampleIndex]
            accumulateNetworkGradients(consolidation.network, example, consolidation.gradients)
            consolidation.exampleIndex += 1
            remaining -= 1

            if (consolidation.exampleIndex === manualExperiences.length) {
                applyAverageGradients(
                    consolidation.network,
                    consolidation.gradients,
                    MANUAL_TRAINING.consolidationLearningRate,
                )
                consolidation.epoch += 1
                consolidation.exampleIndex = 0
                if (consolidation.epoch < MANUAL_TRAINING.consolidationEpochs) {
                    consolidation.gradients = createNetworkGradients(consolidation.network)
                }
            }
        }
    }

    /** Guarantees that all configured full-dataset epochs finish before persistence. */
    const completeConsolidation = (network: Network): void => {
        beginConsolidation(network)
        if (!consolidation || consolidation.network !== network) {
            return
        }
        const remainingExamples: number =
            (MANUAL_TRAINING.consolidationEpochs - consolidation.epoch) * manualExperiences.length -
            consolidation.exampleIndex
        processConsolidation(remainingExamples)
    }

    /**
     * Writes this round into the history of every network that drove it, then admits
     * the round's best to the archive and drops whoever no longer fits.
     *
     * Every car, not only the good ones. A history made of successes measures nothing:
     * the median exists to say what a network does on a TYPICAL course, and the courses
     * it fails are most of what makes a course typical.
     *
     * Recording comes before admission so a newly admitted network arrives already
     * holding the race that earned it, rather than with an empty record and a median of
     * zero that would place it below everybody on the way in.
     *
     * The time is what records the finish, and every finisher gets one rather than only
     * the car that got there first. The last overtake of a cleared course IS the last
     * traffic car, so that timestamp is the finish line; second across it still crossed it.
     */
    const recordRaceResults = (): void => {
        for (const racingCar of state.cars) {
            recordRace(racingCar.network, {
                overtakes: racingCar.stats.overtakes,
                seconds: hasFinished(racingCar) ? racingCar.stats.lastOvertakeAtSeconds : undefined,
            })
        }

        const admitted: Network[] = selectParents(
            state.cars,
            VETERANS.admittedPerRace,
            currentSettings.brakeBonus,
        ).map((car) => car.network)
        state.veterans = rankRoster(updateRoster(state.veterans, admitted))
        onVeteransChanged?.(state.veterans)
    }

    /** Finalizes parent selection and enters the game-over phase exactly once. */
    const finishGeneration = (): void => {
        const roundWinner: RacingCar | undefined = state.bestCar

        // The demonstration is trained in before a single result is written down, so that
        // everything below files the race under the network that will actually drive the
        // next one. Consolidation rewrites the weights, and with them the content-addressed
        // id, so running it afterwards would leave the archive saved with the weights that
        // raced while the copy in memory carried the trained ones.
        if (roundWinner && playerWasDriven && roundWinner === state.playerCar) {
            completeConsolidation(roundWinner.network)
        }

        recordRaceResults()

        if (roundWinner) {
            roundWinner.network.generation += 1

            // Whoever wins the round takes the seat for the next one. Nothing protects an
            // incumbent here, because scores from different layouts are not comparable
            // anyway; what stops a good network from being lost to one bad draw is the
            // archive, which keeps it racing on its median rather than on this round.
            //
            // The player's network is ranked here like any other competitor. It used to
            // take over the whole pool whenever a human won, which threw away three
            // working lineages on the strength of one lap somebody drove by hand; winning
            // already makes it `parents[0]`, which is elitism plus the entire refining
            // band, and that is what "the next generation is bred from your driving" means.
            const ranked: Network[] = selectParents(
                state.cars,
                PARENT_COUNT,
                currentSettings.brakeBonus,
            ).map((car) => car.network)

            // The head of the pool is whoever the round crowned, and when the course was
            // cleared that is the first car across the line rather than the highest score.
            // The two can disagree: every finisher passed the same traffic, so the round
            // score separates them only by the brake bonus, and a later finisher that
            // happened to touch the brake must not displace the car that got there first.
            // Below the head, the ordinary ranking. When nobody cleared the course the
            // round winner already leads that ranking and this changes nothing.
            state.parents = [
                roundWinner.network,
                ...ranked.filter((network) => network !== roundWinner.network),
            ].slice(0, PARENT_COUNT)
            state.winner = state.parents[0]
        }

        // A human demonstration that beat the course is therefore reported in its
        // consolidated form: the network that goes on to drive, not the half-trained one it
        // held while the player was steering.
        // `lastOvertakeAtSeconds` is the finish line here, since the last overtake of a
        // cleared course IS the last traffic car: the victory parade is not part of it.
        if (state.courseCleared && state.courseWinner) {
            onCourseFinished?.({
                network: state.courseWinner.network,
                seconds: state.courseWinner.stats.lastOvertakeAtSeconds,
                overtakes: state.courseWinner.stats.overtakes,
            })
        }

        onGenerationEnd?.(state.winner)
        state.gameOver = true
        state.gameOverSeconds = 0
    }

    /**
     * Re-casts the followed car's perception against the current poses of everything
     * around it. Only the followed car, because this exists for what is drawn on screen:
     * it changes no controls, no network input and no score.
     *
     * A crashed car is skipped on purpose. Collision is detected once the bodies already
     * overlap, so a wreck sits partly through whatever it hit, and against the guard rail
     * that puts the sensor origin outside the road with the whole radar drawn beyond the
     * barrier. Leaving the reading untouched keeps the last one taken before the impact,
     * which is both inside the road and the more informative picture: what the car saw on
     * its way in.
     */
    const refreshFollowedSensors = (): void => {
        const followedCar: RacingCar | undefined = state.activeCar
        if (!followedCar || followedCar.car.crashed) {
            return
        }
        const renderObstacles: Segment[] = currentObstacleSegments()
        const nearbyRenderObstacles: Segment[] = renderObstacles.filter((segment) =>
            isWithinRange(segment, followedCar.car.position),
        )
        followedCar.sensorState = castSensors(
            followedCar.car.position,
            followedCar.car.heading,
            nearbyRenderObstacles,
        )
    }

    const step = (dt: number): void => {
        if (state.waitingForManualInput) {
            // The race has not started, but the car is already on the grid with its radar
            // on screen. Without this the panel would keep showing the empty state the car
            // was built with, reporting clear road straight through the traffic ahead.
            refreshFollowedSensors()
            return
        }

        state.elapsedSeconds += dt

        // Victory is a live five-second parade. The simulation keeps stepping below,
        // while the winner is protected from collision/timeout retirement and remains
        // the camera target. When the parade expires, retire only the other cars: the
        // winner keeps driving, alive, until the next generation replaces the field.
        if (state.courseCleared && !state.gameOver) {
            state.victorySeconds += dt
            if (
                playerWasDriven &&
                state.courseWinner !== undefined &&
                state.courseWinner === state.playerCar
            ) {
                beginConsolidation(state.courseWinner.network)
                const celebrationSteps: number = Math.ceil(
                    SIMULATION.victoryCelebrationSeconds / SIMULATION.stepSeconds,
                )
                const examplesPerStep: number = Math.ceil(
                    (manualExperiences.length * MANUAL_TRAINING.consolidationEpochs) /
                        celebrationSteps,
                )
                processConsolidation(examplesPerStep)
            }
            if (state.victorySeconds >= SIMULATION.victoryCelebrationSeconds) {
                // Everybody who did not make it is stopped where they stand, and stopped
                // is all it is: the race ended around them rather than under them, so no
                // retirement is recorded against them. Every car that crossed the line
                // drives on, however many of them there are.
                for (const racingCar of state.aliveCars) {
                    if (!hasFinished(racingCar)) {
                        crash(racingCar.car)
                    }
                }
                state.aliveCars = state.cars.filter((racingCar) => !racingCar.car.crashed)
                state.bestCar = state.courseWinner
                state.activeCar = state.courseWinner
                for (const racingCar of state.cars) {
                    racingCar.winner = racingCar === state.courseWinner
                }
                finishGeneration()
                return
            }
        }

        // 1. Build the full obstacle list once for this step: every traffic car's
        // polygon edges, plus the two road borders. Every car below reuses this
        // instead of rebuilding it per perception zone, per car.
        //
        // The guard rails belong in this list, for perception as much as for the
        // collision test. A car that cannot see the wall it is about to hit is not a
        // car being simulated, and hiding an obstacle from the sensors to make the
        // readings look tidier only moves the problem into the crash counter.
        const obstacles: Segment[] = currentObstacleSegments()

        // Traffic y-positions, sorted once, so "how many traffic cars are
        // behind me" (used below, per car) is a binary search instead of a
        // full scan of the traffic list for every one of potentially hundreds
        // of cars.
        const trafficYsAscending = state.traffic
            .map((trafficCar) => trafficCar.position.y)
            .sort((a, b) => a - b)

        // 2. Drive every living car through exactly one physics step. Sensors
        // are cast once per car here and reused for both driving and scoring
        // — never cast a second time, which is what the old scoring code did.
        for (const racingCar of state.aliveCars) {
            const { car, network, stats } = racingCar

            const nearbyObstacles = obstacles.filter((segment) =>
                isWithinRange(segment, car.position),
            )

            const sensorState = castSensors(car.position, car.heading, nearbyObstacles)
            racingCar.sensorState = sensorState

            const inputs = networkInputs(car, sensorState.readings)
            // The network runs even for a manually driven car: its outputs are ignored,
            // but the visualizer reads the caches `feedForward` fills, so driving by hand
            // shows you what the winner's brain would have done in the same spot.
            const outputs = feedForward(network, inputs)
            const humanControls = racingCar === state.playerCar ? manualControls : undefined
            if (humanControls) {
                car.controls = { ...humanControls }
                const hasDrivingIntent: boolean =
                    humanControls.throttle !== 0 ||
                    humanControls.brake !== 0 ||
                    humanControls.steering !== 0
                if (hasDrivingIntent) {
                    playerWasDriven = true
                }
                if (playerWasDriven && !state.courseCleared) {
                    // Once the demonstration begins, keep every frame — including deliberate
                    // coasting — and rehearse old observations in a rotating realtime batch.
                    const experience: TrainingExample = {
                        inputs: [...inputs],
                        targets: [
                            humanControls.throttle,
                            humanControls.brake,
                            humanControls.steering,
                        ],
                    }
                    rememberExperience(experience)
                    trainBatch(network, realtimeBatch(experience), LEARNING_RATE)
                    // Batch replay leaves visualizer caches on its last historical sample.
                    // Restore the live observation without applying another update.
                    feedForward(network, inputs)
                }
            } else {
                car.controls = controlsFromOutputs(outputs)
            }

            stepCar(car, dt)

            const collided: boolean = polygonHitsSegments(carShape(car), nearbyObstacles)

            const sample: FitnessSample = {
                position: car.position,
                overtakes: countGreaterThan(trafficYsAscending, car.position.y),
                brake: car.controls.brake,
                speed: car.speed,
            }
            updateStats(stats, sample, dt)

            // Read after the stats are updated, so a car is protected from the very step
            // on which it passes the last traffic car rather than from the next one. A
            // finished race cannot be taken back: whoever crossed the line keeps driving,
            // exempt from all three retirements, until the round closes.
            const finished: boolean = hasFinished(racingCar)

            // A crash costs nothing beyond what it takes away by itself: the wreck stops
            // overtaking, and everyone still driving passes it in the only currency there is.
            if (collided && !finished) {
                crash(car)
            }

            // Retire cars that fail the independent minimum-progress timeout.
            if (!finished && isStuck(stats)) {
                crash(car)
            }

            // A car must keep overtaking, not merely moving. Missing the deadline retires it
            // AND marks the result ineligible, so it cannot win or reproduce however many
            // overtakes it had banked before it stopped racing.
            if (!finished && hasMissedOvertakeDeadline(stats)) {
                recordOvertakeTimeout(stats)
                crash(car)
            }
        }

        // 3. Traffic drives itself forward at a fixed throttle, unaffected by
        // the racing cars — it keeps moving even through the game-over screen.
        for (const trafficCar of state.traffic) {
            stepCar(trafficCar, dt)
        }

        // 4. Retire whoever is still alive at the round's time ceiling. The idle
        // timeout above only catches cars that stop making progress; a car that
        // keeps driving down the empty road past the last traffic row makes
        // progress forever, so without this the generation would never end.
        // Reaching the ceiling is retirement, not an additional scoring event.
        if (!state.courseCleared && state.elapsedSeconds >= SIMULATION.maxRoundSeconds) {
            for (const racingCar of state.aliveCars) {
                crash(racingCar.car)
            }
        }

        // 5. Recompute who is still racing.
        state.aliveCars = state.cars.filter((racingCar) => !racingCar.car.crashed)

        // 6. Find the best car across the WHOLE population, crashed cars
        // included — an eligible car keeps the overtakes earned before impact — and
        // flag it for the renderer/HUD.
        state.bestCar = state.courseCleared
            ? state.courseWinner
            : selectBest(state.cars, currentSettings.brakeBonus)
        for (const racingCar of state.cars) {
            racingCar.winner = racingCar === state.bestCar
        }

        // 7. The camera follows the leader while cars remain; once nobody is
        // left racing it follows the winner instead. While a human is driving, it stays
        // on their car for as long as they are alive — the point of watching is what you
        // are doing, not who happens to be ahead.
        // Watch the player's car while a human is driving it; otherwise follow the leader.
        const humanCar = manualControls ? state.playerCar : undefined
        state.activeCar =
            state.courseCleared && state.courseWinner
                ? state.courseWinner
                : humanCar && !humanCar.car.crashed
                  ? humanCar
                  : state.aliveCars.length > 0
                    ? leader(state.aliveCars)
                    : state.bestCar

        // Driving decisions intentionally use the observation from the beginning of the
        // step. Rendering that same polygon after the car has moved leaves it one frame
        // behind, up to 10 px at top speed, so the followed car is re-cast against the
        // final poses here.
        refreshFollowedSensors()

        // 8. Somebody passed every traffic car: remember who crossed first and begin a
        // five-second celebration. The field keeps running during it, and even if every
        // car stops first, the generation cannot close before the banner has had its time.
        //
        // Crossing the line is what is looked for here, rather than the round's best score.
        // The two are not the same question: the brake bonus is worth ten overtakes, so it
        // can lift a car that stopped one short of the finish above a car that actually
        // finished, which would both crown the wrong winner and hide the finish entirely.
        // Whoever passed the last traffic car earliest is the winner, and that is all.
        if (!state.courseCleared) {
            let firstAcross: RacingCar | undefined
            for (const racingCar of state.cars) {
                if (!hasFinished(racingCar)) {
                    continue
                }
                if (
                    firstAcross === undefined ||
                    racingCar.stats.lastOvertakeAtSeconds < firstAcross.stats.lastOvertakeAtSeconds
                ) {
                    firstAcross = racingCar
                }
            }
            if (firstAcross) {
                state.courseCleared = true
                state.courseWinner = firstAcross
                state.bestCar = firstAcross
                for (const racingCar of state.cars) {
                    racingCar.winner = racingCar === firstAcross
                }
                state.victorySeconds = 0
            }
        }

        // 9. Outside a victory celebration, an empty field closes immediately.
        if (state.aliveCars.length === 0 && !state.gameOver && !state.courseCleared) {
            finishGeneration()
        }
        if (state.gameOver) {
            state.gameOverSeconds += dt
            if (state.gameOverSeconds >= SIMULATION.gameOverSeconds) {
                restart()
            }
        }
    }

    const updateSettings = (nextSettings: SimulationSettings): void => {
        // Applied on the next `restart`, not immediately: changing the cars
        // quantity or hidden layers must not disrupt the round in progress.
        currentSettings = nextSettings
    }

    const promoteBest = (): Network | undefined => {
        if (!state.bestCar) {
            return undefined
        }

        state.parents = [
            state.bestCar.network,
            ...state.parents.filter((n) => n !== state.bestCar?.network),
        ].slice(0, PARENT_COUNT)
        state.winner = state.bestCar.network
        return state.winner
    }

    const startManualDriving = (controls: Controls): void => {
        manualControls = controls
        restart()
        // Keep the camera on the player at its assigned lane on the shared start line.
        if (state.playerCar) {
            state.activeCar = state.playerCar
        }
        state.manualDriving = true
        state.waitingForManualInput = true
    }

    const beginManualDriving = (): void => {
        if (manualControls) {
            state.waitingForManualInput = false
        }
    }

    const stopManualDriving = (): void => {
        manualControls = undefined
        state.manualDriving = false
        state.waitingForManualInput = false
    }

    /**
     * Takes effect from the next round, not this one. The record is set by a car that is
     * currently on the track, and adding its network to the grid it is already racing on
     * would put the same weights in two bodies at once.
     */
    const setChampion = (champion: Network | undefined): void => {
        state.champion = champion
    }

    return {
        state,
        setChampion,
        step,
        restart,
        updateSettings,
        startManualDriving,
        beginManualDriving,
        stopManualDriving,
        promoteBest,
    }
}
