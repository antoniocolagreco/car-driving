import type { Vec2 } from '@core/geometry'
import { clamp } from '@core/math'
import { MUTATION, MUTATION_DISTRIBUTION } from '@core/config'
import { type Network, createNetwork, mutate } from './neural-network'
import { SENSOR_ZONE_ORDER, type SensorState, castSensors } from './sensor'
import { type CarStats, createStats } from './fitness'
import { type Car, RACING_CAR_SPEC, createCar } from './car'
import { type Road, lanePosition } from './road'

/** Builds the racing population from parents, archived entrants and mutation settings. */

export type RacingCar = {
    car: Car
    /** Always in the field; controlled manually only when requested. */
    readonly player: boolean
    network: Network
    sensorState: SensorState
    stats: CarStats
    winner: boolean
}

export type PopulationOptions = {
    readonly quantity: number
    readonly hiddenLayers: readonly number[]
    readonly mutationRate: number
    /** Previous generation's best networks, best first. */
    readonly parents?: readonly Network[]
    /** Archive members entered unmutated for another measurement. */
    readonly veterans?: readonly Network[]
    /** Record holder entered unmutated when compatible. */
    readonly champion?: Network
}

const sameArchitecture = (a: readonly number[], b: readonly number[]): boolean =>
    a.length === b.length && a.every((count, index) => count === b[index])

/** Returns the per-parameter rate for an index in the configured mutation bands. */
export const mutationRateForIndex = (
    index: number,
    quantity: number,
    baseRate: number,
    random01: () => number,
): number => {
    const rate = clamp(baseRate, MUTATION.minRate, MUTATION.maxRate)

    const minimalCount = Math.floor(quantity * MUTATION_DISTRIBUTION.minimal)
    const lowCount = minimalCount + Math.floor(quantity * MUTATION_DISTRIBUTION.low)
    const targetCount = lowCount + Math.floor(quantity * MUTATION_DISTRIBUTION.target)
    // The explorer band absorbs rounding leftovers.

    if (index < minimalCount) {
        return MUTATION.lowRateFloor
    }

    if (index < lowCount) {
        return rate <= MUTATION.lowRateFloor
            ? rate
            : MUTATION.lowRateFloor + random01() * (rate - MUTATION.lowRateFloor)
    }

    if (index < targetCount) {
        return rate
    }

    // Keep explorers proportional to the slider instead of silently approaching full randomness.
    const ceiling = Math.min(MUTATION.maxRate, rate * MUTATION.explorerFactor)
    return rate >= ceiling ? rate : rate + random01() * (ceiling - rate)
}

/**
 * A shared middle-lane start keeps scores comparable. Round-robin starts previously
 * produced 9 elite failures in 21 generations after winners from another lane.
 */
const raceStartPosition = (road: Road): Vec2 => lanePosition(road, Math.floor(road.laneCount / 2))

/** Display override used only while the human holds the wheel. */
export const PLAYER_COLOR = '#38bdf8'

const createRacingCar = (position: Vec2, network: Network, player = false): RacingCar => {
    const car = createCar(position, RACING_CAR_SPEC, network.color)
    return {
        car,
        player,
        network,
        // Recast against real obstacles on the first simulation step.
        sensorState: castSensors(position, car.heading, []),
        stats: createStats(position),
        winner: false,
    }
}

/** Selects an elite or a mutated parent; a missing parent pool produces random networks. */
const networkForIndex = (
    index: number,
    quantity: number,
    mutationRate: number,
    architecture: readonly number[],
    parents: readonly Network[],
): Network => {
    if (parents.length === 0) {
        return createNetwork(architecture)
    }
    if (index === 0) {
        return parents[0]
    }
    // Reserve the refining band for the winner; distribute the rest across all parents.
    const refiners = Math.floor(quantity * MUTATION_DISTRIBUTION.minimal)
    const parent = index < refiners ? parents[0] : parents[index % parents.length]
    const rate = mutationRateForIndex(index, quantity, mutationRate, Math.random)
    return mutate(parent, rate)
}

const architectureFor = (options: PopulationOptions): number[] => [
    SENSOR_ZONE_ORDER.length + 1,
    ...options.hiddenLayers,
    3,
]

const usableParents = (
    options: PopulationOptions,
    architecture: readonly number[],
): readonly Network[] =>
    (options.parents ?? []).filter((parent) => sameArchitecture(parent.architecture, architecture))

/** Checks the fixed sensor/speed input and output contract. */
export const isCompatibleNetwork = (network: Network, hiddenLayers: readonly number[]): boolean =>
    sameArchitecture(network.architecture, [SENSOR_ZONE_ORDER.length + 1, ...hiddenLayers, 3])

/**
 * Builds the always-present player competitor. It clones the winner so manual training
 * corrects an existing policy; toggling manual control never rebuilds the generation.
 */
export const createPlayerCar = (road: Road, options: PopulationOptions): RacingCar => {
    const architecture = architectureFor(options)
    const parents = usableParents(options, architecture)
    return createRacingCar(
        raceStartPosition(road),
        parents.length > 0 ? mutate(parents[0], 0) : createNetwork(architecture),
        true,
    )
}

/** Returns compatible champion/archive entrants once each, preserving their exact weights. */
const fixedEntrants = (
    options: PopulationOptions,
    architecture: readonly number[],
    elite: Network | undefined,
): Network[] => {
    const entrants: Network[] = []
    const seen = new Set<string>(elite ? [elite.id] : [])
    const candidates: readonly Network[] = [
        ...(options.champion ? [options.champion] : []),
        ...(options.veterans ?? []),
    ]
    for (const network of candidates) {
        if (seen.has(network.id) || !sameArchitecture(network.architecture, architecture)) {
            continue
        }
        seen.add(network.id)
        entrants.push(network)
    }
    // Keep at least half the grid available for offspring.
    return entrants.slice(0, Math.floor(options.quantity / 2))
}

/**
 * Builds offspring first, then adds deduplicated fixed entrants. Incompatible parents
 * are dropped; if none remain the population starts randomly.
 */
export const createPopulation = (road: Road, options: PopulationOptions): RacingCar[] => {
    const architecture = architectureFor(options)
    const parents = usableParents(options, architecture)
    const entrants = fixedEntrants(options, architecture, parents[0])
    const offspringCount = Math.max(1, options.quantity - entrants.length)

    const cars: RacingCar[] = []
    for (let index = 0; index < offspringCount; index++) {
        const network = networkForIndex(
            index,
            offspringCount,
            options.mutationRate,
            architecture,
            parents,
        )
        cars.push(createRacingCar(raceStartPosition(road), network))
    }
    for (const network of entrants) {
        cars.push(createRacingCar(raceStartPosition(road), network))
    }
    return cars
}
