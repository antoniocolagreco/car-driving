import { generateId, weightedAverage } from '../libs/utils'
import Layer from './layer'

export const getRandomSymmetricValue = () => {
    return Math.random() * 2 - 1
}

export const getRandomUniformValue = () => {
    return Math.random()
}

export default class NeuralNetwork {
    private id = generateId()
    private layers: Array<Layer>
    private architecture: ReadonlyArray<number>
    private survivedRounds: number = 0
    private bestScore: number = 0

    // L'array che gli passiamo imposta il numero di neuroni per ogni layer
    constructor(...neuronCount: Array<number>) {
        this.architecture = neuronCount
        this.layers = []
        for (let layerIndex = 0; layerIndex < neuronCount.length - 1; layerIndex++) {
            this.layers.push(new Layer(neuronCount[layerIndex], neuronCount[layerIndex + 1]))
        }
    }

    // All'inizio si passano i valori dei sensori al primo layer del network
    // Poi l'output di ogni layer diventa l'input del successivo
    static feedForward(inputValues: Array<number>, network: NeuralNetwork) {
        let outputs = Layer.feedForward(inputValues, network.layers[0])
        for (let layerIndex = 1; layerIndex < network.layers.length; layerIndex++) {
            outputs = Layer.feedForward(outputs, network.layers[layerIndex])
        }
        return outputs
    }

    static getMutatedNetwork(seedNetwork: NeuralNetwork, mutationRate: number) {
        const mutatedNetwork = new NeuralNetwork(...seedNetwork.architecture)

        // Ricrea correttamente le istanze di Layer invece di usare deepCopy
        mutatedNetwork.layers = []
        for (let layerIndex = 0; layerIndex < seedNetwork.layers.length; layerIndex++) {
            const originalLayer = seedNetwork.layers[layerIndex]
            const newLayer = new Layer(
                originalLayer.getInputs().length,
                originalLayer.getOutputs().length,
            )

            // Copia i pesi dall'originale
            for (let inputIndex = 0; inputIndex < originalLayer.getWeights().length; inputIndex++) {
                for (
                    let outputIndex = 0;
                    outputIndex < originalLayer.getWeights()[inputIndex].length;
                    outputIndex++
                ) {
                    newLayer.setWeightAt(
                        inputIndex,
                        outputIndex,
                        originalLayer.getWeightAt(inputIndex, outputIndex),
                    )
                }
            }

            // Copia i bias dall'originale
            for (let biasIndex = 0; biasIndex < originalLayer.getBiases().length; biasIndex++) {
                newLayer.setBiasAt(biasIndex, originalLayer.getBiasAt(biasIndex))
            }

            mutatedNetwork.layers.push(newLayer)
        }

        mutatedNetwork.layers.forEach((layer) => {
            for (let biasIndex = 0; biasIndex < layer.getBiases().length; biasIndex++) {
                // Disabilito i bias per il momento
                layer.setBiasAt(
                    biasIndex,
                    weightedAverage(
                        { value: layer.getBiasAt(biasIndex), weight: 1 - mutationRate },
                        { value: getRandomSymmetricValue(), weight: mutationRate },
                    ),
                )
            }

            for (let inputIndex = 0; inputIndex < layer.getWeights().length; inputIndex++) {
                for (
                    let outputIndex = 0;
                    outputIndex < layer.getWeights()[inputIndex].length;
                    outputIndex++
                ) {
                    layer.setWeightAt(
                        inputIndex,
                        outputIndex,
                        weightedAverage(
                            {
                                value: layer.getWeightAt(inputIndex, outputIndex),
                                weight: 1 - mutationRate,
                            },
                            { value: getRandomSymmetricValue(), weight: mutationRate },
                        ),
                    )
                }
            }
        })

        return mutatedNetwork
    }

    static mixNetworks(network1: NeuralNetwork, network2: NeuralNetwork, mixRatio: number = 0.5) {
        const mergeNetwork = new NeuralNetwork(...network1.architecture)

        const layers: Array<Layer> = []
        for (let layerIndex = 0; layerIndex < network1.getLayers().length; layerIndex++) {
            const network1Layer = network1.getLayerAt(layerIndex)
            layers.push(
                new Layer(network1Layer.getInputs().length, network1Layer.getOutputs().length),
            )
        }

        for (let layerIndex = 0; layerIndex < mergeNetwork.getLayers().length; layerIndex++) {
            for (
                let biasIndex = 0;
                biasIndex < mergeNetwork.getLayerAt(layerIndex).getBiases().length;
                biasIndex++
            ) {
                mergeNetwork.getLayerAt(layerIndex).setBiasAt(
                    biasIndex,
                    weightedAverage(
                        {
                            value: network1.getLayerAt(layerIndex).getBiasAt(biasIndex),
                            weight: 1 - mixRatio,
                        },
                        {
                            value: network2.getLayerAt(layerIndex).getBiasAt(biasIndex),
                            weight: mixRatio,
                        },
                    ),
                )
            }

            for (
                let inputIndex = 0;
                inputIndex < mergeNetwork.getLayerAt(layerIndex).getWeights().length;
                inputIndex++
            ) {
                for (
                    let outputIndex = 0;
                    outputIndex <
                    mergeNetwork.getLayerAt(layerIndex).getWeights()[inputIndex].length;
                    outputIndex++
                ) {
                    const weight1 = network1
                        .getLayerAt(layerIndex)
                        .getWeightAt(inputIndex, outputIndex)
                    const weight2 = network2
                        .getLayerAt(layerIndex)
                        .getWeightAt(inputIndex, outputIndex)
                    const averageWeight = weightedAverage(
                        { value: weight1, weight: 1 - mixRatio },
                        { value: weight2, weight: mixRatio },
                    )
                    mergeNetwork
                        .getLayerAt(layerIndex)
                        .setWeightAt(inputIndex, outputIndex, averageWeight)
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

    getArchitecture(): ReadonlyArray<number> {
        return [...this.architecture]
    }

    getLayerSize(index: number): number {
        return this.architecture[index]
    }

    getSurvivedRounds(): number {
        return this.survivedRounds
    }

    getBestScore(): number {
        return this.bestScore
    }

    getFormattedBestScore(): string {
        return Math.floor(this.bestScore).toString()
    }

    setSurvivedRounds(value: number) {
        this.survivedRounds = value
    }

    setPointsRecord(value: number) {
        this.bestScore = value
    }

    // Aggiorna il record dei punti solo se il nuovo valore è maggiore
    // Ritorna true se il record è stato aggiornato, altrimenti false
    updatePointsRecordIfBetter(newPoints: number): boolean {
        if (newPoints > this.bestScore) {
            this.bestScore = newPoints
            return true
        }
        return false
    }

    // Serialization/Deserialization methods
    static fromJSON(jsonData: {
        id: string
        architecture: ReadonlyArray<number>
        survivedRounds: number
        pointsRecord: number
        layers: Array<{
            inputs: number[]
            outputs: number[]
            biases: number[]
            weights: number[][]
        }>
    }): NeuralNetwork {
        const network = new NeuralNetwork(...jsonData.architecture)
        network.id = jsonData.id
        network.survivedRounds = jsonData.survivedRounds
        network.bestScore = jsonData.pointsRecord

        // Ricostruisci i layer correttamente
        network.layers = []
        for (let layerIndex = 0; layerIndex < jsonData.layers.length; layerIndex++) {
            const layerData = jsonData.layers[layerIndex]
            const layer = new Layer(layerData.inputs.length, layerData.outputs.length)

            // Ripristina pesi e bias
            for (let inputIndex = 0; inputIndex < layerData.weights.length; inputIndex++) {
                for (
                    let outputIndex = 0;
                    outputIndex < layerData.weights[inputIndex].length;
                    outputIndex++
                ) {
                    layer.setWeightAt(
                        inputIndex,
                        outputIndex,
                        layerData.weights[inputIndex][outputIndex],
                    )
                }
            }

            for (let biasIndex = 0; biasIndex < layerData.biases.length; biasIndex++) {
                layer.setBiasAt(biasIndex, layerData.biases[biasIndex])
            }

            network.layers.push(layer)
        }

        return network
    }

    toJSON(): {
        id: string
        architecture: ReadonlyArray<number>
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
            architecture: this.architecture,
            survivedRounds: this.survivedRounds,
            pointsRecord: this.bestScore,
            layers: this.layers.map((layer) => ({
                inputs: layer.getInputs(),
                outputs: layer.getOutputs(),
                biases: layer.getBiases(),
                weights: layer.getWeights(),
            })),
        }
    }
}
