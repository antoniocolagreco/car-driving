import { getRandomSimmetricalValue } from './neural-network'

export default class Layer {
    /**
     * Questo array rappresenta gli input della rete neurale.
     * Ogni elemento dell'array corrisponde a un neurone di input.
     * Un input può essere il valore di un sensore, il colore di un pixel etc.
     * Una immagine 32px*32px avrà 1024 (inputs) neuroni ad esempio.
     */
    private inputs: Array<number>
    /**
     * Questo array rappresenta gli output previsti dalla rete neurale.
     * Ogni elemento dell'array corrisponde a un neurone di output.
     * Gli output sono i risultati prodotti dalla rete neurale in base agli input forniti.
     * Scegliamo noi l'output, ad esempio, in una rete neurale di regressione,
     * il layer di output potrebbe avere un solo neurone con una funzione di attivazione lineare
     */
    private outputs: Array<number>
    /*
     * Gli array dei bias contengono i valori di bias per ogni neurone nella rete neurale.
     * Il bias è un termine costante aggiunto all'input di ogni neurone prima dell'applicazione della funzione di attivazione.
     * I bias permettono alla rete di imparare e adattarsi meglio ai dati di input.
     * Un bias è una specie di offset per regolare meglio l'attivazione del neurone.
     * E' una straslazione sull'ordinata
     */
    private biases: Array<number>
    /*
     * La matrice dei pesi rappresenta i pesi delle connessioni tra i neuroni.
     * L'elemento weights[i][j] rappresenta il peso della connessione tra il neurone di input i e il neurone di output j.
     * I pesi sono i parametri che la rete neurale apprende durante il processo di addestramento.
     * Essi determinano l'importanza di ciascuna connessione nella trasmissione dell'informazione attraverso la rete.
     * Durante il calcolo dell'output, vengono usati per fare la somma ponderata.
     */
    private weights: Array<Array<number>>
    /*
     * NOTA
     * Durante il processo di addestramento di una rete neurale, i valori di bias possono cambiare.
     * Nella fase di addestramento, la rete neurale cerca di apprendere i pesi delle connessioni
     * e i valori dei bias che ottimizzano la capacità della rete di fare previsioni accurate sui dati di input.
     *
     * Durante ogni iterazione dell'algoritmo di addestramento (solitamente chiamata Epoch),
     * la rete neurale valuta le sue previsioni rispetto ai risultati desiderati
     * e aggiorna i pesi e i bias in modo da ridurre l'errore di previsione. Questo processo è noto come Error Backpropagation.
     *
     * In sintesi, i valori dei bias vengono adattati e modificati durante l'addestramento
     * al fine di migliorare le prestazioni della rete neurale nel compito specifico per cui è stata progettata.

     */

    constructor(inputNeurons: number, outputNeurons: number) {
        this.inputs = new Array(inputNeurons)
        this.outputs = new Array(outputNeurons)
        this.biases = new Array(outputNeurons)
        this.weights = new Array()

        for (let i = 0; i < inputNeurons; i++) {
            this.weights[i] = new Array(outputNeurons)
        }

        Layer.#randomize(this)
    }

    static #randomize(layer: Layer) {
        for (let i = 0; i < layer.inputs.length; i++) {
            for (let j = 0; j < layer.outputs.length; j++) {
                layer.weights[i][j] = getRandomSimmetricalValue()
            }
        }

        for (let i = 0; i < layer.biases.length; i++) {
            layer.biases[i] = getRandomSimmetricalValue()
        }
    }

    static feedForward = (givenInputs: Array<number>, layer: Layer) => {
        /**
         * "givenInputs" sono i dati in ingresso, dei sensori all'inizio, e l'output dei layers precedenti dopo.
         *  */

        for (let i = 0; i < layer.inputs.length; i++) {
            layer.inputs[i] = givenInputs[i]
        }

        /**
         * Calcoliamo i valori di output moltiplicando i valori di input, con i pesi
         *  */
        // i itera gl output
        for (let i = 0; i < layer.outputs.length; i++) {
            let sum = 0
            // j itera gli inputs
            for (let j = 0; j < layer.inputs.length; j++) {
                //facciamo una somma ponderata moltiplicando tutti gli input per il peso della connessione con l'output w * s.
                //Ripetiamo per ogni input
                sum += layer.inputs[j] * layer.weights[j][i]
            }

            //se la somma è superiore al bias, l'output (il neurone) si attiva.
            //Questa funzione di attivazione del neurone si chiama hyperbolic tangent.
            // Ci sono tanti tipi di funzioni di attivazione:
            // sigmoid, hyperbolic tangent, ReLU etc

            // layer.outputs[i] = tanh(sum, layer.biases[i])
            layer.outputs[i] = Math.tanh(sum + layer.biases[i])
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
    setInputs(inputs: Array<number>): void {
        this.inputs = [...inputs]
    }

    setOutputs(outputs: Array<number>): void {
        this.outputs = [...outputs]
    }

    setBiases(biases: Array<number>): void {
        this.biases = [...biases]
    }

    setWeights(weights: Array<Array<number>>): void {
        this.weights = weights.map((row) => [...row])
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

    setBiasAt(index: number, value: number): void {
        if (index >= 0 && index < this.biases.length) {
            this.biases[index] = value
        }
    }

    setWeightAt(inputIndex: number, outputIndex: number, value: number): void {
        if (
            inputIndex >= 0 &&
            inputIndex < this.weights.length &&
            outputIndex >= 0 &&
            outputIndex < this.weights[inputIndex].length
        ) {
            this.weights[inputIndex][outputIndex] = value
        }
    }
}
