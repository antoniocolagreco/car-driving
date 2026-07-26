import { clamp, tanh } from '@core/math'
import { randomId, randomSymmetric } from '@core/random'
import { MUTATION } from '@core/config'

/**
 * The feed-forward neural network that drives a car, plus the genetic operators
 * (random init, mutation) used to evolve a population of them, and the
 * serialization needed to save/load a network to localStorage.
 *
 * I/O CONTRACT — this is the crux of the whole simulation:
 *
 * Inputs are the eleven fixed area readings (left flank through right flank), each
 * normalized from 0 clear to 1 touching, followed by the car's speed normalized to
 * [-1, 1].
 *
 * Outputs are always exactly 3 — `[throttle, brake, steering]`:
 *   - throttle is in [-1, 1], negative meaning reverse.
 *   - brake is analog pressure in [0, 1]; a negative internal activation is exposed as 0.
 *   - steering is in [-1, 1], negative meaning left.
 *
 * So a network's `architecture` is always `[12, ...hiddenLayers, 3]`.
 */

/**
 * One fully-connected layer: every input neuron connects to every output neuron.
 *
 * `weights[inputIndex][outputIndex]` is the strength of the connection between
 * input neuron `inputIndex` and output neuron `outputIndex`. A high weight means
 * that input strongly drives the output (e.g. a front sensor with a high weight
 * towards the "brake" output means the car brakes when it sees an obstacle ahead).
 * A negative weight inhibits the output instead of exciting it.
 *
 * `biases[outputIndex]` is that output neuron's activation threshold: a high bias
 * makes the neuron "lazy" (hard to activate), a low bias makes it "trigger-happy".
 */
export type Layer = {
    weights: number[][]
    biases: number[]
    /**
     * Cache of the input values from the last `feedForward` call. This is NOT one
     * of the model's parameters — it is not touched by mutation or serialization —
     * it only exists so the visualizer can compute each connection's contribution
     * (`|input * weight|`) without having to redo the forward pass itself.
     */
    inputs: number[]
    /** Cache of the output values from the last `feedForward` call, for the same reason. */
    outputs: number[]
}

/** A full network: one `Layer` per transition between consecutive architecture sizes. */
export type Network = {
    id: string
    /** Neuron count per layer, input layer first. Always `[12, ..., 3]`. */
    architecture: readonly number[]
    layers: Layer[]
    /** Which generation of the population this network belongs to. */
    generation: number
    /** The best fitness this network (or its lineage) has ever scored. */
    bestFitness: number
}

/** One supervised observation: network inputs paired with the controls chosen by a human. */
export type TrainingExample = {
    readonly inputs: readonly number[]
    readonly targets: readonly number[]
}

type LayerGradients = {
    weights: number[][]
    biases: number[]
}

/** Gradient sums accumulated at one unchanged set of network parameters. */
export type NetworkGradients = {
    readonly layers: LayerGradients[]
    examples: number
}

const NETWORK_FORMAT_VERSION = 6
const BRAKE_OUTPUT_INDEX = 1

/** JSON-safe shape of a `Network`, used for localStorage persistence. */
export type SerializedNetwork = {
    version: typeof NETWORK_FORMAT_VERSION
    id: string
    architecture: number[]
    generation: number
    bestFitness: number
    layers: { weights: number[][]; biases: number[] }[]
}

/** Builds one randomly-initialized layer, weights and biases uniform in [-1, 1]. */
const createLayer = (inputCount: number, outputCount: number): Layer => {
    const weights: number[][] = []
    for (let inputIndex = 0; inputIndex < inputCount; inputIndex++) {
        const row: number[] = []
        for (let outputIndex = 0; outputIndex < outputCount; outputIndex++) {
            row.push(randomSymmetric())
        }
        weights.push(row)
    }

    const biases: number[] = []
    for (let outputIndex = 0; outputIndex < outputCount; outputIndex++) {
        biases.push(randomSymmetric())
    }

    return {
        weights,
        biases,
        inputs: new Array(inputCount).fill(0),
        outputs: new Array(outputCount).fill(0),
    }
}

/**
 * Creates a network with random weights and biases in [-1, 1]. `architecture` is
 * the full neuron count per layer, input layer first (see the file-level doc
 * comment for the input/output contract).
 */
export const createNetwork = (architecture: readonly number[]): Network => {
    const layers: Layer[] = []
    for (let index = 0; index < architecture.length - 1; index++) {
        layers.push(createLayer(architecture[index], architecture[index + 1]))
    }

    return {
        id: randomId(),
        architecture,
        layers,
        generation: 0,
        bestFitness: 0,
    }
}

/**
 * Runs one layer's forward pass, mutating its `inputs`/`outputs` caches in place
 * (see the `Layer` doc comment for why that is safe) and returning the outputs.
 */
const feedLayer = (layer: Layer, inputs: readonly number[]): number[] => {
    for (let inputIndex = 0; inputIndex < layer.inputs.length; inputIndex++) {
        layer.inputs[inputIndex] = inputs[inputIndex]
    }

    // For each output neuron, sum every input weighted by the strength of its
    // connection to that output. This is "how much attention" the neuron pays to
    // each input: a strong positive weight means that input drives the neuron up,
    // a strong negative weight pulls it down, and a near-zero weight means the
    // neuron mostly ignores that input.
    for (let outputIndex = 0; outputIndex < layer.outputs.length; outputIndex++) {
        let weightedSum = 0
        for (let inputIndex = 0; inputIndex < layer.inputs.length; inputIndex++) {
            weightedSum += layer.inputs[inputIndex] * layer.weights[inputIndex][outputIndex]
        }

        // The activation function turns the raw weighted sum (plus the neuron's
        // bias) into a bounded, smooth output. tanh squashes any real number into
        // (-1, 1): strongly positive sums saturate near 1, strongly negative sums
        // saturate near -1, and sums near zero pass through roughly unchanged.
        // The extra clamp guards against floating-point overshoot right at the edges.
        layer.outputs[outputIndex] = clamp(tanh(weightedSum, layer.biases[outputIndex]), -1, 1)
    }

    return layer.outputs
}

/**
 * Runs the full network forward: the given inputs feed the first layer, and each
 * layer's output becomes the next layer's input. See the file-level doc comment
 * for what the inputs/outputs mean.
 *
 * As a side effect, every layer's `inputs`/`outputs` caches are updated so the
 * visualizer can read them straight off `network.layers` after this call.
 */
export const feedForward = (network: Network, inputs: readonly number[]): readonly number[] => {
    let current: readonly number[] = inputs
    for (let index = 0; index < network.layers.length; index++) {
        const layer = network.layers[index]
        current = feedLayer(layer, current)
        if (index === network.layers.length - 1 && layer.outputs.length > BRAKE_OUTPUT_INDEX) {
            // Brake pressure is unipolar. Rectify it at the network boundary so neither
            // physics, rendering nor training ever observes a nonsensical negative brake.
            layer.outputs[BRAKE_OUTPUT_INDEX] = clamp(
                layer.outputs[BRAKE_OUTPUT_INDEX],
                0,
                1,
            )
            current = layer.outputs
        }
    }
    return current
}

/**
 * Mutates a single weight or bias: with probability `rate` it is nudged by up to
 * `MUTATION.perturbation`, and otherwise left exactly as it was.
 *
 * `rate` is a PROBABILITY PER PARAMETER, not a blend factor, and that distinction
 * is what makes the search work. The previous version blended *every* parameter
 * with a fresh random value at `rate` — a 10 % mutation moved all ~200 weights at
 * once, which in weight space is a long jump in a random direction, not a small
 * step. There was no local search at any rate, so the champion plateaued within a
 * few generations: measured on the standard course, generation 3 reached 1935 px
 * and generations 4-12 never improved on it. Touching a tenth of the parameters
 * by a small amount is a step; touching all of them a little is a leap.
 */
const mutateValue = (current: number, rate: number): number => {
    if (Math.random() >= rate) {
        return current
    }
    return clamp(current + randomSymmetric() * MUTATION.perturbation, -1, 1)
}

/** Mutates one layer, returning a new `Layer` that shares no array with the source. */
const mutateLayer = (layer: Layer, rate: number): Layer => {
    const weights = layer.weights.map((row) => row.map((weight) => mutateValue(weight, rate)))
    const biases = layer.biases.map((bias) => mutateValue(bias, rate))

    return {
        weights,
        biases,
        inputs: new Array(layer.inputs.length).fill(0),
        outputs: new Array(layer.outputs.length).fill(0),
    }
}

/**
 * Returns a NEW network, a mutated copy of `network`, sharing no array with it.
 * `rate` (clamped to [0, 1]) controls how much of each weight/bias comes from the
 * source versus a fresh random value: 0 is an exact clone, 1 is fully random.
 */
export const mutate = (network: Network, rate: number): Network => {
    const clampedRate = clamp(rate, 0, 1)

    return {
        id: randomId(),
        architecture: network.architecture,
        layers: network.layers.map((layer) => mutateLayer(layer, clampedRate)),
        generation: 0,
        bestFitness: 0,
    }
}

/**
 * SUPERVISED LEARNING: computes gradients without changing weights, so many examples
 * can contribute to one exact average update.
 *
 * This is backpropagation, and it is the counterpart to `mutate`: where evolution
 * searches blindly and needs a whole population and a whole generation to find out
 * whether a change helped, a gradient step knows exactly which direction each weight
 * should move — because here, unlike in the race, we have the answer. When a human
 * drives, their inputs ARE the answer, so the car's network can simply be taught them.
 *
 * Hidden neurons, throttle and steering use `tanh(sum + bias)` (see `math.ts`), whose
 * derivative is `1 - y²`. Brake is rectified to [0, 1]; at its zero floor the same slope
 * is deliberately retained as a straight-through gradient, otherwise a negative initial
 * activation could never learn to become a positive braking command from human examples.
 * Every delta in a batch is computed before any weight is written: a hidden layer's error
 * depends on the layer in front of it, and updating between examples would make the final
 * result depend on their order.
 *
 * Weights stay clamped to [-1, 1], the range `createNetwork` and `mutate` work in, so a
 * taught network remains a valid parent for the genetic algorithm.
 */
/** Computes every layer's deltas for one example without changing a parameter. */
const computeDeltas = (
    network: Network,
    inputs: readonly number[],
    targets: readonly number[],
): number[][] => {
    feedForward(network, inputs)
    const lastIndex = network.layers.length - 1
    const deltasPerLayer: number[][] = []

    for (let index = lastIndex; index >= 0; index--) {
        const layer = network.layers[index]
        const deltas: number[] = []

        if (index === lastIndex) {
            // How wrong each output was, scaled by how much its activation can still move.
            for (let output = 0; output < layer.outputs.length; output++) {
                const value = layer.outputs[output]
                const targetMinimum: number = output === BRAKE_OUTPUT_INDEX ? 0 : -1
                const target = clamp(targets[output] ?? value, targetMinimum, 1)
                deltas.push((value - target) * (1 - value * value))
            }
        } else {
            // A hidden neuron's error is the error it caused downstream, weighted by how
            // strongly it is connected to each of those neurons.
            const next = network.layers[index + 1]
            const nextDeltas = deltasPerLayer[index + 1]
            for (let neuron = 0; neuron < layer.outputs.length; neuron++) {
                let downstream = 0
                for (let output = 0; output < next.outputs.length; output++) {
                    downstream += next.weights[neuron][output] * nextDeltas[output]
                }
                const value = layer.outputs[neuron]
                deltas.push(downstream * (1 - value * value))
            }
        }

        deltasPerLayer[index] = deltas
    }

    return deltasPerLayer
}

/** Creates a zero-filled gradient accumulator matching `network` exactly. */
export const createNetworkGradients = (network: Network): NetworkGradients => ({
    layers: network.layers.map((layer) => ({
        weights: layer.weights.map((row) => row.map(() => 0)),
        biases: layer.biases.map(() => 0),
    })),
    examples: 0,
})

/** Adds one example's gradient at the network's CURRENT, unchanged parameters. */
export const accumulateNetworkGradients = (
    network: Network,
    example: TrainingExample,
    gradients: NetworkGradients,
): void => {
    const deltasPerLayer: number[][] = computeDeltas(network, example.inputs, example.targets)

    for (let index = 0; index < network.layers.length; index++) {
        const layer = network.layers[index]
        const deltas = deltasPerLayer[index]
        const layerGradients = gradients.layers[index]
        for (let output = 0; output < layer.outputs.length; output++) {
            const delta = deltas[output]
            layerGradients.biases[output] += delta
            for (let input = 0; input < layer.inputs.length; input++) {
                layerGradients.weights[input][output] += delta * layer.inputs[input]
            }
        }
    }

    gradients.examples += 1
}

/** Applies the exact mean of every accumulated gradient, then leaves the accumulator intact. */
export const applyAverageGradients = (
    network: Network,
    gradients: NetworkGradients,
    rate: number,
): void => {
    if (gradients.examples === 0) {
        return
    }

    const scale: number = rate / gradients.examples
    for (let index = 0; index < network.layers.length; index++) {
        const layer = network.layers[index]
        const layerGradients = gradients.layers[index]
        for (let output = 0; output < layer.outputs.length; output++) {
            layer.biases[output] = clamp(
                layer.biases[output] - scale * layerGradients.biases[output],
                -1,
                1,
            )
            for (let input = 0; input < layer.inputs.length; input++) {
                layer.weights[input][output] = clamp(
                    layer.weights[input][output] - scale * layerGradients.weights[input][output],
                    -1,
                    1,
                )
            }
        }
    }
}

/** Trains once on the exact average gradient of `examples`; order cannot affect the update. */
export const trainBatch = (
    network: Network,
    examples: readonly TrainingExample[],
    rate: number,
): void => {
    const gradients: NetworkGradients = createNetworkGradients(network)
    for (const example of examples) {
        accumulateNetworkGradients(network, example, gradients)
    }
    applyAverageGradients(network, gradients, rate)
}

/** Backwards-compatible one-example training, implemented as a batch of one. */
export const trainStep = (
    network: Network,
    inputs: readonly number[],
    targets: readonly number[],
    rate: number,
): void => {
    trainBatch(network, [{ inputs, targets }], rate)
}

/** Converts a network into a JSON-safe plain object, for localStorage persistence. */
export const serializeNetwork = (network: Network): SerializedNetwork => ({
    version: NETWORK_FORMAT_VERSION,
    id: network.id,
    architecture: [...network.architecture],
    generation: network.generation,
    bestFitness: network.bestFitness,
    layers: network.layers.map((layer) => ({
        weights: layer.weights.map((row) => [...row]),
        biases: [...layer.biases],
    })),
})

const isNumberArray = (value: unknown): value is number[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'number')

const isNumberMatrix = (value: unknown): value is number[][] =>
    Array.isArray(value) && value.every((row) => isNumberArray(row))

/**
 * Parses a network back from a value read from localStorage. Returns `undefined`
 * — rather than throwing or building a half-valid network — when `data` is not an
 * object, has the wrong `version`, or has a shape that does not match its own
 * declared `architecture` (e.g. tampered or from an incompatible old save).
 */
export const deserializeNetwork = (data: unknown): Network | undefined => {
    if (typeof data !== 'object' || data === null) {
        return undefined
    }

    const payload = data as Record<string, unknown>

    if (payload.version !== NETWORK_FORMAT_VERSION) {
        return undefined
    }
    if (typeof payload.id !== 'string') {
        return undefined
    }
    if (!isNumberArray(payload.architecture) || payload.architecture.length < 2) {
        return undefined
    }
    if (typeof payload.generation !== 'number' || typeof payload.bestFitness !== 'number') {
        return undefined
    }
    if (!Array.isArray(payload.layers)) {
        return undefined
    }

    const architecture = payload.architecture
    const rawLayers: unknown[] = payload.layers

    if (rawLayers.length !== architecture.length - 1) {
        return undefined
    }

    const layers: Layer[] = []
    for (let index = 0; index < rawLayers.length; index++) {
        const rawLayer = rawLayers[index]
        if (typeof rawLayer !== 'object' || rawLayer === null) {
            return undefined
        }

        const layerPayload = rawLayer as Record<string, unknown>
        const inputCount = architecture[index]
        const outputCount = architecture[index + 1]

        if (!isNumberMatrix(layerPayload.weights) || layerPayload.weights.length !== inputCount) {
            return undefined
        }
        if (layerPayload.weights.some((row) => row.length !== outputCount)) {
            return undefined
        }
        if (!isNumberArray(layerPayload.biases) || layerPayload.biases.length !== outputCount) {
            return undefined
        }

        layers.push({
            weights: layerPayload.weights.map((row) => [...row]),
            biases: [...layerPayload.biases],
            inputs: new Array(inputCount).fill(0),
            outputs: new Array(outputCount).fill(0),
        })
    }

    return {
        id: payload.id,
        architecture,
        layers,
        generation: payload.generation,
        bestFitness: payload.bestFitness,
    }
}
