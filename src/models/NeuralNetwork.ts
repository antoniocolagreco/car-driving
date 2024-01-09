import Layer from './Layer'

export default class NeuralNetwork {
    layers: Array<Layer>

    // L'array che gli passiamo imposta il numero di neuroni per ogni layer
    constructor(...numberOfNeurons: Array<number>) {
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
}
