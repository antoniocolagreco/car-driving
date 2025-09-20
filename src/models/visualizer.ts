import { normalize, toHex, toHexDualColorRange, toHexTripleColorRange } from '../libs/utils'
import type Layer from './layer'
import type NeuralNetwork from './neural-network'

/**
 * Visualizza graficamente una rete neurale su canvas 2D
 * Ogni layer è disegnato come neuroni (cerchi) connessi da linee (pesi)
 * I colori rappresentano i valori: rosso per negativi, verde per positivi
 * L'opacità delle linee indica l'influenza reale sul neurone di destinazione
 */
export default class Visualizer {
    /**
     * Disegna l'intera rete neurale sul canvas dato
     * @param ctx - Contesto 2D del canvas dove disegnare
     * @param network - Rete neurale da visualizzare
     */
    static drawNetworkIn(ctx: CanvasRenderingContext2D, network: NeuralNetwork) {
        // Margine del 10% dell'altezza canvas per evitare che i neuroni tocchino i bordi
        const margin = Math.floor(ctx.canvas.height * 0.1)
        // Dividi lo spazio verticale disponibile tra tutti i layer
        const heightSlice = Math.floor(ctx.canvas.height - margin * 2) / network.getLayers().length

        // Disegna i layer dall'ultimo al primo (dal basso verso l'alto)
        // Questo perché l'ultimo layer (output) va in basso con le frecce direzionali
        for (let index = network.getLayers().length - 1; index >= 0; index--) {
            // Calcola posizione Y di inizio e fine per questo layer
            const yStart = ctx.canvas.height - (index * heightSlice + margin)
            const yEnd = ctx.canvas.height - ((index + 1) * heightSlice + margin)
            const isFirstLayer = index === 0

            const icons =
                index === network.getLayers().length - 1 ? ['Acceleratore', 'Freno', 'Sterzo'] : []
            Visualizer.drawLayer(
                ctx,
                network.getLayers()[index],
                ctx.canvas.width,
                yStart,
                yEnd,
                isFirstLayer,
                icons,
            )
        }
    }

    /**
     * Disegna un singolo layer della rete neurale
     * @param ctx - Contesto 2D del canvas
     * @param layer - Layer da disegnare (contiene neuroni input/output, pesi e bias)
     * @param width - Larghezza totale disponibile del canvas
     * @param yStart - Coordinata Y dove iniziare a disegnare i neuroni di input
     * @param yEnd - Coordinata Y dove disegnare i neuroni di output
     * @param labels - Array di icone da mostrare sui neuroni di output (es. frecce direzionali)
     */
    private static drawLayer(
        ctx: CanvasRenderingContext2D,
        layer: Layer,
        width: number,
        yStart: number,
        yEnd: number,
        isFirstLayer: boolean = false,
        labels: Array<string>,
    ) {
        const biases = layer.getBiases()
        const inputs = layer.getInputs()
        const outputs = layer.getOutputs()
        const weights = layer.getWeights()

        // Calcola la spaziatura orizzontale per distribuire uniformemente i neuroni
        const inputSlice = width / (inputs.length + 1) // +1 per evitare neuroni sui bordi
        const outputSlice = width / (outputs.length + 1)

        // Posizioni Y fisse per input (in alto) e output (in basso) del layer
        const yOutput = yEnd
        const yInput = yStart

        // FASE 1: Disegna tutte le connessioni (linee) tra neuroni input e output
        // Ogni linea rappresenta un peso della rete neurale
        // Spessore = |peso|, colore = segno del peso, opacità = |input × peso|
        for (let i = 0; i < inputs.length; i++) {
            for (let j = 0; j < outputs.length; j++) {
                ctx.beginPath()
                // Spessore della linea proporzionale al valore assoluto del peso
                // Pesi più forti = linee più spesse (da 1 a 6 pixel)

                ctx.lineWidth = Math.floor(normalize(weights[i][j], -1, 1, 1, 6))

                let weightColor = '#0000'
                // Opacità della linea proporzionale al contributo reale sull'output: |input * peso|
                // Linee trasparenti quando non influenzano, opache quando contribuiscono molto
                const contribution = Math.abs(inputs[i] * weights[i][j])
                const weightAlpha = toHex(contribution, 0, 1)
                if (weights[i][j] > 0) {
                    weightColor = `#00ff00${weightAlpha}` // Verde per pesi positivi
                } else if (weights[i][j] < 0) {
                    weightColor = `#ff0000${weightAlpha}` // Rosso per pesi negativi
                }
                // Disegna la linea di connessione dal neurone input al neurone output
                ctx.strokeStyle = weightColor
                ctx.setLineDash([])
                ctx.moveTo(inputSlice * (i + 1), yInput)
                ctx.lineTo(outputSlice * (j + 1), yOutput)
                ctx.stroke()
            }
        }

        const NODE_SIZE = 15 // Raggio dei neuroni in pixel

        // FASE 2: Disegna i neuroni di INPUT se è il primo layer (cerchi nella parte alta del layer)
        // Colore: gradiente rosso→nero→verde basato sul valore di attivazione [-1, 1]
        if (isFirstLayer) {
            for (let index = 0; index < inputs.length; index++) {
                const x = inputSlice * (index + 1) // Posizione X del neurone

                // Cerchio interno colorato in base al valore di attivazione
                ctx.beginPath()

                // Gradiente smooth: rosso per valori negativi, nero per zero, verde per positivi
                const inputNeuronColor = toHexDualColorRange(inputs[index], -1, 1)

                ctx.fillStyle = inputNeuronColor
                ctx.lineWidth = 1
                ctx.arc(x, yInput, NODE_SIZE, 0, Math.PI * 2)
                ctx.fill()

                // Contorno esterno del neurone (bordo giallo per visibilità)
                ctx.beginPath()
                ctx.setLineDash([])
                ctx.strokeStyle = '#ff0'
                ctx.lineWidth = 4
                ctx.arc(x, yInput, NODE_SIZE, 0, Math.PI * 2)
                ctx.stroke()
            }
        }

        // FASE 3: Disegna i neuroni di OUTPUT (cerchi nella parte bassa del layer)
        // Colore del riempimento: gradiente basato sul valore di output del neurone
        // Anello del bias: indica se il neurone è attivo (output > bias)
        for (let index = 0; index < outputs.length; index++) {
            const x = outputSlice * (index + 1) // Posizione X del neurone

            // Cerchio interno colorato in base al valore di output del neurone
            ctx.beginPath()

            // Usa il valore di output (non input) per il gradiente rosso→nero→verde
            const outputNeuronColor = toHexDualColorRange(outputs[index], -1, 1)

            ctx.fillStyle = outputNeuronColor
            ctx.lineWidth = 1
            ctx.arc(x, yOutput, NODE_SIZE, 0, Math.PI * 2)
            ctx.fill()

            // Un neurone è attivo solo se il suo output supera il bias
            const isNeuronActive = outputs[index] > biases[index]
            let biasColor = '#000'
            let outputRingWidth = 2

            if (isNeuronActive) {
                biasColor = '#FF0' // Giallo quando attivo
                outputRingWidth = 4
            } else {
                // Quando non attivo, colore basato sul segno del bias
                if (biases[index] > 0) {
                    biasColor = '#0F0' // Verde per bias positivi
                } else if (biases[index] < 0) {
                    biasColor = '#F00' // Rosso per bias negativi
                }
            }

            // Nuovo path per l'anello del bias per evitare artefatti con il riempimento
            ctx.beginPath()
            ctx.strokeStyle = biasColor
            ctx.lineWidth = outputRingWidth
            ctx.setLineDash([])
            ctx.arc(x, yOutput, NODE_SIZE, 0, Math.PI * 2)
            ctx.stroke()

            // Disegna l'icona sopra il neurone (solo per il layer di output finale)
            // Le icone rappresentano le azioni del veicolo: Acceleratore, Freno, Sterzo
            const icon = labels[index]
            if (icon) {
                ctx.beginPath()
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillStyle = 'white'
                ctx.fillText(icon, x, yOutput - 25) // Posiziona l'icona 25px sopra il neurone
            }
        }
    }
}
