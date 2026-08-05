import { clamp, tanh } from '@core/math'
import { randomColor, randomSymmetric } from '@core/random'
import { MUTATION, VETERANS } from '@core/config'

/**
 * The feed-forward neural network that drives a car, plus the genetic operators
 * (random init, mutation) used to evolve a population of them, and the
 * serialization needed to save/load a network to localStorage.
 *
 * I/O CONTRACT — this is the crux of the whole simulation:
 *
 * Inputs are the eleven fixed area readings (left flank through right flank), each
 * normalized from 0 clear to 1 touching, followed by the car's own speed normalized
 * to [-1, 1].
 *
 * Outputs are always exactly 3 — `[throttle, brake, steering]`:
 *   - throttle is in [-1, 1], negative meaning reverse.
 *   - brake is an activation in [-1, 1]; `car.ts` turns values above 0.5 into full braking.
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

/**
 * One finished race, as remembered by the network that drove it.
 *
 * `overtakes` is the RAW count, with no bonuses added. The brake bonus is an
 * ignition for one generation's ranking, not an achievement: letting it into a
 * permanent record would leave a network that brakes and drives badly carrying a
 * free +10 for the rest of its life.
 */
export type RaceRecord = {
    /** Traffic cars this network passed in that race. */
    readonly overtakes: number
    /**
     * Race seconds to the finish, present only when the course was actually cleared.
     *
     * Its presence is therefore the record of the finish itself, and there is deliberately
     * no separate flag saying so: a time and a completed course are the same event, and
     * two fields for one fact can disagree.
     */
    readonly seconds?: number
}

/** A full network: one `Layer` per transition between consecutive architecture sizes. */
export type Network = {
    /**
     * A hash of the parameters, NOT a random label: see `networkId`. Two networks with
     * the same weights carry the same id and are the same driver, which is what lets the
     * archive deduplicate by content without ever comparing 540 numbers itself.
     *
     * Derived, so it has to be reassigned whenever the weights change. They change in
     * exactly two places: a new network is built (`createNetwork`, `mutate`,
     * `deserializeNetwork`), or a human's driving is trained into one
     * (`applyAverageGradients`). Both reassign it.
     */
    id: string
    /** Neuron count per layer, input layer first. Always `[12, ..., 3]`. */
    architecture: readonly number[]
    layers: Layer[]
    /** Which generation of the population this network belongs to. */
    generation: number
    /**
     * Body colour, drawn for every car this network drives and fixed for its whole life.
     * Colours used to be redrawn at random every generation, which made it impossible to
     * follow anything across a run; tied to the network, a veteran keeps its colour from
     * the race it was admitted on to the race it is dropped.
     */
    color: string
    /**
     * Every race this exact network has run, oldest first, capped at `VETERANS.historyLimit`.
     *
     * A mutated child starts empty: the point of the record is to describe one fixed set
     * of weights across many courses, and weights that changed have not driven any of
     * those races. History is deliberately NOT part of `id`, so the same weights met
     * twice are one network with one record rather than two rival accounts of one driver.
     */
    history: RaceRecord[]
}

/** Appends one finished race to `network`, dropping the oldest once the cap is reached. */
export const recordRace = (network: Network, record: RaceRecord): void => {
    network.history.push(record)
    if (network.history.length > VETERANS.historyLimit) {
        network.history.splice(0, network.history.length - VETERANS.historyLimit)
    }
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

const NETWORK_FORMAT_VERSION = 9
const BRAKE_OUTPUT_INDEX = 1

/**
 * Decimals kept per stored weight and bias.
 *
 * The archive holds a hundred networks, each around 540 parameters, and localStorage
 * gives roughly 5 MB in total: written at full float precision that is megabytes of
 * digits nobody reads. Two decimals cuts a stored network to a few kilobytes.
 *
 * The cost is real and worth knowing: parameters live in [-1, 1], so this quantises
 * them to 201 steps, and a reloaded network is a very slightly different driver from
 * the one that was saved. Raise this number if a restored champion ever stops matching
 * the run that earned it.
 */
const STORED_DECIMALS = 2

const rounded = (value: number): number => Number(value.toFixed(STORED_DECIMALS))

/**
 * The identity of a network: a hash of its architecture, weights and biases.
 *
 * Identity used to be a random 8-character label, which made two networks with byte for
 * byte the same weights two different networks as far as every `id` comparison was
 * concerned. That is not a theoretical worry: the player's car is built as `mutate(elite,
 * 0)`, an exact clone, so measured over 45 races it was an exact copy of the elite in 44
 * of them and was admitted to the veterans archive as a separate member in 12. After 45
 * races, 12 of 92 archive slots held weights that were already in the archive, each
 * accumulating its own separate history and its own separate median. The archive exists
 * to say what ONE set of weights does across many courses, and splitting that evidence
 * between duplicates is the one thing it must not do.
 *
 * With identity derived from the parameters, `updateRoster`'s dedupe by id becomes a
 * dedupe by content and the duplicates cannot be created in the first place.
 *
 * Two details make it correct rather than merely plausible:
 *
 * Parameters are hashed through `rounded`, the SAME quantisation `serializeNetwork`
 * writes with. `rounded` is idempotent, so a network that round-trips through
 * localStorage keeps the id it had before it was saved. Hashing full precision instead
 * would rename every member of the archive on every reload.
 *
 * The accumulator is 64 bits, as two independent 32-bit FNV-1a lanes. A collision would
 * silently merge two genuinely different networks into one archive entry, so 32 bits
 * (roughly one chance in a million over a full roster) was not enough; at 64 the odds are
 * around 3e-16 and the cost is one extra multiply per parameter.
 */
export const networkId = (
    architecture: readonly number[],
    layers: readonly { weights: number[][]; biases: number[] }[],
): string => {
    let low = 0x811c9dc5
    let high = 0x01000193

    const absorb = (value: number): void => {
        // Rounded first, then scaled to an exact integer: hashing the decimal text would
        // have to care about "-0.00" and about float formatting, and this cannot.
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

/** The id `network` should be carrying right now, from the parameters it holds right now. */
const idOf = (network: Pick<Network, 'architecture' | 'layers'>): string =>
    networkId(network.architecture, network.layers)

/**
 * How an id is written wherever one is shown to a human: its head, not the whole hash.
 *
 * The single place that decision is made, which is the point. It used to be made twice:
 * the live stats printed the whole id and the veterans standings printed the first eight
 * characters, so the same network appeared under two different names and the two panels
 * could not be read against each other. Both were self-consistent, and neither knew about
 * the other.
 *
 * It lives here, next to `networkId`, because it is a property of the id format rather
 * than of any one panel, and because the game-over banner in `render/` needs it too and
 * cannot import from `ui/`.
 *
 * Eight base36 characters tell a hundred archive members apart by eye comfortably. The
 * full fourteen stay the identity used for every comparison; this is only the label.
 */
export const shortNetworkId = (id: string): string => id.slice(0, 8)

/** JSON-safe shape of a `Network`, used for localStorage persistence. */
export type SerializedNetwork = {
    version: typeof NETWORK_FORMAT_VERSION
    id: string
    architecture: number[]
    generation: number
    color: string
    history: RaceRecord[]
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
        id: networkId(architecture, layers),
        architecture,
        layers,
        generation: 0,
        color: randomColor(),
        history: [],
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
    for (const layer of network.layers) {
        current = feedLayer(layer, current)
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
 * step. There was no local search at any rate, so the winner plateaued within a
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
    const layers = network.layers.map((layer) => mutateLayer(layer, clampedRate))

    // A fresh colour and no history at all: the parent's record describes weights this
    // network does not have, and inheriting it would credit a child with races it never
    // drove.
    //
    // The id, though, follows the weights. A mutation that changed at least one parameter
    // yields a different id, which is the normal case; one that changed nothing (rate 0,
    // or a draw that missed every parameter) yields the parent's id, which is correct,
    // because it IS the parent as far as anything that compares networks can tell. That
    // is what stops exact clones from entering the archive twice.
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
 * SUPERVISED LEARNING: computes gradients without changing weights, so many examples
 * can contribute to one exact average update.
 *
 * This is backpropagation, and it is the counterpart to `mutate`: where evolution
 * searches blindly and needs a whole population and a whole generation to find out
 * whether a change helped, a gradient step knows exactly which direction each weight
 * should move — because here, unlike in the race, we have the answer. When a human
 * drives, their inputs ARE the answer, so the car's network can simply be taught them.
 *
 * Every neuron uses `tanh(sum + bias)` (see `math.ts`), whose derivative is `1 - y²`.
 * Human examples teach the brake activation towards 0 for released and 1 for pressed;
 * the binary 0.5 decision belongs to the control boundary in `car.ts`, not to training.
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

    // The weights just moved, so the identity derived from them has to move with them.
    // This is the only place parameters change outside of network construction, and
    // `trainBatch` funnels through it, so one line here covers both training paths.
    network.id = idOf(network)
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

/** Converts a network into a JSON-safe plain object, for localStorage persistence. */
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

/**
 * Reads back a stored history, keeping only the entries that are actually usable.
 *
 * Lenient where the rest of this parser is strict, and on purpose: a malformed race
 * record costs one data point out of a hundred, while rejecting the whole network over
 * it would throw away weights that took hours to evolve.
 */
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
        // Recomputed rather than read back. The stored id is still written, because it
        // makes the JSON readable by eye, but trusting it would let a hand-edited or
        // stale file carry an identity its weights do not match, and the whole point of
        // deriving it is that the two can never disagree. Since the weights were stored
        // through the same quantisation the hash uses, this reproduces the id the network
        // had when it was saved.
        id: networkId(architecture, layers),
        architecture,
        layers,
        generation: payload.generation,
        // A network saved before colours existed still drives; it just needs one.
        color: typeof payload.color === 'string' ? payload.color : randomColor(),
        history: deserializeHistory(payload.history),
    }
}
