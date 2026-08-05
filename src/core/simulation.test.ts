import { describe, expect, it } from 'vitest'
import { vec } from '@core/geometry'
import { PARENT_COUNT, SIMULATION, VETERANS } from '@core/config'
import { SENSOR_ZONE_ORDER, sensorOrigin } from '@core/sensor'
import { type Network, createNetwork } from './neural-network'
import { type Controls, crash } from './car'
import { raceScore } from './fitness'
import { lanePosition } from './road'
import { type CourseResult, type SimulationSettings, createSimulation } from './simulation'

const smallSettings: SimulationSettings = {
    carsQuantity: 4,
    mutationRate: 0.1,
    hiddenLayers: [2],
    generationsPerCourse: 3,
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

/** Ends the current round with exact overtake counts, without another physics sample. */
const finishRoundWithOvertakes = (
    sim: ReturnType<typeof createSimulation>,
    overtakes: readonly number[],
): void => {
    for (const [index, racingCar] of sim.state.cars.entries()) {
        const count: number = overtakes[index] ?? 0
        racingCar.stats.overtakes = count
        racingCar.stats.lastOvertakeAtSeconds = count > 0 ? index + 1 : 0
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

    it('keeps one course layout for a block of generations, then draws a new one', () => {
        const sim = createSimulation({ ...smallSettings, generationsPerCourse: 3 })
        const layout = (): number[] => sim.state.traffic.map((car) => car.position.x)

        const first = layout()
        sim.restart()
        expect(layout()).toEqual(first)
        sim.restart()
        expect(layout()).toEqual(first)
        // Fourth generation, so the block boundary is crossed.
        sim.restart()
        expect(layout()).not.toEqual(first)
    })

    // The "never randomise" end of the slider. Every generation floors to seed 0, which
    // is the whole mechanism: no branch, just a division by infinity.
    it('never changes the course when the interval is infinite', () => {
        const sim = createSimulation({
            ...smallSettings,
            generationsPerCourse: Number.POSITIVE_INFINITY,
        })
        const layout = (): number[] => sim.state.traffic.map((car) => car.position.x)

        const first = layout()
        for (let generation = 0; generation < 5; generation++) {
            sim.restart()
            expect(layout()).toEqual(first)
        }
    })

    it('retains a compatible restored winner as the elite parent', () => {
        const winner = createNetwork(smallArchitecture)
        const sim = createSimulation(smallSettings, { winner })

        expect(sim.state.winner).toBe(winner)
        expect(sim.state.parents[0]).toBe(winner)
        expect(sim.state.cars[0].network).toBe(winner)
    })

    it('drops an incompatible restored winner from state before it can be reused or persisted', () => {
        const incompatible = createNetwork([7, 2, 3])
        const sim = createSimulation(smallSettings, { winner: incompatible })

        expect(sim.state.winner).toBeUndefined()
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
        // The wreck keeps whatever it had earned: crashing costs nothing by itself.
        expect(target.stats.overtakes).toBe(0)
    })
})

describe('createSimulation: idle death', () => {
    it('kills a car that makes no progress after SIMULATION.idleTimeoutSeconds', () => {
        const winner = stationaryNetwork()
        const sim = createSimulation(smallSettings, { winner, trafficSeed: 'idle-timeout' })
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
    it('eliminates and excludes a moving car without inventing a score', () => {
        const winner = straightThrottleNetwork()
        const sim = createSimulation(smallSettings, { winner, trafficSeed: 'overtake-timeout' })
        const target = sim.state.cars[0]
        target.stats.secondsSinceLastOvertake =
            SIMULATION.overtakeTimeoutSeconds - SIMULATION.stepSeconds / 2

        sim.step(SIMULATION.stepSeconds)

        expect(target.car.crashed).toBe(true)
        expect(target.stats.overtakeTimedOut).toBe(true)
        expect(target.stats.overtakes).toBe(0)
        expect(sim.state.aliveCars).not.toContain(target)
        expect(sim.state.bestCar).not.toBe(target)
    })
})

describe('createSimulation: generation lifecycle', () => {
    it('ends the generation exactly once, then restarts after the game-over delay with the generation counter incremented', () => {
        const events: (Network | undefined)[] = []
        const sim = createSimulation(smallSettings, {
            trafficSeed: 'generation-end',
            onGenerationEnd: (winner) => events.push(winner),
        })

        // Force the whole population onto the left border so it crashes on the
        // very first step, without depending on network behaviour at all.
        for (const racingCar of sim.state.cars) {
            racingCar.car.position = vec(sim.state.road.left, racingCar.car.position.y)
        }

        const generationBefore = sim.state.generation
        sim.step(SIMULATION.stepSeconds)

        expect(sim.state.aliveCars).toHaveLength(0)
        expect(sim.state.gameOver).toBe(true)
        expect(events).toHaveLength(1)
        // Everybody crashed on the first step, so this round produced nothing worth
        // carrying forward: whether a wreck clears zero by the single frame of survival
        // it banked is a crumb either way, and the winner reported out is whatever the
        // simulation started with — never a network talked up by a round nobody drove.
        expect(sim.state.bestCar?.stats.overtakes ?? 0).toBe(0)

        runThroughGameOver(sim)

        expect(events).toHaveLength(1) // never fires again while paused or on restart
        expect(sim.state.gameOver).toBe(false)
        expect(sim.state.generation).toBe(generationBefore + 1)
        expect(sim.state.aliveCars.length).toBeGreaterThan(0)
    })

    it('hands the seat to the winner of the current round, whatever came before', () => {
        const winner = straightThrottleNetwork()
        const sim = createSimulation(smallSettings, {
            winner,
            trafficSeed: 'record-holder',
        })
        const contender = sim.state.cars[1]

        finishRoundWithOvertakes(sim, [1, 2, 1, 1, 1])

        expect(sim.state.bestCar).toBe(contender)
        expect(sim.state.winner).toBe(contender.network)
        expect(sim.state.parents[0]).toBe(contender.network)
    })

    it('uses the overtake count to choose the winner', () => {
        const winner = straightThrottleNetwork()
        const sim = createSimulation(smallSettings, {
            winner,
            trafficSeed: 'new-record',
        })
        const contender = sim.state.cars[1]

        finishRoundWithOvertakes(sim, [1, 3, 2, 1, 1])

        expect(sim.state.bestCar).toBe(contender)
        expect(sim.state.winner).toBe(contender.network)
        expect(sim.state.parents[0]).toBe(contender.network)
        expect(contender.stats.overtakes).toBe(3)
    })

    it('promotes the faster model at the same overtake total', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'winner-race-order' })
        const faster = sim.state.cars[0]
        const slowerSurvivor = sim.state.cars[1]

        faster.stats.overtakes = 10
        faster.stats.lastOvertakeAtSeconds = 20
        slowerSurvivor.stats.overtakes = 10
        slowerSurvivor.stats.lastOvertakeAtSeconds = 30

        for (const racingCar of sim.state.cars) {
            crash(racingCar.car)
        }
        sim.state.aliveCars = []
        sim.step(SIMULATION.stepSeconds)

        expect(sim.state.bestCar).toBe(faster)
        expect(sim.state.winner).toBe(faster.network)
        expect(sim.state.parents[0]).toBe(faster.network)
    })

    it('does not promote a model that made no overtakes', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'winner-sparse-score' })

        for (const racingCar of sim.state.cars) {
            crash(racingCar.car)
        }
        sim.state.aliveCars = []
        sim.step(SIMULATION.stepSeconds)

        expect(sim.state.bestCar).toBeUndefined()
        expect(sim.state.winner).toBeUndefined()
        expect(sim.state.parents).toEqual([])
    })
})

describe('createSimulation: clearing the course', () => {
    it('celebrates for five seconds before ending the round and crowning the winner', () => {
        const winner = straightThrottleNetwork()
        const sim = createSimulation(smallSettings, { winner, trafficSeed: 'cleared' })

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

        const clearer = sim.state.courseWinner
        const winningY: number | undefined = clearer?.car.position.y
        sim.step(SIMULATION.stepSeconds)
        expect(sim.state.victorySeconds).toBe(SIMULATION.stepSeconds)
        expect(clearer?.car.position.y).toBeLessThan(winningY ?? Infinity)
        expect(clearer?.car.crashed).toBe(false)
        expect(sim.state.activeCar).toBe(clearer)

        const celebrationSteps = Math.ceil(
            SIMULATION.victoryCelebrationSeconds / SIMULATION.stepSeconds,
        )
        for (let step = 0; step <= celebrationSteps; step++) {
            sim.step(SIMULATION.stepSeconds)
        }

        expect(sim.state.gameOver).toBe(true)
        expect(clearer?.car.crashed).toBe(false)
        // The single traffic car was behind the whole grid, so the whole grid cleared the
        // course and the whole grid comes out of the parade still driving.
        expect(sim.state.aliveCars).toEqual(sim.state.cars)
        expect(sim.state.bestCar).toBe(clearer)
        // The winner's network is the one the next generation is bred from.
        expect(sim.state.winner).toBe(clearer?.network)

        // Finishing the race is worth exactly the traffic it passed: one point, one car.
        expect(clearer?.stats.overtakes).toBe(1)
    })

    it('reports the finished course once, with the time to the last traffic car', () => {
        const finishes: CourseResult[] = []
        const winner = straightThrottleNetwork()
        const sim = createSimulation(smallSettings, {
            winner,
            trafficSeed: 'reported',
            onCourseFinished: (result) => finishes.push(result),
        })

        const single = sim.state.traffic[0]
        single.position = vec(single.position.x, sim.state.cars[0].car.position.y + 500)
        sim.state.traffic = [single]

        const steps = Math.ceil(SIMULATION.victoryCelebrationSeconds / SIMULATION.stepSeconds) + 2
        for (let step = 0; step < steps; step++) {
            sim.step(SIMULATION.stepSeconds)
        }

        const clearer = sim.state.courseWinner
        expect(sim.state.gameOver).toBe(true)
        expect(finishes).toHaveLength(1)
        expect(finishes[0].network).toBe(clearer?.network)
        expect(finishes[0].overtakes).toBe(clearer?.stats.overtakes)
        // The finish line is the last overtake, not the end of the victory parade: the
        // clearer keeps driving for five more seconds and its time must not grow with it.
        expect(finishes[0].seconds).toBe(clearer?.stats.lastOvertakeAtSeconds)
        expect(finishes[0].seconds).toBeLessThan(SIMULATION.victoryCelebrationSeconds)
    })

    // Crossing the line is not a race for one seat. Everybody who gets there has finished,
    // and the parade ending is not a reason to take that back.
    it('stops the cars that never finished and leaves every finisher driving', () => {
        const sim = createSimulation(smallSettings, {
            winner: straightThrottleNetwork(),
            trafficSeed: 'many-finishers',
        })

        // The one traffic car sits far up the road, out of reach of the whole round, so
        // the only finishers are the two set by hand here.
        const unreachable = sim.state.traffic[0]
        unreachable.position = vec(unreachable.position.x, sim.state.cars[0].car.position.y - 5000)
        sim.state.traffic = [unreachable]

        const finishers = [sim.state.cars[0], sim.state.cars[1]]
        for (const finisher of finishers) {
            finisher.stats.overtakes = 1
        }
        const others = sim.state.cars.filter((racingCar) => !finishers.includes(racingCar))

        sim.step(SIMULATION.stepSeconds)
        expect(sim.state.courseCleared).toBe(true)
        expect(finishers).toContain(sim.state.courseWinner)

        const celebrationSteps = Math.ceil(
            SIMULATION.victoryCelebrationSeconds / SIMULATION.stepSeconds,
        )
        for (let step = 0; step <= celebrationSteps; step++) {
            sim.step(SIMULATION.stepSeconds)
        }

        expect(sim.state.gameOver).toBe(true)
        for (const finisher of finishers) {
            expect(finisher.car.crashed).toBe(false)
            expect(sim.state.aliveCars).toContain(finisher)
            // A time in the record is the record of the finish, and the runner up has one
            // as much as the winner does.
            expect(finisher.network.history.at(-1)?.seconds).toBeDefined()
        }
        for (const other of others) {
            expect(other.car.crashed).toBe(true)
            expect(other.network.history.at(-1)?.seconds).toBeUndefined()
        }
    })

    // Every finisher passed the same traffic, so the round score separates them only by
    // the brake bonus, which says nothing about who won. First across the line does.
    it('breeds from the first car across the line, not from the highest score', () => {
        const sim = createSimulation(smallSettings, {
            winner: straightThrottleNetwork(),
            trafficSeed: 'first-across',
        })

        const unreachable = sim.state.traffic[0]
        unreachable.position = vec(unreachable.position.x, sim.state.cars[0].car.position.y - 5000)
        sim.state.traffic = [unreachable]

        const first = sim.state.cars[0]
        const second = sim.state.cars[1]

        // One car crosses on its own, which is what opens the celebration.
        first.stats.overtakes = 1
        sim.step(SIMULATION.stepSeconds)
        expect(sim.state.courseWinner).toBe(first)

        // A second crosses during the parade, having braked on the way: worth the whole
        // brake bonus, which puts it above the winner on the round score.
        second.stats.overtakes = 1
        second.stats.usedBrake = true

        const celebrationSteps = Math.ceil(
            SIMULATION.victoryCelebrationSeconds / SIMULATION.stepSeconds,
        )
        for (let step = 0; step <= celebrationSteps; step++) {
            sim.step(SIMULATION.stepSeconds)
        }

        expect(sim.state.gameOver).toBe(true)
        expect(raceScore(second.stats)).toBeGreaterThan(raceScore(first.stats))
        expect(sim.state.courseWinner).toBe(first)
        expect(sim.state.winner).toBe(first.network)
        expect(sim.state.parents[0]).toBe(first.network)
        // Second place is still bred from, it just does not lead.
        expect(sim.state.parents).toContain(second.network)
    })

    // The finish is a count of traffic passed, and the brake bonus is not traffic. A car
    // one overtake short of the line used to be able to outscore a car that crossed it,
    // taking the crown and hiding the finish along with it.
    it('crowns the finisher over a higher-scoring car that never finished', () => {
        const sim = createSimulation(smallSettings, {
            winner: straightThrottleNetwork(),
            trafficSeed: 'brake-bonus-clear',
        })

        const unreachable = sim.state.traffic[0]
        unreachable.position = vec(unreachable.position.x, sim.state.cars[0].car.position.y - 5000)
        sim.state.traffic = [unreachable, { ...unreachable }]

        const finisher = sim.state.cars[0]
        const highScorer = sim.state.cars[1]
        finisher.stats.overtakes = 2
        highScorer.stats.overtakes = 1
        highScorer.stats.usedBrake = true

        sim.step(SIMULATION.stepSeconds)

        expect(raceScore(highScorer.stats)).toBeGreaterThan(raceScore(finisher.stats))
        expect(sim.state.courseCleared).toBe(true)
        expect(sim.state.courseWinner).toBe(finisher)
    })

    it('reports nothing when the round ends without the course being beaten', () => {
        const finishes: CourseResult[] = []
        const sim = createSimulation(smallSettings, {
            winner: stationaryNetwork(),
            trafficSeed: 'unfinished',
            onCourseFinished: (result) => finishes.push(result),
        })

        // Nobody moves, so the idle timeout ends the round with the course untouched.
        const steps = Math.ceil(
            (SIMULATION.idleTimeoutSeconds + SIMULATION.gameOverSeconds + 1) /
                SIMULATION.stepSeconds,
        )
        for (let step = 0; step < steps; step++) {
            sim.step(SIMULATION.stepSeconds)
        }

        expect(sim.state.courseCleared).toBe(false)
        expect(finishes).toEqual([])
    })
})

describe('createSimulation: the player car', () => {
    it('refreshes the followed radar at the car pose after movement', () => {
        const winner = straightThrottleNetwork()
        const sim = createSimulation(smallSettings, { winner, trafficSeed: 'radar-alignment' })

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

    it('senses the obstacles ahead while the manual round is still frozen', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'radar-before-start' })
        sim.startManualDriving({ throttle: 0, brake: 0, steering: 0 })

        // Park a traffic car right in front of the player, well inside the front area.
        const player = sim.state.playerCar
        if (!player) {
            throw new Error('Expected a player car')
        }
        sim.state.activeCar = player
        sim.state.traffic = [sim.state.traffic[0]]
        sim.state.traffic[0].position = vec(player.car.position.x, player.car.position.y - 200)

        expect(sim.state.waitingForManualInput).toBe(true)
        sim.step(SIMULATION.stepSeconds)

        // The round has not started, but the radar is already on screen: it has to show
        // the car parked ahead rather than the clear road the car was built with.
        expect(player.sensorState.readings.some((reading) => reading > 0)).toBe(true)
    })

    it('leaves the radar where it was last valid instead of casting it from inside a wall', () => {
        // Full throttle into a hard left turn: it drives itself into the guard rail.
        const winner = constantOutputNetwork([10, -10, -10])
        const sim = createSimulation(smallSettings, { winner, trafficSeed: 'radar-after-crash' })
        const target = sim.state.cars[0]
        sim.state.traffic = []
        // Wreck the rest of the field and give the target a result, so it stays the
        // followed car after its own impact instead of handing the camera to a survivor.
        for (const racingCar of sim.state.cars) {
            if (racingCar !== target) {
                crash(racingCar.car)
            }
        }
        target.stats.overtakes = 1

        for (let step = 0; step < 600 && !target.car.crashed; step++) {
            sim.step(SIMULATION.stepSeconds)
        }
        expect(sim.state.activeCar).toBe(target)

        expect(target.car.crashed).toBe(true)
        const atImpact = target.sensorState

        // A collision is only detected once the bodies overlap, so the wreck is partly
        // through the barrier. Re-casting from there puts the origin outside the road and
        // draws the whole radar beyond the rail, so it must stay exactly as it was.
        sim.step(SIMULATION.stepSeconds)
        sim.step(SIMULATION.stepSeconds)

        expect(target.sensorState).toBe(atImpact)
        expect(atImpact.origin.x).toBeGreaterThanOrEqual(sim.state.road.left)
        expect(atImpact.origin.x).toBeLessThanOrEqual(sim.state.road.left + sim.state.road.width)
    })

    it('is always in the field, driven by its own network until a human takes over', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'player' })

        const player = sim.state.playerCar
        expect(player).toBeDefined()
        expect(player?.player).toBe(true)
        expect(sim.state.cars).toContain(player)
        expect(sim.state.manualDriving).toBe(false)
        // The player shares the one start line with everybody else, rather than being
        // given a lane of its own.
        const middle = lanePosition(sim.state.road, Math.floor(sim.state.road.laneCount / 2))
        for (const racingCar of sim.state.cars) {
            expect(racingCar.car.position).toEqual(middle)
        }

        // Nobody is driving: its network moves it like everyone else's.
        for (let i = 0; i < 30; i++) {
            sim.step(SIMULATION.stepSeconds)
        }
        expect(player?.car.controls).toBeDefined()
    })

    it('starts a fresh manual round and freezes it until the first driving intent', () => {
        const winner = straightThrottleNetwork() // every network would floor the throttle
        const sim = createSimulation(smallSettings, { winner, trafficSeed: 'wheel' })
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
        // The player continues the same round-robin lane distribution as the AI field.
        expect(player?.car.position).toEqual(
            lanePosition(sim.state.road, smallSettings.carsQuantity % sim.state.road.laneCount),
        )
        expect(player?.car.position.y).toBe(sim.state.cars[0].car.position.y)
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
        const winner = stationaryNetwork()
        const sim = createSimulation(smallSettings, { winner, trafficSeed: 'handoff' })
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
        const winner = stationaryNetwork()
        const sim = createSimulation(smallSettings, { winner, trafficSeed: 'backprop' })

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
        const winner = stationaryNetwork()
        const sim = createSimulation(smallSettings, { winner, trafficSeed: 'neutral-input' })

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

    it('breeds a winning manual run as the elite, without emptying the parent pool', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'taught' })
        sim.startManualDriving({ throttle: 1, brake: 0, steering: 0 })
        sim.beginManualDriving()

        for (let i = 0; i < 120; i++) {
            sim.step(SIMULATION.stepSeconds)
        }

        const player = sim.state.playerCar
        const taughtNetwork = player?.network
        // The brake bonus is worth more than the spread set below, and the AI cars decide
        // for themselves whether to touch the brake. Cleared here so the ranking under
        // test is the overtake ranking.
        for (const racingCar of sim.state.cars) {
            racingCar.stats.usedBrake = false
        }
        // The player wins, and the rest of the field still scores: they are owed the seats
        // behind it.
        const overtakes: number[] = sim.state.cars.map((racingCar, index) =>
            racingCar === player ? 10 : 9 - index,
        )
        const beforeConsolidation: string | undefined = JSON.stringify(
            taughtNetwork?.layers.map((layer) => ({
                weights: layer.weights,
                biases: layer.biases,
            })),
        )
        finishRoundWithOvertakes(sim, overtakes)
        expect(sim.state.bestCar).toBe(player)

        const afterConsolidation: string | undefined = JSON.stringify(
            taughtNetwork?.layers.map((layer) => ({
                weights: layer.weights,
                biases: layer.biases,
            })),
        )
        expect(afterConsolidation).not.toBe(beforeConsolidation)

        // First place, and nothing more than first place: the networks it beat keep their
        // seats instead of being cleared out of the pool.
        expect(sim.state.winner).toBe(taughtNetwork)
        expect(sim.state.parents[0]).toBe(taughtNetwork)
        expect(sim.state.parents).toHaveLength(PARENT_COUNT)
        expect(new Set(sim.state.parents).size).toBe(PARENT_COUNT)

        runThroughGameOver(sim)

        const nextElite = sim.state.cars[0]
        expect(nextElite.network).toBe(taughtNetwork)
        expect(nextElite.car.controls.throttle).toBeGreaterThan(0)
    })

    // The player's car is a competitor, not a guest: whatever the round decides about it
    // is decided by the same ranking that decides everything else.
    it('admits a top-scoring player network to the veterans archive like any other car', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'player-veteran' })
        sim.startManualDriving({ throttle: 1, brake: 0, steering: 0 })
        sim.beginManualDriving()
        sim.step(SIMULATION.stepSeconds)

        const player = sim.state.playerCar
        const taughtNetwork = player?.network
        for (const racingCar of sim.state.cars) {
            racingCar.stats.usedBrake = false
        }
        finishRoundWithOvertakes(
            sim,
            sim.state.cars.map((racingCar, index) => (racingCar === player ? 10 : 9 - index)),
        )

        expect(sim.state.veterans).toHaveLength(VETERANS.admittedPerRace)
        expect(sim.state.veterans[0]).toBe(taughtNetwork)
        // Admitted with the race that earned it, not with an empty record.
        expect(taughtNetwork?.history).toHaveLength(1)
    })

    // Consolidation rewrites the weights and the id derived from them, so it has to be
    // over before the archive is written: otherwise localStorage keeps the network that
    // raced while memory keeps the one that was trained.
    it('stores the consolidated player network in the archive, not the one that raced', () => {
        let savedRosterIds: string[] = []
        const sim = createSimulation(smallSettings, {
            trafficSeed: 'player-consolidated',
            onVeteransChanged: (roster) => {
                savedRosterIds = roster.map((network) => network.id)
            },
        })
        sim.startManualDriving({ throttle: 1, brake: 0, steering: 1 })
        sim.beginManualDriving()
        for (let i = 0; i < 60; i++) {
            sim.step(SIMULATION.stepSeconds)
        }

        const player = sim.state.playerCar
        const idBeforeConsolidation: string | undefined = player?.network.id
        for (const racingCar of sim.state.cars) {
            racingCar.stats.usedBrake = false
        }
        finishRoundWithOvertakes(
            sim,
            sim.state.cars.map((racingCar, index) => (racingCar === player ? 10 : 9 - index)),
        )

        expect(player?.network.id).not.toBe(idBeforeConsolidation)
        expect(savedRosterIds).toContain(player?.network.id)
    })
})

describe('createSimulation: promoteBest', () => {
    it('returns undefined before any car has been scored', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'promote-empty' })

        expect(sim.promoteBest()).toBeUndefined()
    })

    it('returns the current best car network and sets it as the winner', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'promote-test' })
        sim.step(SIMULATION.stepSeconds)

        const promoted = sim.promoteBest()

        expect(promoted).toBe(sim.state.bestCar?.network)
        expect(sim.state.winner).toBe(promoted)
    })

    it('promotes the current best even when it scored almost nothing', () => {
        const winner = straightThrottleNetwork()
        const sim = createSimulation(smallSettings, { winner, trafficSeed: 'promote-record' })
        sim.state.bestCar = sim.state.cars[1]
        sim.state.bestCar.stats.overtakes = 1

        expect(sim.promoteBest()).toBe(sim.state.bestCar.network)
        expect(sim.state.winner).toBe(sim.state.bestCar.network)
    })
})

describe('createSimulation: the veterans archive', () => {
    it('writes the round into the history of every network that drove it, winners and wrecks alike', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'history-all' })
        const networks = sim.state.cars.map((racingCar) => racingCar.network)

        finishRoundWithOvertakes(sim, [7, 0, 3, 0])

        // Losers included on purpose: a median taken only from good races would describe
        // a network's best days rather than a typical course.
        for (const network of networks) {
            expect(network.history).toHaveLength(1)
        }
        expect(networks[0].history[0].overtakes).toBe(7)
        expect(networks[1].history[0].overtakes).toBe(0)
    })

    it('admits the round best to the archive, already carrying the race that earned it', () => {
        const sim = createSimulation(smallSettings, { trafficSeed: 'archive-admission' })
        const best = sim.state.cars[0].network

        finishRoundWithOvertakes(sim, [9, 1, 0, 0])

        expect(sim.state.veterans).toContain(best)
        expect(best.history).toHaveLength(1)
    })

    it('reports the archive out so it can be persisted', () => {
        const rosters: number[] = []
        const sim = createSimulation(smallSettings, {
            trafficSeed: 'archive-reported',
            onVeteransChanged: (roster) => rosters.push(roster.length),
        })

        finishRoundWithOvertakes(sim, [5, 0, 0, 0])

        expect(rosters).toHaveLength(1)
        expect(rosters[0]).toBeGreaterThan(0)
    })

    // The point of the whole mechanism: a network with a good record survives a round it
    // scored nothing in, where `selectParents` would drop it from the parent pool the
    // moment it drew a course it cannot drive. Tested against a FULL archive, so members
    // really are competing for the seats.
    it('keeps a veteran with a strong record through a round it scored nothing in', () => {
        const veteran = straightThrottleNetwork()
        veteran.history = [{ overtakes: 30 }, { overtakes: 28 }, { overtakes: 32 }]
        const crowd = Array.from({ length: VETERANS.rosterSize - 1 }, () => {
            const filler = straightThrottleNetwork()
            filler.history = [{ overtakes: 5 }, { overtakes: 5 }, { overtakes: 5 }]
            return filler
        })
        const sim = createSimulation(smallSettings, {
            trafficSeed: 'archive-survives',
            veterans: [veteran, ...crowd],
        })

        finishRoundWithOvertakes(sim, [0, 0, 0, 0])

        expect(sim.state.veterans).toContain(veteran)
        expect(sim.state.veterans).toHaveLength(VETERANS.rosterSize)
    })

    it('puts the champion on the grid every round without breeding from it', () => {
        const champion = straightThrottleNetwork()
        const sim = createSimulation(smallSettings, {
            trafficSeed: 'champion-races',
            champion,
        })

        expect(sim.state.cars.map((racingCar) => racingCar.network)).toContain(champion)
    })
})
