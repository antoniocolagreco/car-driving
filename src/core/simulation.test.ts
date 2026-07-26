import { describe, expect, it } from 'vitest'
import { vec } from '@core/geometry'
import { SIMULATION } from '@core/config'
import { SENSOR_ZONE_ORDER, sensorOrigin } from '@core/sensor'
import { type Network, createNetwork } from './neural-network'
import { type Controls, crash } from './car'
import { type SimulationSettings, createSimulation } from './simulation'

const smallSettings: SimulationSettings = {
    carsQuantity: 4,
    mutationRate: 0.1,
    hiddenLayers: [2],
}
const smallArchitecture = [SENSOR_ZONE_ORDER.length + 1, ...smallSettings.hiddenLayers, 3]

/** A network whose output is constant regardless of input: every weight is 0, so
 * only the output layer's biases (tuned below per test) decide its behaviour. */
const constantOutputNetwork = (biases: readonly [number, number, number]): Network => {
    const network = createNetwork(smallArchitecture)
    for (const layer of network.layers) {
        layer.weights = layer.weights.map((row) => row.map(() => 0))
        layer.biases = layer.biases.map(() => 0)
    }
    network.layers[network.layers.length - 1].biases = [...biases]
    return network
}

/** Never accelerates, never brakes, never steers: stays exactly where it started. */
const stationaryNetwork = (): Network => constantOutputNetwork([0, -10, 0])

/** Full throttle, no brake, no steering: drives straight ahead as fast as it can. */
const straightThrottleNetwork = (): Network => constantOutputNetwork([10, -10, 0])

/** Advances `sim` until `gameOverSeconds` (plus a small safety margin) has elapsed, so any pending restart fires. */
const runThroughGameOver = (sim: ReturnType<typeof createSimulation>): void => {
    const steps = Math.ceil(SIMULATION.gameOverSeconds / SIMULATION.stepSeconds) + 2
    for (let i = 0; i < steps; i++) {
        sim.step(SIMULATION.stepSeconds)
    }
}

/** Ends the current round with exact scores, without running another physics sample. */
const finishRoundWithScores = (
    sim: ReturnType<typeof createSimulation>,
    scores: readonly number[],
): void => {
    for (const [index, racingCar] of sim.state.cars.entries()) {
        racingCar.stats.fitness = scores[index] ?? 0
        racingCar.stats.forwardProgress = (scores[index] ?? 0) > 0 ? 1 : 0
        crash(racingCar.car)
    }
    sim.state.aliveCars = []
    sim.step(SIMULATION.stepSeconds)
}

describe('createSimulation: determinism', () => {
    it('generates an identical traffic layout for two simulations sharing the same seed', () => {
        const a = createSimulation(smallSettings, { trafficSeed: 'determinism-seed' })
        const b = createSimulation(smallSettings, { trafficSeed: 'determinism-seed' })

        expect(b.state.traffic.map((car) => car.position)).toEqual(
            a.state.traffic.map((car) => car.position),
        )
    })

    it('retains a compatible restored champion as the elite parent', () => {
        const champion = createNetwork(smallArchitecture)
        const sim = createSimulation(smallSettings, { champion })

        expect(sim.state.champion).toBe(champion)
        expect(sim.state.parents[0]).toBe(champion)
        expect(sim.state.cars[0].network).toBe(champion)
    })

    it('drops an incompatible restored champion from state before it can be reused or persisted', () => {
        const incompatible = createNetwork([7, 2, 3])
        const sim = createSimulation(smallSettings, { champion: incompatible })

        expect(sim.state.champion).toBeUndefined()
        expect(sim.state.parents).toEqual([])
        expect(sim.state.cars[0].network.architecture).toEqual(smallArchitecture)
    })
})

describe('createSimulation: collisions', () => {
    it('crashes a car that overlaps a road border and removes it from aliveCars', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'border-crash' })
        const target = sim.state.cars[0]
        target.car.position = vec(sim.state.road.left, target.car.position.y)
        target.car.speed = target.car.spec.maxSpeed / 2

        sim.step(SIMULATION.stepSeconds)

        expect(target.car.crashed).toBe(true)
        expect(sim.state.aliveCars).not.toContain(target)
        expect(target.stats.impactSpeedRatio).toBeGreaterThan(0)
    })
})

describe('createSimulation: idle death', () => {
    it('kills a car that makes no progress after SIMULATION.idleTimeoutSeconds', () => {
        const champion = stationaryNetwork()
        const sim = createSimulation(smallSettings, { champion, trafficSeed: 'idle-timeout' })
        const target = sim.state.cars[0] // elite: exactly the stationary network
        // Traffic can now legitimately enter the full front rectangle before the idle
        // deadline. Remove it here so this test isolates the idle rule itself.
        sim.state.traffic = []

        const steps = Math.ceil(SIMULATION.idleTimeoutSeconds / SIMULATION.stepSeconds) + 5
        for (let i = 0; i < steps; i++) {
            sim.step(SIMULATION.stepSeconds)
        }

        expect(target.car.crashed).toBe(true)
        expect(target.stats.idleSeconds).toBeGreaterThanOrEqual(
            SIMULATION.idleTimeoutSeconds - SIMULATION.stepSeconds,
        )
    })
})

describe('createSimulation: overtake death timeout', () => {
    it('eliminates and excludes a moving car without erasing its score', () => {
        const champion = straightThrottleNetwork()
        const sim = createSimulation(smallSettings, { champion, trafficSeed: 'overtake-timeout' })
        const target = sim.state.cars[0]
        target.stats.forwardProgress = 500
        target.stats.secondsSinceLastOvertake =
            SIMULATION.overtakeTimeoutSeconds - SIMULATION.stepSeconds / 2

        sim.step(SIMULATION.stepSeconds)

        expect(target.car.crashed).toBe(true)
        expect(target.stats.overtakeTimedOut).toBe(true)
        expect(target.stats.fitness).toBeGreaterThan(0)
        expect(sim.state.aliveCars).not.toContain(target)
        expect(sim.state.bestCar).not.toBe(target)
    })
})

describe('createSimulation: generation lifecycle', () => {
    it('ends the generation exactly once, then restarts after the game-over delay with the generation counter incremented', () => {
        const events: (Network | undefined)[] = []
        const sim = createSimulation(smallSettings, {
            trafficSeed: 'generation-end',
            onGenerationEnd: (champion) => events.push(champion),
        })

        // Force the whole population onto the left border so it crashes on the
        // very first step, without depending on network behaviour at all.
        for (const racingCar of sim.state.cars) {
            racingCar.car.position = vec(sim.state.road.left, racingCar.car.position.y)
        }

        const generationBefore = sim.state.generation
        const completedBefore = sim.state.completedGenerations
        sim.step(SIMULATION.stepSeconds)

        expect(sim.state.aliveCars).toHaveLength(0)
        expect(sim.state.gameOver).toBe(true)
        expect(sim.state.completedGenerations).toBe(completedBefore + 1)
        expect(events).toHaveLength(1)
        // Everybody crashed on the first step, so this round produced nothing worth
        // carrying forward: whether a wreck clears zero by the single frame of survival
        // it banked is a crumb either way, and the champion reported out is whatever the
        // simulation started with — never a network talked up by a round nobody drove.
        expect(sim.state.bestCar?.stats.fitness ?? 0).toBeLessThan(1)
        expect(events[0]?.bestFitness ?? 0).toBeLessThan(1)

        runThroughGameOver(sim)

        expect(events).toHaveLength(1) // never fires again while paused or on restart
        expect(sim.state.gameOver).toBe(false)
        expect(sim.state.generation).toBe(generationBefore + 1)
        expect(sim.state.completedGenerations).toBe(completedBefore + 1)
        expect(sim.state.aliveCars.length).toBeGreaterThan(0)
    })

    it('does not count a manually restarted generation as completed', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'manual-restart-counter' })
        const generationBefore = sim.state.generation

        sim.restart()

        expect(sim.state.generation).toBe(generationBefore + 1)
        expect(sim.state.completedGenerations).toBe(0)
    })

    it('replaces the historical record holder with the winner of the current round', () => {
        const champion = straightThrottleNetwork()
        champion.bestFitness = 1000
        const sim = createSimulation(smallSettings, {
            champion,
            trafficSeed: 'record-holder',
        })
        const contender = sim.state.cars[1]

        finishRoundWithScores(sim, [70, 100, 20, 10, 30])

        expect(sim.state.bestCar).toBe(contender)
        expect(sim.state.champion).toBe(contender.network)
        expect(sim.state.parents[0]).toBe(contender.network)
    })

    it('uses fitness to choose the champion when race results are otherwise tied', () => {
        const champion = straightThrottleNetwork()
        champion.bestFitness = 100
        const sim = createSimulation(smallSettings, {
            champion,
            trafficSeed: 'new-record',
        })
        const contender = sim.state.cars[1]

        finishRoundWithScores(sim, [70, 101, 20, 10, 30])

        expect(sim.state.bestCar).toBe(contender)
        expect(sim.state.champion).toBe(contender.network)
        expect(sim.state.parents[0]).toBe(contender.network)
        expect(contender.network.bestFitness).toBe(101)
    })

    it('promotes the higher-fitness model at the same overtake total', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'winner-race-order' })
        const faster = sim.state.cars[0]
        const slowerSurvivor = sim.state.cars[1]

        faster.stats.overtakes = 10
        faster.stats.lastOvertakeAtSeconds = 20
        faster.stats.fitness = 100
        faster.stats.crashed = true
        slowerSurvivor.stats.overtakes = 10
        slowerSurvivor.stats.lastOvertakeAtSeconds = 30
        slowerSurvivor.stats.fitness = 1_000

        for (const racingCar of sim.state.cars) {
            crash(racingCar.car)
        }
        sim.state.aliveCars = []
        sim.step(SIMULATION.stepSeconds)

        expect(sim.state.bestCar).toBe(slowerSurvivor)
        expect(sim.state.champion).toBe(slowerSurvivor.network)
        expect(sim.state.parents[0]).toBe(slowerSurvivor.network)
    })

    it('promotes higher fitness before greater progress', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'winner-progress-order' })
        const earlyWreck = sim.state.cars[0]
        const laterWreck = sim.state.cars[1]

        earlyWreck.stats.forwardProgress = 20
        earlyWreck.stats.fitness = 100
        earlyWreck.stats.crashed = true
        laterWreck.stats.forwardProgress = 200
        laterWreck.stats.fitness = 0
        laterWreck.stats.crashed = true

        for (const racingCar of sim.state.cars) {
            crash(racingCar.car)
        }
        sim.state.aliveCars = []
        sim.step(SIMULATION.stepSeconds)

        expect(sim.state.bestCar).toBe(earlyWreck)
        expect(sim.state.champion).toBe(earlyWreck.network)
        expect(sim.state.parents[0]).toBe(earlyWreck.network)
    })
})

describe('createSimulation: clearing the course', () => {
    it('celebrates for five seconds before ending the round and crowning the winner', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'cleared' })

        // One traffic car, already behind the field: the very next step makes whoever is
        // leading a car that has passed everything there is to pass.
        const single = sim.state.traffic[0]
        single.position = vec(single.position.x, sim.state.cars[0].car.position.y + 500)
        sim.state.traffic = [single]

        sim.step(SIMULATION.stepSeconds)

        expect(sim.state.courseCleared).toBe(true)
        expect(sim.state.courseWinner?.stats.overtakes).toBe(1)
        expect(sim.state.gameOver).toBe(false)
        expect(sim.state.victorySeconds).toBe(0)

        const winner = sim.state.courseWinner
        const winningPosition = winner?.car.position
        sim.step(SIMULATION.stepSeconds)
        expect(sim.state.victorySeconds).toBe(SIMULATION.stepSeconds)
        expect(winner?.car.position).toEqual(winningPosition)

        const celebrationSteps = Math.ceil(
            SIMULATION.victoryCelebrationSeconds / SIMULATION.stepSeconds,
        )
        for (let step = 0; step <= celebrationSteps; step++) {
            sim.step(SIMULATION.stepSeconds)
        }

        expect(sim.state.gameOver).toBe(true)
        expect(sim.state.aliveCars).toHaveLength(0)
        expect(sim.state.bestCar).toBe(winner)
        // The winner's network is the one the next generation is bred from.
        expect(sim.state.champion).toBe(winner?.network)

        // Nobody was charged for a crash: the round ended because it was won.
        expect(winner?.stats.crashed).toBe(false)
    })
})

describe('createSimulation: the player car', () => {
    it('refreshes the followed radar at the car pose after movement', () => {
        const champion = straightThrottleNetwork()
        const sim = createSimulation(smallSettings, { champion, trafficSeed: 'radar-alignment' })

        sim.step(SIMULATION.stepSeconds)

        const followed = sim.state.activeCar
        expect(followed).toBeDefined()
        if (!followed) {
            throw new Error('Expected a followed car')
        }
        expect(followed.sensorState.origin).toEqual(
            sensorOrigin(followed.car.position, followed.car.heading),
        )
    })

    it('is always in the field, driven by its own network until a human takes over', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'player' })

        const player = sim.state.playerCar
        expect(player).toBeDefined()
        expect(player?.player).toBe(true)
        expect(sim.state.cars).toContain(player)
        expect(sim.state.manualDriving).toBe(false)
        const sharedStart = sim.state.cars[0].car.position
        for (const racingCar of sim.state.cars) {
            expect(racingCar.car.position).toEqual(sharedStart)
        }

        // Nobody is driving: its network moves it like everyone else's.
        for (let i = 0; i < 30; i++) {
            sim.step(SIMULATION.stepSeconds)
        }
        expect(player?.car.controls).toBeDefined()
    })

    it('starts a fresh manual round and freezes it until the first driving intent', () => {
        const champion = straightThrottleNetwork() // every network would floor the throttle
        const sim = createSimulation(smallSettings, { champion, trafficSeed: 'wheel' })
        const generation = sim.state.generation
        const previousPlayer = sim.state.playerCar
        const controls: Controls = { throttle: 0, brake: 1, steering: 0 }

        sim.startManualDriving(controls)
        const player = sim.state.playerCar
        const startY = player?.car.position.y ?? 0
        for (let i = 0; i < 60; i++) {
            sim.step(SIMULATION.stepSeconds)
        }

        expect(sim.state.generation).toBe(generation + 1)
        expect(player).not.toBe(previousPlayer)
        // Player and champion share the same physical starting context, so the network
        // is later evaluated with the same initial sensor readings it learned from.
        expect(player?.car.position).toEqual(sim.state.cars[0].car.position)
        expect(sim.state.waitingForManualInput).toBe(true)
        expect(sim.state.manualDriving).toBe(true)
        expect(sim.state.elapsedSeconds).toBe(0)
        expect(player?.car.position.y).toBe(startY)
        expect(sim.state.cars[0].car.position.y).toBe(startY)

        sim.beginManualDriving()
        sim.step(SIMULATION.stepSeconds)

        expect(sim.state.waitingForManualInput).toBe(false)
        expect(sim.state.elapsedSeconds).toBe(SIMULATION.stepSeconds)
        expect(player?.car.speed).toBe(0)
        expect(player?.car.position.y).toBe(startY)
    })

    it('returns control to the trained neural network without restarting the round', () => {
        const champion = stationaryNetwork()
        const sim = createSimulation(smallSettings, { champion, trafficSeed: 'handoff' })
        const manualControls: Controls = { throttle: 1, brake: 1, steering: 1 }

        sim.startManualDriving(manualControls)
        sim.beginManualDriving()
        const generation = sim.state.generation
        const player = sim.state.playerCar
        sim.step(SIMULATION.stepSeconds)

        sim.stopManualDriving()
        sim.step(SIMULATION.stepSeconds)

        expect(sim.state.generation).toBe(generation)
        expect(sim.state.playerCar).toBe(player)
        expect(sim.state.waitingForManualInput).toBe(false)
        expect(sim.state.manualDriving).toBe(false)
        expect(player?.car.controls).not.toEqual(manualControls)
    })

    it('updates the player network through backpropagation on every manual step', () => {
        const champion = stationaryNetwork()
        const sim = createSimulation(smallSettings, { champion, trafficSeed: 'backprop' })

        sim.startManualDriving({ throttle: 1, brake: 0, steering: 1 })
        sim.beginManualDriving()
        const player = sim.state.playerCar
        const parametersBefore: string | undefined = JSON.stringify(
            player?.network.layers.map((layer) => ({
                weights: layer.weights,
                biases: layer.biases,
            })),
        )

        sim.step(SIMULATION.stepSeconds)

        const parametersAfter: string | undefined = JSON.stringify(
            player?.network.layers.map((layer) => ({
                weights: layer.weights,
                biases: layer.biases,
            })),
        )
        expect(parametersAfter).not.toBe(parametersBefore)
    })

    it('does not train the player network towards zero while no key is pressed', () => {
        const champion = stationaryNetwork()
        const sim = createSimulation(smallSettings, { champion, trafficSeed: 'neutral-input' })

        sim.startManualDriving({ throttle: 0, brake: 0, steering: 0 })
        sim.beginManualDriving()
        const player = sim.state.playerCar
        const parametersBefore: string | undefined = JSON.stringify(
            player?.network.layers.map((layer) => ({
                weights: layer.weights,
                biases: layer.biases,
            })),
        )

        sim.step(SIMULATION.stepSeconds)

        const parametersAfter: string | undefined = JSON.stringify(
            player?.network.layers.map((layer) => ({
                weights: layer.weights,
                biases: layer.biases,
            })),
        )
        expect(parametersAfter).toBe(parametersBefore)
    })

    it('hands a winning manual run to the whole next generation', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'taught' })
        sim.startManualDriving({ throttle: 1, brake: 0, steering: 0 })
        sim.beginManualDriving()

        for (let i = 0; i < 120; i++) {
            sim.step(SIMULATION.stepSeconds)
        }

        // Make the player the round's best, then end the round.
        const player = sim.state.playerCar
        const taughtNetwork = player?.network
        const scores: number[] = sim.state.cars.map((racingCar) =>
            racingCar === player ? 1000 : 0,
        )
        const beforeConsolidation: string | undefined = JSON.stringify(
            taughtNetwork?.layers.map((layer) => ({
                weights: layer.weights,
                biases: layer.biases,
            })),
        )
        finishRoundWithScores(sim, scores)
        expect(sim.state.bestCar).toBe(player)

        const afterConsolidation: string | undefined = JSON.stringify(
            taughtNetwork?.layers.map((layer) => ({
                weights: layer.weights,
                biases: layer.biases,
            })),
        )
        expect(afterConsolidation).not.toBe(beforeConsolidation)

        expect(sim.state.champion).toBe(taughtNetwork)
        expect(sim.state.parents).toEqual([taughtNetwork])

        runThroughGameOver(sim)

        const nextChampion = sim.state.cars[0]
        expect(nextChampion.network).toBe(taughtNetwork)
        expect(nextChampion.car.controls.throttle).toBeGreaterThan(0)
    })
})

describe('createSimulation: promoteBest', () => {
    it('returns undefined before any car has been scored', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'promote-empty' })

        expect(sim.promoteBest()).toBeUndefined()
    })

    it('returns the current best car network and sets it as the champion', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'promote-test' })
        sim.step(SIMULATION.stepSeconds)

        const promoted = sim.promoteBest()

        expect(promoted).toBe(sim.state.bestCar?.network)
        expect(sim.state.champion).toBe(promoted)
    })

    it('promotes the current best even below the previous champion record', () => {
        const champion = straightThrottleNetwork()
        champion.bestFitness = 1000
        const sim = createSimulation(smallSettings, { champion, trafficSeed: 'promote-record' })
        sim.state.bestCar = sim.state.cars[1]
        sim.state.bestCar.stats.fitness = 100

        expect(sim.promoteBest()).toBe(sim.state.bestCar.network)
        expect(sim.state.champion).toBe(sim.state.bestCar.network)
    })
})
