import { describe, expect, it } from 'vitest'
import { createNetwork } from '@core/neural-network'
import { SENSOR_ZONE_ORDER } from '@core/sensor'
import { MUTATION, MUTATION_DISTRIBUTION } from '@core/config'
import { createPopulation, mutationRateForIndex } from './population'
import { createRoad, lanePosition } from './road'

describe('mutationRateForIndex', () => {
    const quantity = 100
    const baseRate = 0.1
    // A fixed midpoint keeps band-membership assertions deterministic: this
    // test only cares which band an index falls into, not exactly where
    // within the band the random draw lands.
    const midpoint = (): number => 0.5

    it('puts exactly the minimal share of the population in the lowest band, at MUTATION.lowRateFloor', () => {
        const count = Array.from({ length: quantity }, (_, index) =>
            mutationRateForIndex(index, quantity, baseRate, midpoint),
        ).filter((rate) => rate === MUTATION.lowRateFloor).length

        expect(count).toBe(quantity * MUTATION_DISTRIBUTION.minimal)
    })

    it('puts exactly the low share of the population strictly between the floor and the base rate', () => {
        const count = Array.from({ length: quantity }, (_, index) =>
            mutationRateForIndex(index, quantity, baseRate, midpoint),
        ).filter((rate) => rate > MUTATION.lowRateFloor && rate < baseRate).length

        expect(count).toBe(quantity * MUTATION_DISTRIBUTION.low)
    })

    it('puts exactly the target share of the population at exactly the base rate', () => {
        const count = Array.from({ length: quantity }, (_, index) =>
            mutationRateForIndex(index, quantity, baseRate, midpoint),
        ).filter((rate) => rate === baseRate).length

        expect(count).toBe(quantity * MUTATION_DISTRIBUTION.target)
    })

    it('puts exactly the high share of the population strictly above the base rate', () => {
        const count = Array.from({ length: quantity }, (_, index) =>
            mutationRateForIndex(index, quantity, baseRate, midpoint),
        ).filter((rate) => rate > baseRate).length

        expect(count).toBe(quantity * MUTATION_DISTRIBUTION.high)
    })

    it('always returns a rate within [0, 1]', () => {
        for (let index = 0; index < quantity; index++) {
            const rate = mutationRateForIndex(index, quantity, baseRate, Math.random)
            expect(rate).toBeGreaterThanOrEqual(0)
            expect(rate).toBeLessThanOrEqual(1)
        }
    })

    it('stays within [0, 1] for a base rate of 0', () => {
        for (let index = 0; index < quantity; index++) {
            const rate = mutationRateForIndex(index, quantity, 0, Math.random)
            expect(rate).toBeGreaterThanOrEqual(0)
            expect(rate).toBeLessThanOrEqual(1)
        }
    })

    it('stays within [0, 1] for a base rate of 1', () => {
        for (let index = 0; index < quantity; index++) {
            const rate = mutationRateForIndex(index, quantity, 1, Math.random)
            expect(rate).toBeGreaterThanOrEqual(0)
            expect(rate).toBeLessThanOrEqual(1)
        }
    })
})

describe('createPopulation', () => {
    const baseOptions = {
        quantity: 20,
        hiddenLayers: [4],
        mutationRate: 0.1,
    }
    const architecture = [SENSOR_ZONE_ORDER.length + 1, ...baseOptions.hiddenLayers, 3]

    it('creates exactly `quantity` cars', () => {
        const road = createRoad()

        const cars = createPopulation(road, baseOptions)

        expect(cars).toHaveLength(baseOptions.quantity)
    })

    it('gives car 0 the winner network, weight-for-weight identical, when a winner is provided', () => {
        const road = createRoad()
        const winner = createNetwork(architecture)

        const cars = createPopulation(road, { ...baseOptions, parents: [winner] })

        expect(cars[0].network.layers).toEqual(winner.layers)
    })

    // `mutationRate` is a probability per parameter, and the near-clone band mutates at
    // `MUTATION.lowRateFloor` whatever the requested rate, so a child legitimately comes
    // out numerically identical to its parent. What must never happen is a child SHARING
    // the winner's arrays, which would let it rewrite its own parent.
    it('gives every other car its own copy of the winner, never a shared one', () => {
        const road = createRoad()
        const winner = createNetwork(architecture)

        const cars = createPopulation(road, { ...baseOptions, parents: [winner], mutationRate: 1 })

        for (let index = 1; index < cars.length; index++) {
            const layers = cars[index].network.layers
            expect(layers).not.toBe(winner.layers)
            expect(layers[0].weights[0]).not.toBe(winner.layers[0].weights[0])
        }
    })

    it('gives every car a fresh random network when there is no winner', () => {
        const road = createRoad()

        const cars = createPopulation(road, baseOptions)

        for (let index = 1; index < cars.length; index++) {
            expect(cars[index].network.layers).not.toEqual(cars[0].network.layers)
        }
    })

    it('starts every car from the same spot in the middle lane', () => {
        const road = createRoad()
        const middle = lanePosition(road, Math.floor(road.laneCount / 2))
        const cars = createPopulation(road, baseOptions)

        // One start line for everybody is what makes two scores in a generation
        // comparable: these networks drive a trajectory, so a different start lane is a
        // different task, and the elite would be re-run somewhere it never won.
        for (const racingCar of cars) {
            expect(racingCar.car.position).toEqual(middle)
        }
    })

    it('ignores a parent whose architecture does not match the requested one, and starts fresh instead of crashing', () => {
        const road = createRoad()
        const mismatchedWinner = createNetwork([99, 4, 3])

        const cars = createPopulation(road, { ...baseOptions, parents: [mismatchedWinner] })

        expect(cars).toHaveLength(baseOptions.quantity)
        expect(cars[0].network).not.toBe(mismatchedWinner)
        expect(cars[0].network.architecture).toEqual(architecture)
    })
})

describe('createPopulation with an archive', () => {
    const baseOptions = {
        quantity: 20,
        hiddenLayers: [4],
        mutationRate: 0.1,
    }
    const architecture = [SENSOR_ZONE_ORDER.length + 1, ...baseOptions.hiddenLayers, 3]

    it('enters the champion and every veteran unmutated', () => {
        const road = createRoad()
        const champion = createNetwork(architecture)
        const veterans = [createNetwork(architecture), createNetwork(architecture)]

        const cars = createPopulation(road, { ...baseOptions, champion, veterans })
        const entered = cars.map((racingCar) => racingCar.network)

        // Not clones: the identical object, so the race it runs is written into the
        // history the archive ranks it on.
        for (const network of [champion, ...veterans]) {
            expect(entered).toContain(network)
        }
    })

    it('keeps the grid at `quantity` when veterans join it', () => {
        const road = createRoad()

        const cars = createPopulation(road, {
            ...baseOptions,
            champion: createNetwork(architecture),
            veterans: [createNetwork(architecture), createNetwork(architecture)],
        })

        expect(cars).toHaveLength(baseOptions.quantity)
    })

    it('keeps the elite as car 0 rather than surrendering the slot to a veteran', () => {
        const road = createRoad()
        const winner = createNetwork(architecture)

        const cars = createPopulation(road, {
            ...baseOptions,
            parents: [winner],
            veterans: [createNetwork(architecture)],
        })

        expect(cars[0].network).toBe(winner)
    })

    // The overlap is the normal case rather than an edge one: the champion is usually in
    // the archive, and the elite is usually the network just admitted to it. Two cars
    // sharing one network would put two results from a single race into one history.
    it('enters a network once even when it is the elite, the champion and a veteran at once', () => {
        const road = createRoad()
        const network = createNetwork(architecture)

        const cars = createPopulation(road, {
            ...baseOptions,
            parents: [network],
            champion: network,
            veterans: [network],
        })

        expect(cars.filter((racingCar) => racingCar.network === network)).toHaveLength(1)
    })

    it('leaves at least half the grid to offspring, however many veterans are offered', () => {
        const road = createRoad()
        const veterans = Array.from({ length: baseOptions.quantity }, () =>
            createNetwork(architecture),
        )

        const cars = createPopulation(road, { ...baseOptions, veterans })
        const entered = new Set(veterans)

        expect(
            cars.filter((racingCar) => entered.has(racingCar.network)).length,
        ).toBeLessThanOrEqual(baseOptions.quantity / 2)
    })

    it('drops a veteran whose architecture does not match the requested one', () => {
        const road = createRoad()
        const mismatched = createNetwork([99, 4, 3])

        const cars = createPopulation(road, { ...baseOptions, veterans: [mismatched] })

        expect(cars.map((racingCar) => racingCar.network)).not.toContain(mismatched)
    })

    it('paints every car in its own network colour', () => {
        const road = createRoad()

        const cars = createPopulation(road, baseOptions)

        for (const racingCar of cars) {
            expect(racingCar.car.color).toBe(racingCar.network.color)
        }
    })
})
