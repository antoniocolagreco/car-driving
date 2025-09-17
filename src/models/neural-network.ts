import { generateId, weightedAverage } from '../libs/utils'
import Layer from './layer'

export const getRandomSimmetricalValue = () => {
    return Math.random() * 2 - 1
}

export const getRandomUnitarianValue = () => {
    return Math.random()
}

export default class NeuralNetwork {
    private id = generateId()
    private layers: Array<Layer>
    private neurons: Array<number>
    private survivedRounds: number = 0
    private pointsRecord: number = 0

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
        const mutatedNetwork = new NeuralNetwork(...network.neurons)

        // Ricrea correttamente le istanze di Layer invece di usare deepCopy
        mutatedNetwork.layers = []
        for (let i = 0; i < network.layers.length; i++) {
            const originalLayer = network.layers[i]
            const newLayer = new Layer(
                originalLayer.getInputs().length,
                originalLayer.getOutputs().length,
            )

            // Copia i pesi dall'originale
            for (let j = 0; j < originalLayer.getWeights().length; j++) {
                for (let k = 0; k < originalLayer.getWeights()[j].length; k++) {
                    newLayer.setWeightAt(j, k, originalLayer.getWeightAt(j, k))
                }
            }

            // Copia i bias dall'originale
            for (let j = 0; j < originalLayer.getBiases().length; j++) {
                newLayer.setBiasAt(j, originalLayer.getBiasAt(j))
            }

            mutatedNetwork.layers.push(newLayer)
        }

        mutatedNetwork.layers.forEach((layer) => {
            for (let i = 0; i < layer.getBiases().length; i++) {
                // Disabilito i bias per il momento
                // layer.biases[i] = weightedAverage(
                //     { value: layer.biases[i], weight: 1 - amount },
                //     { value: getRandomSimmetricalValue(), weight: amount }
                // )
                layer.setBiasAt(i, 0)
            }

            for (let i = 0; i < layer.getWeights().length; i++) {
                for (let j = 0; j < layer.getWeights()[i].length; j++) {
                    layer.setWeightAt(
                        i,
                        j,
                        weightedAverage(
                            { value: layer.getWeightAt(i, j), weight: 1 - amount },
                            { value: getRandomSimmetricalValue(), weight: amount },
                        ),
                    )
                }
            }
        })

        return mutatedNetwork
    }

    static mergeNetworks(network1: NeuralNetwork, network2: NeuralNetwork, amount: number = 0.5) {
        const mergeNetwork = new NeuralNetwork(...network1.neurons)

        const layers: Array<Layer> = []
        for (let i = 0; i < network1.getLayers().length; i++) {
            const network1Layer = network1.getLayerAt(i)
            layers.push(
                new Layer(network1Layer.getInputs().length, network1Layer.getOutputs().length),
            )
        }

        for (let i = 0; i < mergeNetwork.getLayers().length; i++) {
            for (let j = 0; j < mergeNetwork.getLayerAt(i).getBiases().length; j++) {
                mergeNetwork
                    .getLayerAt(i)
                    .setBiasAt(
                        j,
                        weightedAverage(
                            { value: network1.getLayerAt(i).getBiasAt(j), weight: 1 - amount },
                            { value: network2.getLayerAt(i).getBiasAt(j), weight: amount },
                        ),
                    )
            }

            for (let j = 0; j < mergeNetwork.getLayerAt(i).getWeights().length; j++) {
                for (let k = 0; k < mergeNetwork.getLayerAt(i).getWeights()[j].length; k++) {
                    const weight1 = network1.getLayerAt(i).getWeightAt(j, k)
                    const weight2 = network2.getLayerAt(i).getWeightAt(j, k)
                    const averageWeight = weightedAverage(
                        { value: weight1, weight: 1 - amount },
                        { value: weight2, weight: amount },
                    )
                    mergeNetwork.getLayerAt(i).setWeightAt(j, k, averageWeight)
                }
            }
        }

        return mergeNetwork
    }

    getId(): string {
        return this.id
    }

    getLayers(): Array<Layer> {
        return [...this.layers] // Return a copy to prevent external mutation
    }

    getLayerAt(index: number): Layer {
        return this.layers[index]
    }

    getNeuron(): Array<number> {
        return [...this.neurons]
    }

    getNeuronAt(index: number): number {
        return this.neurons[index]
    }

    getSurvivedRounds(): number {
        return this.survivedRounds
    }

    getPointsRecord(): number {
        return this.pointsRecord
    }

    setSurvivedRounds(value: number) {
        this.survivedRounds = value
    }

    setPointsRecord(value: number) {
        this.pointsRecord = value
    }

    // Serialization/Deserialization methods
    static fromJSON(jsonData: {
        id: string
        neurons: number[]
        survivedRounds: number
        pointsRecord: number
        layers: Array<{
            inputs: number[]
            outputs: number[]
            biases: number[]
            weights: number[][]
        }>
    }): NeuralNetwork {
        const network = new NeuralNetwork(...jsonData.neurons)
        network.id = jsonData.id
        network.survivedRounds = jsonData.survivedRounds
        network.pointsRecord = jsonData.pointsRecord

        // Ricostruisci i layer correttamente
        network.layers = []
        for (let i = 0; i < jsonData.layers.length; i++) {
            const layerData = jsonData.layers[i]
            const layer = new Layer(layerData.inputs.length, layerData.outputs.length)

            // Ripristina pesi e bias
            for (let j = 0; j < layerData.weights.length; j++) {
                for (let k = 0; k < layerData.weights[j].length; k++) {
                    layer.setWeightAt(j, k, layerData.weights[j][k])
                }
            }

            for (let j = 0; j < layerData.biases.length; j++) {
                layer.setBiasAt(j, layerData.biases[j])
            }

            network.layers.push(layer)
        }

        return network
    }

    toJSON(): {
        id: string
        neurons: number[]
        survivedRounds: number
        pointsRecord: number
        layers: Array<{
            inputs: readonly number[]
            outputs: readonly number[]
            biases: readonly number[]
            weights: readonly (readonly number[])[]
        }>
    } {
        return {
            id: this.id,
            neurons: this.neurons,
            survivedRounds: this.survivedRounds,
            pointsRecord: this.pointsRecord,
            layers: this.layers.map((layer) => ({
                inputs: layer.getInputs(),
                outputs: layer.getOutputs(),
                biases: layer.getBiases(),
                weights: layer.getWeights(),
            })),
        }
    }
}
