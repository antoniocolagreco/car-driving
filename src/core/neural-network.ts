import { clamp, tanh } from '@core/math'
import { randomColor, randomSymmetric } from '@core/random'
import { MUTATION, VETERANS } from '@core/config'

/**
 * Network contract: eleven ordered sensor readings plus normalized speed feed
 * `[throttle, brake, steering]`. `car.ts` thresholds brake at `> 0.5`, so compatible
 * architectures are `[12, ...hiddenLayers, 3]`.
 */

/** Fully connected layer; weights are indexed as `[input][output]`. */
export type Layer = {
    weights: number[][]
    biases: number[]
    /** Last forward-pass inputs, cached for visualization and excluded from persistence. */
    inputs: number[]
    /** Last forward-pass outputs, cached for visualization. */
    outputs: number[]
}

/** One race driven by these exact weights. Overtakes never include bonuses. */
export type RaceRecord = {
    readonly overtakes: number
    /** Present only for completed courses; its presence is the completion flag. */
    readonly seconds?: number
}

export type Network = {
    /** Content-derived identity; update it whenever parameters change. */
    id: string
    /** Neuron counts, input layer first. */
    architecture: readonly number[]
    layers: Layer[]
    generation: number
    /** Persistent body colour used to follow the network across races. */
    color: string
    /** Oldest-first race history for these exact weights; excluded from `id`. */
    history: RaceRecord[]
}

/** Appends a race and enforces the history cap. */
export const recordRace = (network: Network, record: RaceRecord): void => {
    network.history.push(record)
    if (network.history.length > VETERANS.historyLimit) {
        network.history.splice(0, network.history.length - VETERANS.historyLimit)
    }
}

/** Network inputs paired with controls chosen by a human. */
export type TrainingExample = {
    readonly inputs: readonly number[]
    readonly targets: readonly number[]
}

type LayerGradients = {
    weights: number[][]
    biases: number[]
}

/** Gradient sums computed at one unchanged parameter set. */
export type NetworkGradients = {
    readonly layers: LayerGradients[]
    examples: number
}

const NETWORK_FORMAT_VERSION = 9
const BRAKE_OUTPUT_INDEX = 1

/** Storage quantization: two decimals keeps the archive within localStorage limits. */
const STORED_DECIMALS = 2

const rounded = (value: number): number => Number(value.toFixed(STORED_DECIMALS))

/**
 * Hashes quantized architecture and parameters into a stable 64-bit identity. Using the
 * same quantization as serialization preserves ids across reloads and deduplicates clones.
 */
export const networkId = (
    architecture: readonly number[],
    layers: readonly { weights: number[][]; biases: number[] }[],
): string => {
    let low = 0x811c9dc5
    let high = 0x01000193

    const absorb = (value: number): void => {
        // Hash an integer to avoid text-format and negative-zero differences.
        const quantised = Math.round(rounded(value) * 10 ** STORED_DECIMALS)
        low = Math.imul(low ^ quantised, 0x01000193)
        high = Math.imul(high ^ (quantised + 0x9e3779b9), 0x85ebca6b)
    }

    for (const size of architecture) {
        absorb(size)
    }
    for (const layer of layers) {
        for (const row of layer.weights) {
            for (const weight of row) {
                absorb(weight)
            }
        }
        for (const bias of layer.biases) {
            absorb(bias)
        }
    }

    const text = (value: number): string => (value >>> 0).toString(36).padStart(7, '0')
    return `${text(low)}${text(high)}`.toUpperCase()
}

const idOf = (network: Pick<Network, 'architecture' | 'layers'>): string =>
    networkId(network.architecture, network.layers)

/** Human-readable prefix; comparisons always use the full id. */
export const shortNetworkId = (id: string): string => id.slice(0, 8)

export type SerializedNetwork = {
    version: typeof NETWORK_FORMAT_VERSION
    id: string
    architecture: number[]
    generation: number
    color: string
    history: RaceRecord[]
    layers: { weights: number[][]; biases: number[] }[]
}

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

/** Creates a network with weights and biases uniform in `[-1, 1]`. */
export const createNetwork = (architecture: readonly number[]): Network => {
    const layers: Layer[] = []
    for (let index = 0; index < architecture.length - 1; index++) {
        layers.push(createLayer(architecture[index], architecture[index + 1]))
    }

    return {
        id: networkId(architecture, layers),
        architecture,
        layers,
        generation: 0,
        color: randomColor(),
        history: [],
    }
}

/** Runs one layer and refreshes its visualization caches. */
const feedLayer = (layer: Layer, inputs: readonly number[]): number[] => {
    for (let inputIndex = 0; inputIndex < layer.inputs.length; inputIndex++) {
        layer.inputs[inputIndex] = inputs[inputIndex]
    }

    for (let outputIndex = 0; outputIndex < layer.outputs.length; outputIndex++) {
        let weightedSum = 0
        for (let inputIndex = 0; inputIndex < layer.inputs.length; inputIndex++) {
            weightedSum += layer.inputs[inputIndex] * layer.weights[inputIndex][outputIndex]
        }

        // Clamp guards the activation range against floating-point overshoot.
        layer.outputs[outputIndex] = clamp(tanh(weightedSum, layer.biases[outputIndex]), -1, 1)
    }

    return layer.outputs
}

/** Runs the network and refreshes every layer's visualization caches. */
export const feedForward = (network: Network, inputs: readonly number[]): readonly number[] => {
    let current: readonly number[] = inputs
    for (const layer of network.layers) {
        current = feedLayer(layer, current)
    }
    return current
}

/**
 * Perturbs one parameter with probability `rate`. This replaced blending every parameter,
 * which produced a measured generation 3-12 plateau instead of local search.
 */
const mutateValue = (current: number, rate: number): number => {
    if (Math.random() >= rate) {
        return current
    }
    return clamp(current + randomSymmetric() * MUTATION.perturbation, -1, 1)
}

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

/** Returns a deep, history-free copy with each parameter perturbed at `rate`. */
export const mutate = (network: Network, rate: number): Network => {
    const clampedRate = clamp(rate, 0, 1)
    const layers = network.layers.map((layer) => mutateLayer(layer, clampedRate))

    // Children get fresh history; exact clones keep the parent's content-derived id.
    return {
        id: networkId(network.architecture, layers),
        architecture: network.architecture,
        layers,
        generation: 0,
        color: randomColor(),
        history: [],
    }
}

/**
 * Backpropagation uses `1 - y²` for tanh. Brake targets remain continuous here; the
 * binary threshold belongs to `car.ts`. Batch deltas are computed before weights move.
 */
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
            for (let output = 0; output < layer.outputs.length; output++) {
                const value = layer.outputs[output]
                const targetMinimum: number = output === BRAKE_OUTPUT_INDEX ? 0 : -1
                const target = clamp(targets[output] ?? value, targetMinimum, 1)
                deltas.push((value - target) * (1 - value * value))
            }
        } else {
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

export const createNetworkGradients = (network: Network): NetworkGradients => ({
    layers: network.layers.map((layer) => ({
        weights: layer.weights.map((row) => row.map(() => 0)),
        biases: layer.biases.map(() => 0),
    })),
    examples: 0,
})

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

/** Applies the mean accumulated gradient and refreshes the content id. */
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

    network.id = idOf(network)
}

/** Trains once on the average gradient; example order cannot affect the update. */
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

export const serializeNetwork = (network: Network): SerializedNetwork => ({
    version: NETWORK_FORMAT_VERSION,
    id: network.id,
    architecture: [...network.architecture],
    generation: network.generation,
    color: network.color,
    history: network.history.map((record) =>
        record.seconds === undefined
            ? { overtakes: record.overtakes }
            : { overtakes: record.overtakes, seconds: rounded(record.seconds) },
    ),
    layers: network.layers.map((layer) => ({
        weights: layer.weights.map((row) => row.map(rounded)),
        biases: layer.biases.map(rounded),
    })),
})

const isNumberArray = (value: unknown): value is number[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'number')

const isNumberMatrix = (value: unknown): value is number[][] =>
    Array.isArray(value) && value.every((row) => isNumberArray(row))

/** Drops malformed history entries without discarding otherwise valid evolved weights. */
const deserializeHistory = (value: unknown): RaceRecord[] => {
    if (!Array.isArray(value)) {
        return []
    }
    const history: RaceRecord[] = []
    for (const entry of value) {
        if (typeof entry !== 'object' || entry === null) {
            continue
        }
        const { overtakes, seconds } = entry as { overtakes?: unknown; seconds?: unknown }
        if (typeof overtakes !== 'number' || !Number.isFinite(overtakes)) {
            continue
        }
        history.push(
            typeof seconds === 'number' && Number.isFinite(seconds)
                ? { overtakes, seconds }
                : { overtakes },
        )
    }
    return history.slice(-VETERANS.historyLimit)
}

/** Parses a stored network, rejecting incompatible versions and malformed architectures. */
export const deserializeNetwork = (data: unknown): Network | undefined => {
    if (typeof data !== 'object' || data === null) {
        return undefined
    }

    const payload = data as Record<string, unknown>

    if (payload.version !== NETWORK_FORMAT_VERSION) {
        return undefined
    }
    if (!isNumberArray(payload.architecture) || payload.architecture.length < 2) {
        return undefined
    }
    if (typeof payload.generation !== 'number') {
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
        // Never trust a stored identity over the parameters that define it.
        id: networkId(architecture, layers),
        architecture,
        layers,
        generation: payload.generation,
        color: typeof payload.color === 'string' ? payload.color : randomColor(),
        history: deserializeHistory(payload.history),
    }
}
