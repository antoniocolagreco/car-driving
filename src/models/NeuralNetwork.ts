import { deepCopy, generateId, weightedAverage } from '../libs/utils'
import Layer from './Layer'

export const getRandomSimmetricalValue = () => {
    return Math.random() * 2 - 1
}

export const getRandomUnitarianValue = () => {
    return Math.random()
}

export default class NeuralNetwork {
    id = generateId()
    layers: Array<Layer>
    neurons: Array<number>
    survivedRounds: number = 0
    pointsRecord: number = 0

    // L'array che gli passiamo imposta il numero di neuroni per ogni layer
    constructor(...numberOfNeurons: Array<number>) {
        this.neurons = numberOfNeurons
        this.layers = []
        for (let i = 0; i < numberOfNeurons.length - 1; i++) {
            this.layers.push(new Layer(numberOfNeurons[i], numberOfNeurons[i + 1]))
        }
    }

    // All'inizio si passano i valori dei sensori al primo layer del network
    // Poi l'output di ogni layer diventa l'input del successivo
    static feedForward(givenInputs: Array<number>, network: NeuralNetwork) {
        let outputs = Layer.feedForward(givenInputs, network.layers[0])
        for (let i = 1; i < network.layers.length; i++) {
            outputs = Layer.feedForward(outputs, network.layers[i])
        }
        return outputs
    }

    static getMutatedNetwork(network: NeuralNetwork, amount: number) {
        const mutatedNetwork = new NeuralNetwork()
        mutatedNetwork.layers = deepCopy(network.layers)

        mutatedNetwork.layers.forEach((layer) => {
            for (let i = 0; i < layer.biases.length; i++) {
                layer.biases[i] = weightedAverage(
                    { value: layer.biases[i], weight: 1 - amount },
                    { value: getRandomSimmetricalValue(), weight: amount }
                )
            }

            for (let i = 0; i < layer.weights.length; i++) {
                for (let j = 0; j < layer.weights[i].length; j++) {
                    layer.weights[i][j] = weightedAverage(
                        { value: layer.weights[i][j], weight: 1 - amount },
                        { value: getRandomSimmetricalValue(), weight: amount }
                    )
                }
            }
        })

        return mutatedNetwork
    }

    static mergeNetworks(network1: NeuralNetwork, network2: NeuralNetwork, amount: number = 0.5) {
        const mergeNetwork = new NeuralNetwork(...network1.neurons)

        const layers: Array<Layer> = []
        for (let i = 0; i < network1.layers.length; i++) {
            const network1Layer = network1.layers[i]
            layers.push(new Layer(network1Layer.inputs.length, network1Layer.outputs.length))
        }

        for (let i = 0; i < mergeNetwork.layers.length; i++) {
            for (let j = 0; j < mergeNetwork.layers[i].biases.length; j++) {
                mergeNetwork.layers[i].biases[j] = weightedAverage(
                    { value: network1.layers[i].biases[j], weight: 1 - amount },
                    { value: network2.layers[i].biases[j], weight: amount }
                )
            }

            for (let j = 0; j < mergeNetwork.layers[i].weights.length; j++) {
                for (let k = 0; k < mergeNetwork.layers[i].weights[j].length; k++) {
                    mergeNetwork.layers[i].weights[j][k] = weightedAverage(
                        { value: network1.layers[i].weights[j][k], weight: 1 - amount },
                        { value: network2.layers[i].weights[j][k], weight: amount }
                    )
                }
            }
        }

        return mergeNetwork
    }
}
