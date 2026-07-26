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

    it('gives car 0 the champion network, weight-for-weight identical, when a champion is provided', () => {
        const road = createRoad()
        const champion = createNetwork(architecture)

        const cars = createPopulation(road, { ...baseOptions, parents: [champion] })

        expect(cars[0].network.layers).toEqual(champion.layers)
    })

    // `mutationRate` is a probability per parameter, and the near-clone band mutates at
    // `MUTATION.lowRateFloor` whatever the requested rate, so a child legitimately comes
    // out numerically identical to its parent. What must never happen is a child SHARING
    // the champion's arrays, which would let it rewrite its own parent.
    it('gives every other car its own copy of the champion, never a shared one', () => {
        const road = createRoad()
        const champion = createNetwork(architecture)

        const cars = createPopulation(road, { ...baseOptions, parents: [champion], mutationRate: 1 })

        for (let index = 1; index < cars.length; index++) {
            const layers = cars[index].network.layers
            expect(layers).not.toBe(champion.layers)
            expect(layers[0].weights[0]).not.toBe(champion.layers[0].weights[0])
        }
    })

    it('gives every car a fresh random network when there is no champion', () => {
        const road = createRoad()

        const cars = createPopulation(road, baseOptions)

        for (let index = 1; index < cars.length; index++) {
            expect(cars[index].network.layers).not.toEqual(cars[0].network.layers)
        }
    })

    it('distributes cars across every lane in round-robin order', () => {
        const road = createRoad()
        const cars = createPopulation(road, baseOptions)

        for (const [index, racingCar] of cars.entries()) {
            expect(racingCar.car.position).toEqual(lanePosition(road, index % road.laneCount))
        }
    })

    it('ignores a parent whose architecture does not match the requested one, and starts fresh instead of crashing', () => {
        const road = createRoad()
        const mismatchedChampion = createNetwork([99, 4, 3])

        const cars = createPopulation(road, { ...baseOptions, parents: [mismatchedChampion] })

        expect(cars).toHaveLength(baseOptions.quantity)
        expect(cars[0].network).not.toBe(mismatchedChampion)
        expect(cars[0].network.architecture).toEqual(architecture)
    })
})
