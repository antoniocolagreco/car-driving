import { type Segment, type Vec2, polygonSegments, segmentIntersection } from '@core/geometry'
import {
    LEARNING_RATE,
    MANUAL_TRAINING,
    PARENT_COUNT,
    RACING_CAR,
    SENSOR,
    SIMULATION,
} from '@core/config'
import {
    type Network,
    type NetworkGradients,
    type TrainingExample,
    accumulateNetworkGradients,
    applyAverageGradients,
    createNetworkGradients,
    feedForward,
    trainBatch,
} from './neural-network'
import { castSensors } from './sensor'
import {
    type FitnessSample,
    hasMissedOvertakeDeadline,
    isStuck,
    recordCrash,
    recordOvertakeTimeout,
    recordTimeout,
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
    champion?: Network
    /** The networks the next generation is bred from, best first. */
    parents: Network[]
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
    /** Starts a new generation. Keeps the current champion unless one is given. */
    restart(champion?: Network): void
    updateSettings(settings: SimulationSettings): void
    /** Starts a fresh round under manual control, initially frozen. */
    startManualDriving(controls: Controls): void
    /** Releases a manually armed round after the first driving key is pressed. */
    beginManualDriving(): void
    /** Gives the player's car back to its neural network without restarting the round. */
    stopManualDriving(): void
    /** Promotes the current best network immediately. */
    promoteBest(): Network | undefined
}

type ConsolidationState = {
    readonly network: Network
    epoch: number
    exampleIndex: number
    gradients: NetworkGradients
}

/** Turns `SimulationSettings` plus an optional champion into `PopulationOptions`. */
const toPopulationOptions = (
    settings: SimulationSettings,
    parents: readonly Network[],
): PopulationOptions => ({
    quantity: settings.carsQuantity,
    hiddenLayers: settings.hiddenLayers,
    mutationRate: settings.mutationRate,
    parents,
})

/**
 * A segment is only relevant to a car if it could possibly be touched by one of
 * its fixed perception area: a cheap y-distance test against the sensor range,
 * checked before polygon clipping. This avoids scanning distant obstacles for every car.
 */
const isWithinRange = (segment: Segment, position: Vec2): boolean => {
    const reach = SENSOR.range + RACING_CAR.height / 2
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
 * localStorage. The champion network flows in through `options.champion` and
 * back out through `options.onGenerationEnd` — `app.ts` is what actually reads
 * and writes localStorage with it.
 */
export const createSimulation = (
    settings: SimulationSettings,
    options?: {
        readonly champion?: Network
        readonly trafficSeed?: string | number
        /** Fired when a generation ends, with the network worth persisting. */
        readonly onGenerationEnd?: (champion: Network | undefined) => void
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
        champion: undefined,
        parents: [],
        gameOver: false,
        courseCleared: false,
        courseWinner: undefined,
        victorySeconds: 0,
        gameOverSeconds: 0,
        elapsedSeconds: 0,
        waitingForManualInput: false,
        manualDriving: false,
    }

    const currentObstacleSegments = (): Segment[] => {
        const segments: Segment[] = [...state.road.borders]
        for (const trafficCar of state.traffic) {
            segments.push(...polygonSegments(carShape(trafficCar)))
        }
        return segments
    }

    /**
     * Starts a new generation. Keeps the current champion unless one is given.
     *
     * Each generation gets its own course, seeded by the generation number: still
     * fully reproducible for a whole run, but a different layout every time. A
     * single fixed course looks tempting — fitness becomes directly comparable
     * across generations — and it is a trap. Measured: with one fixed course the
     * champion stalled at 1935 px for nine generations straight, because the
     * population was not learning to drive, it was memorising one arrangement of
     * obstacles and then hitting the same wall forever. Varying the course means a
     * champion has to re-earn its place on layouts it has never seen, so what
     * survives is the skill and not the memory.
     */
    const restart = (champion?: Network): void => {
        // A champion handed in from outside (a restored backup) replaces the whole
        // parent pool: the user asked for that network, not for its old rivals.
        const requestedParents: readonly Network[] = champion ? [champion] : state.parents
        const parents: Network[] = requestedParents.filter((parent) =>
            isCompatibleNetwork(parent, currentSettings.hiddenLayers),
        )

        state.generation += 1

        const options = toPopulationOptions(currentSettings, parents)
        state.cars = createPopulation(road, options)

        // The player's car is always in the field: one more competitor, drawn, colliding,
        // scored and able to win the championship. Whether a keyboard or its own network
        // holds the wheel is decided by `startManualDriving` / `stopManualDriving`.
        state.playerCar = createPlayerCar(road, options)
        state.cars.push(state.playerCar)
        playerWasDriven = false
        manualExperiences = []
        realtimeReplayCursor = 0
        consolidation = undefined
        state.traffic = generateTraffic(
            road,
            SIMULATION.trafficRows,
            trafficSeed ?? Math.floor((state.generation - 1) / SIMULATION.generationsPerCourse),
        )
        state.aliveCars = state.cars
        state.activeCar = state.cars[0]
        state.bestCar = undefined
        state.parents = parents
        state.champion = parents[0]
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
    restart(options?.champion)

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

    /** Finalizes parent selection and enters the game-over phase exactly once. */
    const finishGeneration = (): void => {
        const winner: RacingCar | undefined = state.bestCar
        if (winner) {
            if (playerWasDriven && winner === state.playerCar) {
                completeConsolidation(winner.network)
            }
            winner.network.generation += 1

            // Every successful round elects its own winner as the next white champion.
            // Historical `bestFitness` remains useful telemetry for a network, but it no
            // longer protects an incumbent from a lower-scoring winner on a new course.
            const rankedNetworks: Network[] = selectParents(state.cars, PARENT_COUNT).map(
                (car) => car.network,
            )

            // A winning human demonstration takes over the whole parent pool, so the next
            // generation develops the network that was just taught.
            state.parents =
                playerWasDriven && winner === state.playerCar ? [winner.network] : rankedNetworks
            state.champion = state.parents[0]
        }
        onGenerationEnd?.(state.champion)
        state.gameOver = true
        state.gameOverSeconds = 0
    }

    const step = (dt: number): void => {
        if (state.waitingForManualInput) {
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
                for (const racingCar of state.aliveCars) {
                    if (racingCar !== state.courseWinner) {
                        crash(racingCar.car)
                    }
                }
                state.aliveCars = state.courseWinner ? [state.courseWinner] : []
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
            const isCelebratingWinner: boolean =
                state.courseCleared && racingCar === state.courseWinner

            const nearbyObstacles = obstacles.filter((segment) =>
                isWithinRange(segment, car.position),
            )

            const sensorState = castSensors(car.position, car.heading, nearbyObstacles)
            racingCar.sensorState = sensorState

            const inputs = networkInputs(car, sensorState.readings)
            // The network runs even for a manually driven car: its outputs are ignored,
            // but the visualizer reads the caches `feedForward` fills, so driving by hand
            // shows you what the champion's brain would have done in the same spot.
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
            }
            updateStats(stats, sample, dt)

            if (collided && !isCelebratingWinner) {
                recordCrash(stats, Math.abs(car.speed) / car.spec.maxSpeed)
                crash(car)
            }

            // Retire cars that fail the independent minimum-progress timeout.
            if (!isCelebratingWinner && isStuck(stats)) {
                recordTimeout(stats)
                crash(car)
            }

            // A car must keep overtaking, not merely moving. Missing the deadline eliminates
            // it, applies the maximum failure malus and marks the result ineligible, so it
            // cannot reproduce. The residual score remains visible as telemetry.
            if (!isCelebratingWinner && hasMissedOvertakeDeadline(stats)) {
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
        state.bestCar = state.courseCleared ? state.courseWinner : selectBest(state.cars)
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
        // behind (up to 10 px at top speed), so refresh only the followed car against the
        // final car/traffic poses. This changes no controls, fitness or network input.
        if (state.activeCar) {
            const followedCar: RacingCar = state.activeCar
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

        // 8. Keep the best car's network's all-time-best fitness up to date,
        // regardless of whether this round ends up being the one that closes
        // out the generation.
        if (state.bestCar) {
            state.bestCar.network.bestFitness = Math.max(
                state.bestCar.network.bestFitness,
                state.bestCar.stats.fitness,
            )
        }

        // 9. Somebody passed every traffic car: remember the first winner and begin a
        // five-second celebration. The field keeps running during it, and even if every
        // car stops first, the generation cannot close before the banner has had its time.
        if (
            !state.courseCleared &&
            state.traffic.length > 0 &&
            state.bestCar &&
            state.bestCar.stats.overtakes >= state.traffic.length
        ) {
            state.courseCleared = true
            state.courseWinner = state.bestCar
            state.victorySeconds = 0
        }

        // 10. Outside a victory celebration, an empty field closes immediately.
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

        state.bestCar.network.bestFitness = Math.max(
            state.bestCar.network.bestFitness,
            state.bestCar.stats.fitness,
        )
        state.parents = [
            state.bestCar.network,
            ...state.parents.filter((n) => n !== state.bestCar?.network),
        ].slice(0, PARENT_COUNT)
        state.champion = state.bestCar.network
        return state.champion
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

    return {
        state,
        step,
        restart,
        updateSettings,
        startManualDriving,
        beginManualDriving,
        stopManualDriving,
        promoteBest,
    }
}
