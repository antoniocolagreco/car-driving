import { tanh } from '@libs/utils'
import { getRandomSymmetricValue } from './neural-network'

export default class Layer {
    /**
     * Questo array rappresenta gli input della rete neurale.
     * Ogni elemento dell'array corrisponde a un neurone di input.
     * Un input può essere il valore di un sensore, il colore di un pixel etc.
     * Una immagine 32px*32px avrà 1024 (inputs) neuroni ad esempio.
     */
    private inputs: Array<number>
    /**
     * Questo array rappresenta gli output che la rete neurale produce.
     * Ogni elemento dell'array corrisponde a un neurone di output.
     * Gli output sono i risultati che otteniamo dopo aver elaborato gli input.
     * Ad esempio, per la nostra auto: accelerazione, sterzo e freno.
     * In una rete per riconoscere immagini potrebbe essere: "gatto" o "cane".
     */
    private outputs: Array<number>
    /*
     * I bias sono come degli "interruttori" per i neuroni.
     * Immaginali come la soglia di sensibilità di ogni neurone.
     *
     * Con bias alto: il neurone è "pigro" e si attiva difficilmente
     * Con bias basso: il neurone è "nervoso" e si attiva facilmente
     *
     * Ad esempio: se il bias del neurone "sterzo a sinistra" è alto,
     * l'auto avrà bisogno di stimoli molto forti per girare a sinistra.
     *
     * I bias permettono alla rete di essere più flessibile e precisa.
     * È come regolare la sensibilità dei comandi dell'auto.
     */
    private biases: Array<number>
    /*
     * I pesi sono come dei "fili" che collegano i neuroni tra loro.
     * Ogni filo ha una "forza" diversa (il peso).
     *
     * Peso alto (es. 0.8): connessione forte, influenza molto la decisione
     * Peso basso (es. 0.1): connessione debole, influenza poco la decisione
     * Peso negativo (es. -0.5): connessione che "inibisce" o riduce l'attivazione
     *
     * Ad esempio: se il sensore frontale (ostacolo davanti) ha peso alto
     * verso il neurone "freno", l'auto frenerà quando vede ostacoli.
     *
     * I pesi determinano come l'informazione viaggia nella rete.
     * È come decidere quali sensori ascoltare di più per ogni azione.
     */
    private weights: Array<Array<number>>
    /*
     * COME IMPARA LA NOSTRA RETE NEURALE
     *
     * Pensa alla rete neurale come a una "ricetta" per guidare l'auto.
     * I bias e i pesi sono gli "ingredienti" di questa ricetta.
     *
     * IL NOSTRO METODO (Algoritmi Genetici):
     * - Facciamo nascere 50 auto con ricette casuali
     * - Vediamo quale guida meglio (sopravvive di più)
     * - Prendiamo la ricetta migliore e la modifichiamo un po' (mutazione)
     * - Creiamo 50 nuove auto con questa ricetta migliorata
     * - Ripetiamo fino a quando non guidano perfettamente!
     *
     * È come l'evoluzione in natura: solo i più forti sopravvivono e si riproducono.
     *
     * METODO ALTERNATIVO (Backpropagation):
     * - Mostriamo alla rete esempi di guida corretta
     * - La rete capisce i suoi errori e si auto-corregge
     * - È più veloce ma ha bisogno di un "maestro" che insegni
     *
     * Nel nostro caso non abbiamo un maestro, quindi usiamo l'evoluzione!
     */

    constructor(inputNeuronCount: number, outputNeuronCount: number) {
        this.inputs = new Array(inputNeuronCount)
        this.outputs = new Array(outputNeuronCount)
        this.biases = new Array(outputNeuronCount)
        this.weights = new Array()

        for (let inputIndex = 0; inputIndex < inputNeuronCount; inputIndex++) {
            this.weights[inputIndex] = new Array(outputNeuronCount)
        }

        Layer.randomize(this)
    }

    private static randomize(layer: Layer) {
        for (let inputIndex = 0; inputIndex < layer.inputs.length; inputIndex++) {
            for (let outputIndex = 0; outputIndex < layer.outputs.length; outputIndex++) {
                layer.weights[inputIndex][outputIndex] = getRandomSymmetricValue()
            }
        }

        for (let biasIndex = 0; biasIndex < layer.biases.length; biasIndex++) {
            layer.biases[biasIndex] = getRandomSymmetricValue()
        }
    }

    static feedForward = (inputValues: Array<number>, layer: Layer) => {
        /**
         * "inputValues" sono i dati in ingresso: valori dei sensori all'inizio,
         * oppure output dei layer precedenti nelle fasi successive.
         */

        for (let inputIndex = 0; inputIndex < layer.inputs.length; inputIndex++) {
            layer.inputs[inputIndex] = inputValues[inputIndex]
        }

        /**
         * Calcoliamo i valori di output: per ogni neurone di output,
         * facciamo la somma pesata di tutti gli input.
         */
        // outputIndex scorre tutti i neuroni di output
        for (let outputIndex = 0; outputIndex < layer.outputs.length; outputIndex++) {
            let weightedSum = 0
            // inputIndex scorre tutti gli input per questo neurone
            for (let inputIndex = 0; inputIndex < layer.inputs.length; inputIndex++) {
                // Moltiplichiamo ogni input per il suo peso e sommiamo tutto
                // È come decidere quanto "ascoltare" ogni sensore
                weightedSum += layer.inputs[inputIndex] * layer.weights[inputIndex][outputIndex]
            }

            // Applichiamo la funzione di attivazione (tanh)
            // Se la somma supera il bias, il neurone si "accende"
            // Per controlli analogici, usiamo tanh con scaling migliorato
            const activationOutput = tanh(weightedSum, layer.biases[outputIndex], 1.2)
            layer.outputs[outputIndex] = Math.max(-1, Math.min(1, activationOutput)) // Manteniamo il range [-1, +1]
        }
        return layer.outputs
    }

    // Getters
    getInputs(): ReadonlyArray<number> {
        return this.inputs
    }

    getInputAt(index: number): number {
        return this.inputs[index]
    }

    getOutputs(): ReadonlyArray<number> {
        return this.outputs
    }

    getOutputAt(index: number): number {
        return this.outputs[index]
    }

    getBiases(): ReadonlyArray<number> {
        return this.biases
    }

    getBiasAt(index: number): number {
        return this.biases[index]
    }

    getWeights(): ReadonlyArray<ReadonlyArray<number>> {
        return this.weights
    }

    getWeightAt(inputIndex: number, outputIndex: number): number {
        return this.weights[inputIndex][outputIndex]
    }

    // Setters
    setInputs(inputValues: Array<number>): void {
        this.inputs = [...inputValues]
    }

    setOutputs(outputValues: Array<number>): void {
        this.outputs = [...outputValues]
    }

    setBiases(biasValues: Array<number>): void {
        this.biases = [...biasValues]
    }

    setWeights(weightMatrix: Array<Array<number>>): void {
        this.weights = weightMatrix.map((row) => [...row])
    }

    setInputAt(index: number, value: number): void {
        if (index >= 0 && index < this.inputs.length) {
            this.inputs[index] = value
        }
    }

    setOutputAt(index: number, value: number): void {
        if (index >= 0 && index < this.outputs.length) {
            this.outputs[index] = value
        }
    }

    setBiasAt(index: number, biasValue: number): void {
        if (index >= 0 && index < this.biases.length) {
            this.biases[index] = biasValue
        }
    }

    setWeightAt(inputIndex: number, outputIndex: number, weightValue: number): void {
        if (
            inputIndex >= 0 &&
            inputIndex < this.weights.length &&
            outputIndex >= 0 &&
            outputIndex < this.weights[inputIndex].length
        ) {
            this.weights[inputIndex][outputIndex] = weightValue
        }
    }
}
