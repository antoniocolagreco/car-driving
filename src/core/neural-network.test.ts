import { describe, expect, it } from 'vitest'
import {
    type TrainingExample,
    createNetwork,
    deserializeNetwork,
    feedForward,
    mutate,
    serializeNetwork,
    trainBatch,
} from './neural-network'

const ARCHITECTURE = [8, 6, 4, 3] as const
const FLOATING_POINT_PRECISION = 15

const makeInputs = (count: number): number[] =>
    Array.from({ length: count }, (_, index) => (index % 2 === 0 ? 0.5 : -0.5))

const expectVectorToBeCloseTo = (actual: readonly number[], expected: readonly number[]): void => {
    expect(actual).toHaveLength(expected.length)
    actual.forEach((value, index) => {
        expect(value).toBeCloseTo(expected[index], FLOATING_POINT_PRECISION)
    })
}

const expectMatrixToBeCloseTo = (
    actual: readonly (readonly number[])[],
    expected: readonly (readonly number[])[],
): void => {
    expect(actual).toHaveLength(expected.length)
    actual.forEach((row, index) => {
        expectVectorToBeCloseTo(row, expected[index])
    })
}

describe('createNetwork', () => {
    it('creates one layer per architecture transition', () => {
        const network = createNetwork(ARCHITECTURE)
        expect(network.layers).toHaveLength(ARCHITECTURE.length - 1)
    })

    it('sizes each layer weight matrix as [inputCount][outputCount]', () => {
        const network = createNetwork(ARCHITECTURE)
        network.layers.forEach((layer, index) => {
            expect(layer.weights).toHaveLength(ARCHITECTURE[index])
            for (const row of layer.weights) {
                expect(row).toHaveLength(ARCHITECTURE[index + 1])
            }
        })
    })

    it('sizes each layer bias array as [outputCount]', () => {
        const network = createNetwork(ARCHITECTURE)
        network.layers.forEach((layer, index) => {
            expect(layer.biases).toHaveLength(ARCHITECTURE[index + 1])
        })
    })

    it('initializes every weight within [-1, 1]', () => {
        const network = createNetwork(ARCHITECTURE)
        for (const layer of network.layers) {
            for (const row of layer.weights) {
                for (const weight of row) {
                    expect(weight).toBeGreaterThanOrEqual(-1)
                    expect(weight).toBeLessThanOrEqual(1)
                }
            }
        }
    })

    it('initializes every bias within [-1, 1]', () => {
        const network = createNetwork(ARCHITECTURE)
        for (const layer of network.layers) {
            for (const bias of layer.biases) {
                expect(bias).toBeGreaterThanOrEqual(-1)
                expect(bias).toBeLessThanOrEqual(1)
            }
        }
    })
})

describe('feedForward', () => {
    it('returns exactly one output per output-layer neuron', () => {
        const network = createNetwork(ARCHITECTURE)
        const outputs = feedForward(network, makeInputs(ARCHITECTURE[0]))
        expect(outputs).toHaveLength(ARCHITECTURE[ARCHITECTURE.length - 1])
    })

    it('keeps the raw brake activation available for the control threshold', () => {
        const network = createNetwork([2, 3])
        const outputLayer = network.layers[0]
        outputLayer.weights = outputLayer.weights.map((row) => row.map(() => 0))
        outputLayer.biases = [0, -1, 0]

        const outputs = feedForward(network, [0, 0])

        expect(outputs[1]).toBeLessThan(0)
    })

    it('keeps every output within [-1, 1]', () => {
        const network = createNetwork(ARCHITECTURE)
        const outputs = feedForward(network, makeInputs(ARCHITECTURE[0]))
        for (const value of outputs) {
            expect(value).toBeGreaterThanOrEqual(-1)
            expect(value).toBeLessThanOrEqual(1)
        }
    })

    it('is deterministic for the same network and inputs', () => {
        const network = createNetwork(ARCHITECTURE)
        const inputs = makeInputs(ARCHITECTURE[0])
        const first = [...feedForward(network, inputs)]
        const second = [...feedForward(network, inputs)]
        expect(second).toEqual(first)
    })

    it('generally produces different outputs for different inputs', () => {
        const network = createNetwork(ARCHITECTURE)
        const outputsA = [...feedForward(network, makeInputs(ARCHITECTURE[0]))]
        const outputsB = [
            ...feedForward(
                network,
                makeInputs(ARCHITECTURE[0]).map((value) => -value),
            ),
        ]
        expect(outputsB).not.toEqual(outputsA)
    })

    it('caches the last inputs on the first layer for the visualizer', () => {
        const network = createNetwork(ARCHITECTURE)
        const inputs = makeInputs(ARCHITECTURE[0])
        feedForward(network, inputs)
        expect(network.layers[0].inputs).toEqual(inputs)
    })

    it('caches the last outputs on the last layer for the visualizer', () => {
        const network = createNetwork(ARCHITECTURE)
        const inputs = makeInputs(ARCHITECTURE[0])
        const outputs = feedForward(network, inputs)
        const lastLayer = network.layers[network.layers.length - 1]
        expect(lastLayer.outputs).toEqual(outputs)
    })
})

describe('trainBatch', () => {
    const examples: readonly TrainingExample[] = [
        { inputs: [0.8, -0.2, 0.1], targets: [1, 0, -1] },
        { inputs: [-0.4, 0.9, -0.6], targets: [-1, 1, 1] },
        { inputs: [0.2, 0.3, 0.7], targets: [0.5, 0, 0] },
    ]

    const totalError = (
        network: ReturnType<typeof createNetwork>,
        dataset: readonly TrainingExample[],
    ): number =>
        dataset.reduce((total, example) => {
            const outputs = feedForward(network, example.inputs)
            return (
                total +
                example.targets.reduce(
                    (sum, target, index) => sum + (target - outputs[index]) ** 2,
                    0,
                )
            )
        }, 0)

    it('reduces the total error across all examples', () => {
        const network = createNetwork([3, 6, 3])
        const before = totalError(network, examples)

        for (let epoch = 0; epoch < 200; epoch++) {
            trainBatch(network, examples, 0.05)
        }

        expect(totalError(network, examples)).toBeLessThan(before)
    })

    it('can learn braking from an initially negative internal activation', () => {
        const network = createNetwork([2, 3])
        const outputLayer = network.layers[0]
        outputLayer.weights = outputLayer.weights.map((row) => row.map(() => 0))
        outputLayer.biases = [0, -1, 0]

        expect(feedForward(network, [0, 0])[1]).toBeLessThan(0)
        for (let step = 0; step < 40; step++) {
            trainBatch(network, [{ inputs: [0, 0], targets: [0, 1, 0] }], 0.1)
        }

        expect(feedForward(network, [0, 0])[1]).toBeGreaterThan(0.5)
    })

    it('keeps every weight and bias inside [-1, 1], the range mutation works in', () => {
        const network = createNetwork([2, 3, 3])

        for (let step = 0; step < 500; step++) {
            trainBatch(network, [{ inputs: [1, 1], targets: [1, 0, 1] }], 0.5)
        }

        for (const layer of network.layers) {
            for (const row of layer.weights) {
                for (const weight of row) {
                    expect(Math.abs(weight)).toBeLessThanOrEqual(1)
                }
            }
            for (const bias of layer.biases) {
                expect(Math.abs(bias)).toBeLessThanOrEqual(1)
            }
        }
    })

    it('produces the same update regardless of example order', () => {
        const source = createNetwork([3, 6, 3])
        const forwardOrder = mutate(source, 0)
        const reverseOrder = mutate(source, 0)

        trainBatch(forwardOrder, examples, 0.05)
        trainBatch(reverseOrder, [...examples].reverse(), 0.05)

        reverseOrder.layers.forEach((layer, index) => {
            const expectedLayer = forwardOrder.layers[index]
            expectMatrixToBeCloseTo(layer.weights, expectedLayer.weights)
            expectVectorToBeCloseTo(layer.biases, expectedLayer.biases)
        })
    })
})

describe('mutate', () => {
    it('reproduces the source weights exactly at rate 0', () => {
        const network = createNetwork(ARCHITECTURE)
        const clone = mutate(network, 0)
        clone.layers.forEach((layer, layerIndex) => {
            expect(layer.weights).toEqual(network.layers[layerIndex].weights)
        })
    })

    it('reproduces the source biases exactly at rate 0', () => {
        const network = createNetwork(ARCHITECTURE)
        const clone = mutate(network, 0)
        clone.layers.forEach((layer, layerIndex) => {
            expect(layer.biases).toEqual(network.layers[layerIndex].biases)
        })
    })

    it('keeps every weight within [-1, 1] at rate 1', () => {
        const network = createNetwork(ARCHITECTURE)
        const mutated = mutate(network, 1)
        for (const layer of mutated.layers) {
            for (const row of layer.weights) {
                for (const weight of row) {
                    expect(weight).toBeGreaterThanOrEqual(-1)
                    expect(weight).toBeLessThanOrEqual(1)
                }
            }
        }
    })

    it('produces statistically different weights at rate 1', () => {
        const network = createNetwork(ARCHITECTURE)
        const mutated = mutate(network, 1)
        expect(mutated.layers[0].weights).not.toEqual(network.layers[0].weights)
    })

    it('does not mutate the source network', () => {
        const network = createNetwork(ARCHITECTURE)
        const weightsBefore = network.layers.map((layer) => layer.weights.map((row) => [...row]))
        const biasesBefore = network.layers.map((layer) => [...layer.biases])

        mutate(network, 1)

        network.layers.forEach((layer, layerIndex) => {
            expect(layer.weights).toEqual(weightsBefore[layerIndex])
            expect(layer.biases).toEqual(biasesBefore[layerIndex])
        })
    })

    it('does not share array references with the source network', () => {
        const network = createNetwork(ARCHITECTURE)
        const mutated = mutate(network, 0)

        mutated.layers[0].weights[0][0] = 999
        mutated.layers[0].biases[0] = 999

        expect(network.layers[0].weights[0][0]).not.toBe(999)
        expect(network.layers[0].biases[0]).not.toBe(999)
    })
})

describe('serializeNetwork / deserializeNetwork', () => {
    it('round-trips id, architecture and generation', () => {
        const network = { ...createNetwork(ARCHITECTURE), generation: 7 }
        const restored = deserializeNetwork(serializeNetwork(network))

        expect(restored?.id).toBe(network.id)
        expect(restored?.architecture).toEqual(network.architecture)
        expect(restored?.generation).toBe(network.generation)
    })

    it('still loads a network saved before the score field was dropped', () => {
        const saved = {
            ...serializeNetwork(createNetwork(ARCHITECTURE)),
            bestFitness: 42.5,
        }

        expect(deserializeNetwork(saved)).toBeDefined()
    })

    it('round-trips every weight', () => {
        const network = createNetwork(ARCHITECTURE)
        const restored = deserializeNetwork(serializeNetwork(network))

        expect(restored?.layers.map((layer) => layer.weights)).toEqual(
            network.layers.map((layer) => layer.weights),
        )
    })

    it('round-trips every bias', () => {
        const network = createNetwork(ARCHITECTURE)
        const restored = deserializeNetwork(serializeNetwork(network))

        expect(restored?.layers.map((layer) => layer.biases)).toEqual(
            network.layers.map((layer) => layer.biases),
        )
    })

    it('rejects a payload from the old seven-zone format', () => {
        const network = createNetwork(ARCHITECTURE)
        const payload = { ...serializeNetwork(network), version: 3 }
        expect(deserializeNetwork(payload)).toBeUndefined()
    })

    it('rejects a v7 payload from the removed temporal-input format', () => {
        const network = createNetwork(ARCHITECTURE)
        const payload = { ...serializeNetwork(network), version: 7 }

        expect(deserializeNetwork(payload)).toBeUndefined()
    })

    it('rejects a string payload', () => {
        expect(deserializeNetwork('not a network')).toBeUndefined()
    })

    it('rejects a null payload', () => {
        expect(deserializeNetwork(null)).toBeUndefined()
    })

    it('rejects a number payload', () => {
        expect(deserializeNetwork(42)).toBeUndefined()
    })

    it('rejects a payload whose layer dimensions contradict its architecture', () => {
        const network = createNetwork(ARCHITECTURE)
        const payload = serializeNetwork(network)
        const corrupted = {
            ...payload,
            layers: payload.layers.map((layer, index) =>
                index === 0 ? { ...layer, weights: [...layer.weights, [0, 0, 0, 0, 0, 0]] } : layer,
            ),
        }

        expect(deserializeNetwork(corrupted)).toBeUndefined()
    })
})
