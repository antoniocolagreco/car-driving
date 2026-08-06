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
    type RankingRules,
    hasClearedCourse,
    hasMissedOvertakeDeadline,
    isStuck,
    eliminate,
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

/** Owns the mutable race state and advances it in fixed physics steps. */

export type SimulationSettings = {
    readonly carsQuantity: number
    readonly mutationRate: number
    readonly hiddenLayers: readonly number[]
    /** `Infinity` keeps the first layout forever. */
    readonly generationsPerCourse: number
    /** Live ranking bonus for discovering the brake after an overtake. */
    readonly brakeBonus: number
}

export type SimulationState = {
    readonly road: Road
    cars: RacingCar[]
    traffic: Car[]
    aliveCars: RacingCar[]
    /** Camera target. */
    activeCar?: RacingCar
    bestCar?: RacingCar
    /** Always part of `cars`; manual control is optional. */
    playerCar?: RacingCar
    generation: number
    /** `parents[0]`, persisted by the UI. */
    winner?: Network
    /** Breeding pool, best first. */
    parents: Network[]
    /** Archive ordered by `rankRoster`. */
    veterans: Network[]
    /** Record holder entered in each compatible race. */
    champion?: Network
    gameOver: boolean
    /** True after the first car passes all traffic. */
    courseCleared: boolean
    /** First finisher, retained through the victory parade. */
    courseWinner?: RacingCar
    victorySeconds: number
    gameOverSeconds: number
    elapsedSeconds: number
    /** Manual mode is armed but frozen until the first driving input. */
    waitingForManualInput: boolean
    manualDriving: boolean
}

export type Simulation = {
    readonly state: SimulationState
    step(dt: number): void
    /** Starts a new generation. Keeps the current winner unless one is given. */
    restart(winner?: Network): void
    updateSettings(settings: SimulationSettings): void
    /** Starts a fresh manual round, initially frozen. */
    startManualDriving(controls: Controls): void
    /** Releases a manually armed round after the first driving key is pressed. */
    beginManualDriving(): void
    /** Returns the player's car to neural control without restarting. */
    stopManualDriving(): void
    promoteBest(): Network | undefined
    /** Sets the record holder for subsequent rounds. */
    setChampion(champion: Network | undefined): void
}

/** Completed-course data reported to the UI. */
export type CourseResult = {
    readonly network: Network
    readonly seconds: number
    readonly overtakes: number
}

type ConsolidationState = {
    readonly network: Network
    epoch: number
    exampleIndex: number
    gradients: NetworkGradients
}

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

/** Broad-phase y check; it may discard only segments beyond every sensor zone. */
const isWithinRange = (segment: Segment, position: Vec2): boolean => {
    const reach = SENSOR_MAX_RANGE + RACING_CAR.height / 2
    const nearestY = Math.min(segment.a.y, segment.b.y) - reach
    const farthestY = Math.max(segment.a.y, segment.b.y) + reach
    return position.y >= nearestY && position.y <= farthestY
}

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

/** Counts values greater than `y` in a sorted array by binary search. */
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

/** Furthest car along the road; forward is negative y. */
const leader = (cars: readonly RacingCar[]): RacingCar | undefined =>
    cars.reduce<RacingCar | undefined>(
        (best, car) =>
            best === undefined || car.car.position.y < best.car.position.y ? car : best,
        undefined,
    )

/** Builds the core simulation without DOM, canvas or storage access. */
export const createSimulation = (
    settings: SimulationSettings,
    options?: {
        readonly winner?: Network
        readonly veterans?: readonly Network[]
        readonly champion?: Network
        readonly trafficSeed?: string | number
        readonly onGenerationEnd?: (winner: Network | undefined) => void
        /** Fired once when a round produces a finisher. */
        readonly onCourseFinished?: (result: CourseResult) => void
        readonly onVeteransChanged?: (veterans: readonly Network[]) => void
    },
): Simulation => {
    let currentSettings = settings
    let manualControls: Controls | undefined
    let playerWasDriven = false
    let manualExperiences: TrainingExample[] = []
    let realtimeReplayCursor = 0
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

    const rankingRules = (): RankingRules => ({
        brakeBonus: currentSettings.brakeBonus,
        trafficCount: state.traffic.length,
    })

    const hasFinished = (racingCar: RacingCar): boolean =>
        hasClearedCourse(racingCar.stats, state.traffic.length)

    const currentObstacleSegments = (): Segment[] => {
        const segments: Segment[] = [...state.road.borders]
        for (const trafficCar of state.traffic) {
            segments.push(...polygonSegments(carShape(trafficCar)))
        }
        return segments
    }

    /** Starts a generation; each interval-sized block shares a deterministic layout. */
    const restart = (winner?: Network): void => {
        // An explicitly supplied winner replaces the existing parent pool.
        const requestedParents: readonly Network[] = winner ? [winner] : state.parents
        const parents: Network[] = requestedParents.filter((parent) =>
            isCompatibleNetwork(parent, currentSettings.hiddenLayers),
        )

        state.generation += 1

        const racingVeterans: Network[] = selectRacers(state.veterans, currentSettings.carsQuantity)

        const options = toPopulationOptions(
            currentSettings,
            parents,
            racingVeterans,
            state.champion,
        )
        state.cars = createPopulation(road, options)

        // The player remains a scored competitor under either manual or neural control.
        state.playerCar = createPlayerCar(road, options)
        state.cars.push(state.playerCar)
        playerWasDriven = false
        manualExperiences = []
        realtimeReplayCursor = 0
        consolidation = undefined
        // Division by Infinity keeps the seed at zero for the fixed-layout setting.
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

    restart(options?.winner)

    const rememberExperience = (experience: TrainingExample): void => {
        if (manualExperiences.length >= MANUAL_TRAINING.experienceCapacity) {
            manualExperiences.shift()
            realtimeReplayCursor = Math.max(0, realtimeReplayCursor - 1)
        }
        manualExperiences.push(experience)
    }

    /** Current example plus a rotating, deterministic replay slice. */
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

    /** Processes at most `budget` examples; applies gradients only after a full epoch. */
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

    /** Completes all consolidation epochs before the network is persisted. */
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

    /** Records every result before admitting and reranking archive members. */
    const recordRaceResults = (): void => {
        for (const racingCar of state.cars) {
            recordRace(racingCar.network, {
                overtakes: racingCar.stats.eliminated ? 0 : racingCar.stats.overtakes,
                seconds: hasFinished(racingCar) ? racingCar.stats.lastOvertakeAtSeconds : undefined,
            })
        }

        const admitted: Network[] = selectParents(
            state.cars,
            VETERANS.admittedPerRace,
            rankingRules(),
        ).map((car) => car.network)
        state.veterans = rankRoster(updateRoster(state.veterans, admitted))
        onVeteransChanged?.(state.veterans)
    }

    const finishGeneration = (): void => {
        const roundWinner: RacingCar | undefined = state.bestCar

        // Consolidate before recording so history and content id describe the persisted weights.
        if (roundWinner && playerWasDriven && roundWinner === state.playerCar) {
            completeConsolidation(roundWinner.network)
        }

        recordRaceResults()

        if (roundWinner) {
            roundWinner.network.generation += 1

            // A winning player takes first place without erasing the other parent lineages.
            const ranked: Network[] = selectParents(state.cars, PARENT_COUNT, rankingRules()).map(
                (car) => car.network,
            )

            // A finisher leads by crossing time even if a later finisher has a higher bonus score.
            state.parents = [
                roundWinner.network,
                ...ranked.filter((network) => network !== roundWinner.network),
            ].slice(0, PARENT_COUNT)
            state.winner = state.parents[0]
        }

        // The finish time is the last overtake, excluding the victory parade.
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
     * Recasts only the followed car for rendering. Wrecks retain their last valid reading
     * because collision overlap can place the sensor origin beyond a barrier.
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
            // Manual rounds show a valid radar before the first input releases physics.
            refreshFollowedSensors()
            return
        }

        state.elapsedSeconds += dt

        // Finishers remain protected and moving throughout the victory parade.
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
                // Stop non-finishers without turning the parade cutoff into a timeout result.
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

        // 1. Build traffic and guard-rail segments once for sensing and collision.
        const obstacles: Segment[] = currentObstacleSegments()

        // Sort once so each overtake count is an O(log n) lookup.
        const trafficYsAscending = state.traffic
            .map((trafficCar) => trafficCar.position.y)
            .sort((a, b) => a - b)

        // 2. Step each racer; reuse one sensor cast for control and scoring.
        for (const racingCar of state.aliveCars) {
            const { car, network, stats } = racingCar

            const nearbyObstacles = obstacles.filter((segment) =>
                isWithinRange(segment, car.position),
            )

            const sensorState = castSensors(car.position, car.heading, nearbyObstacles)
            racingCar.sensorState = sensorState

            const inputs = networkInputs(car, sensorState.readings)
            // Keep visualization caches live while manual controls override the outputs.
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
                    // Record coasting too; it is a deliberate control target.
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
                    // Restore live visualization caches after replay.
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

            // Protect a finisher starting on the exact step of its final overtake.
            const finished: boolean = hasFinished(racingCar)

            if (collided && !finished) {
                crash(car)
            }

            // Missing either deadline invalidates the result and retires the car.
            if (!finished && (isStuck(stats) || hasMissedOvertakeDeadline(stats))) {
                eliminate(stats)
                crash(car)
            }
        }

        // 3. Traffic moves independently, including during overlays.
        for (const trafficCar of state.traffic) {
            stepCar(trafficCar, dt)
        }

        // 4. Enforce the round ceiling for cars that keep making non-finishing progress.
        if (!state.courseCleared && state.elapsedSeconds >= SIMULATION.maxRoundSeconds) {
            for (const racingCar of state.aliveCars) {
                crash(racingCar.car)
            }
        }

        // 5. Recompute the live field.
        state.aliveCars = state.cars.filter((racingCar) => !racingCar.car.crashed)

        // 6. Rank the whole population and flag the displayed winner.
        state.bestCar = state.courseCleared
            ? state.courseWinner
            : selectBest(state.cars, rankingRules())
        for (const racingCar of state.cars) {
            racingCar.winner = racingCar === state.bestCar
        }

        // 7. Prefer the manual player, then the live leader, then the round winner.
        const humanCar = manualControls ? state.playerCar : undefined
        state.activeCar =
            state.courseCleared && state.courseWinner
                ? state.courseWinner
                : humanCar && !humanCar.car.crashed
                  ? humanCar
                  : state.aliveCars.length > 0
                    ? leader(state.aliveCars)
                    : state.bestCar

        // Recast after movement so the rendered radar does not lag the car by one step.
        refreshFollowedSensors()

        // 8. Detect the earliest finisher directly; bonus-adjusted score is not a finish.
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

        // 9. Close an empty non-victory round, then advance overlays.
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
        // Population settings apply at the next restart.
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

    /** Applies next round to avoid entering the same network twice in the current field. */
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
