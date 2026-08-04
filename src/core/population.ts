import type { Vec2 } from '@core/geometry'
import { clamp } from '@core/math'
import { randomColor } from '@core/random'
import { MUTATION, MUTATION_DISTRIBUTION } from '@core/config'
import { type Network, createNetwork, mutate } from './neural-network'
import { SENSOR_ZONE_ORDER, type SensorState, castSensors } from './sensor'
import { type CarStats, createStats } from './fitness'
import { type Car, RACING_CAR_SPEC, createCar } from './car'
import { type Road, lanePosition } from './road'

/**
 * Generation and selection: turns a `Road` plus a set of options into a fresh
 * population of `RacingCar`s, ready for `simulation.ts` to step. This is where
 * the previous generation's winner is either cloned-with-mutation into the
 * next generation or discarded, but never both — see `createPopulation`.
 */

/** A competitor: a car body, the brain driving it, its sensors and its score. */
export type RacingCar = {
    car: Car
    /** True for the player's car: always in the field, driven by hand only when asked. */
    readonly player: boolean
    network: Network
    sensorState: SensorState
    stats: CarStats
    winner: boolean
}

/** Everything needed to build one generation's population. */
export type PopulationOptions = {
    readonly quantity: number
    readonly hiddenLayers: readonly number[]
    readonly mutationRate: number
    /**
     * The previous generation's best networks, best first. Empty on the very first
     * generation, when there is nothing to breed from and every car starts random.
     */
    readonly parents?: readonly Network[]
}

/** Two architectures match when they have the same length and the same neuron counts, in order. */
const sameArchitecture = (a: readonly number[], b: readonly number[]): boolean =>
    a.length === b.length && a.every((count, index) => count === b[index])

/**
 * The mutation rate for car `index` of `quantity`, following `MUTATION_DISTRIBUTION`:
 * the first `minimal` share is barely touched (a fixed, very low rate), the next
 * `low` share gets something between that floor and `baseRate`, the next `target`
 * share gets exactly `baseRate`, and the rest — the explorers — get something
 * between `baseRate` and full randomness. `random01` is injected (rather than
 * calling `Math.random` directly) so the tiering can be unit tested deterministically.
 */
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
    // Whatever is left after flooring the first three bands becomes the fourth
    // (explorer) band, so the four shares always add up to the full population
    // even when `quantity * share` does not divide evenly.

    if (index < minimalCount) {
        return MUTATION.lowRateFloor
    }

    if (index < lowCount) {
        // Between the floor and the base rate. If the base rate is already at or
        // below the floor there is no room between them, so fall back to it.
        return rate <= MUTATION.lowRateFloor
            ? rate
            : MUTATION.lowRateFloor + random01() * (rate - MUTATION.lowRateFloor)
    }

    if (index < targetCount) {
        return rate
    }

    // The explorers: between the base rate and a multiple of it, NOT between the base
    // rate and full randomness. Tying the ceiling to the rate is what makes the slider
    // mean something — at 2 % the whole field still drives like the winner, at 50 %
    // even the refiners are taking real risks. If there is no room above the rate
    // (already at the maximum), fall back to it.
    const ceiling = Math.min(MUTATION.maxRate, rate * MUTATION.explorerFactor)
    return rate >= ceiling ? rate : rate + random01() * (ceiling - rate)
}

/**
 * The winner — car 0, the previous generation's winner, running its network
 * unmutated — is always white, while its mutated offspring get random colours.
 * Without it the crowd is a wall of indistinguishable colours and the one car
 * that matters, the one every other car is a variation of, cannot be picked out.
 */
const WINNER_COLOR = '#ffffff'

/**
 * Every competitor starts from the middle lane, on the same spot.
 *
 * They used to be spread across the lanes round-robin, `0, 1, 2, 0, ...`, which
 * quietly made the start lane part of the score. These networks drive a learned
 * trajectory rather than a lane-aware policy, so the same weights that pass eight
 * cars from lane 1 drive straight into the right-hand rail from lane 0. Two things
 * followed. The elite is always car 0 and so always restarted in lane 0, while the
 * winner it carries had almost never won there: measured over 21 generations it
 * scored nothing in 9 of them, and every one of those 9 followed a winner that had
 * come from lane 1 or 2, never from lane 0. And ranking a field whose members ran
 * from different lanes compares them on different tasks, so the "best" network was
 * partly whoever drew the lane that suited its trajectory, and its children were
 * redistributed across all three lanes where two thirds of them started in the wrong
 * one. One start line for everybody removes that variable: the elite re-runs the race
 * it actually won, and every score in the generation is earned on the same problem.
 */
const raceStartPosition = (road: Road): Vec2 => lanePosition(road, Math.floor(road.laneCount / 2))

/**
 * Display colour used only while the human holds the wheel. The player's stored body
 * colour remains random, so under neural-network control it looks like an ordinary
 * evolved competitor; white remains reserved for the winner.
 */
export const PLAYER_COLOR = '#38bdf8'

/** Builds a `RacingCar` at `position`, with a fresh body, stats and an empty (not-yet-cast) sensor state. */
const createRacingCar = (
    position: Vec2,
    network: Network,
    color: string,
    player = false,
): RacingCar => {
    const car = createCar(position, RACING_CAR_SPEC, color)
    return {
        car,
        player,
        network,
        // No obstacles exist to cast against yet at population creation time;
        // `simulation.ts` casts the real sensor state on the first `step`.
        sensorState: castSensors(position, car.heading, []),
        stats: createStats(position),
        winner: false,
    }
}

/**
 * Picks the network for car `index`.
 *
 * With no parents (the very first generation) every car is fresh and random. With
 * parents, car 0 is `parents[0]` — the winner itself, unmutated: elitism, so a
 * generation can never lose the best network it has found. Every other car descends
 * from one of the parents, taken round-robin so each of them gets a comparable share
 * of the field, and is mutated exactly once at `mutationRateForIndex`'s tiered rate.
 */
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
    // The refining band belongs to the winner: those are the cars whose job is to
    // improve on the best network we have, and handing a quarter of them to a weaker
    // parent instead just dilutes the line that is actually winning. Everyone else is
    // spread across the parents round-robin, which is what keeps rival strategies alive.
    const refiners = Math.floor(quantity * MUTATION_DISTRIBUTION.minimal)
    const parent = index < refiners ? parents[0] : parents[index % parents.length]
    const rate = mutationRateForIndex(index, quantity, mutationRate, Math.random)
    return mutate(parent, rate)
}

/** The architecture a population with these settings needs: see the I/O contract in `neural-network.ts`. */
const architectureFor = (options: PopulationOptions): number[] => [
    SENSOR_ZONE_ORDER.length + 1,
    ...options.hiddenLayers,
    3,
]

/** The parents that can actually be used with `architecture`, best first. */
const usableParents = (
    options: PopulationOptions,
    architecture: readonly number[],
): readonly Network[] =>
    (options.parents ?? []).filter((parent) => sameArchitecture(parent.architecture, architecture))

/** True when a network can consume the eleven spatial readings followed by speed. */
export const isCompatibleNetwork = (network: Network, hiddenLayers: readonly number[]): boolean =>
    sameArchitecture(network.architecture, [SENSOR_ZONE_ORDER.length + 1, ...hiddenLayers, 3])

/**
 * Builds the player's car. It is ALWAYS in the field, one more competitor with the same
 * body, sensors and random base colour as everyone else, and a network that starts as an exact
 * copy of the current winner (or a fresh random one when there is no winner yet).
 *
 * Always present, because the alternative was worse: adding and removing it when manual
 * driving was switched on and off meant every toggle rebuilt the generation, and a driver
 * switches off the moment they crash — so a round somebody had just won was thrown away
 * on the way out. Here the car simply exists, and the switch only decides who holds its
 * wheel. When nobody does, its network drives it exactly like the others.
 *
 * Starting from the winner rather than from noise is what makes driving worth doing:
 * your inputs teach corrections on top of what the population already knows, instead of
 * having to demonstrate the whole task from scratch (see `trainBatch`).
 */
export const createPlayerCar = (road: Road, options: PopulationOptions): RacingCar => {
    const architecture = architectureFor(options)
    const parents = usableParents(options, architecture)
    return createRacingCar(
        raceStartPosition(road),
        parents.length > 0 ? mutate(parents[0], 0) : createNetwork(architecture),
        randomColor(),
        true,
    )
}

/**
 * Builds one generation's population. Cars share the same start line but rotate
 * through every available lane (`0, 1, 2, 0, ...`). A parent trained for a different
 * fixed sensor layout or hidden-layer shape than requested here is unusable — its
 * `architecture` does not match `[12, ...hiddenLayers, 3]` and it could
 * not even `feedForward` — so it is dropped, and if that leaves no parents at all
 * every car starts fresh instead of crashing or silently producing garbage.
 */
export const createPopulation = (road: Road, options: PopulationOptions): RacingCar[] => {
    const architecture = architectureFor(options)
    const parents = usableParents(options, architecture)

    const cars: RacingCar[] = []
    for (let index = 0; index < options.quantity; index++) {
        const network = networkForIndex(
            index,
            options.quantity,
            options.mutationRate,
            architecture,
            parents,
        )
        const isWinner = parents.length > 0 && index === 0
        cars.push(
            createRacingCar(
                raceStartPosition(road),
                network,
                isWinner ? WINNER_COLOR : randomColor(),
            ),
        )
    }
    return cars
}
