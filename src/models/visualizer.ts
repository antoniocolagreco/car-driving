import { normalize, normalizeToHex } from '../libs/utils'
import type Layer from './layer'
import type NeuralNetwork from './neural-network'

/**
 * Visualizza graficamente una rete neurale su canvas 2D
 * Ogni layer è disegnato come neuroni (cerchi) connessi da linee (pesi)
 * I colori rappresentano i valori: rosso per negativi, verde per positivi
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

            Visualizer.#drawLayerRails(
                ctx,
                network.getLayers()[index],
                ctx.canvas.width,
                yStart,
                yEnd,
            )
            // Solo l'ultimo layer (output) ha le icone frecce per indicare le azioni (su, giù, sinistra, destra)
            const icons = index === network.getLayers().length - 1 ? ['↑', '↓', '←', '→'] : []
            Visualizer.#drawLayer(
                ctx,
                network.getLayers()[index],
                ctx.canvas.width,
                yStart,
                yEnd,
                icons,
            )
        }
    }

    static #drawLayerRails(
        ctx: CanvasRenderingContext2D,
        layer: Layer,
        width: number,
        yStart: number,
        yEnd: number,
    ) {
        const inputs = layer.getInputs()
        const outputs = layer.getOutputs()

        const inputSlice = width / (inputs.length + 1)
        const outputSlice = width / (outputs.length + 1)

        const yOutput = yEnd
        const yInput = yStart

        for (let i = 0; i < inputs.length; i++) {
            for (let j = 0; j < outputs.length; j++) {
                ctx.beginPath()
                ctx.lineWidth = 2
                ctx.strokeStyle = '#111'
                ctx.moveTo(inputSlice * (i + 1), yInput)
                ctx.lineTo(outputSlice * (j + 1), yOutput)
                ctx.stroke()
            }
        }
    }

    /**
     * Disegna un singolo layer della rete neurale
     * @param ctx - Contesto 2D del canvas
     * @param layer - Layer da disegnare (contiene neuroni input/output, pesi e bias)
     * @param width - Larghezza totale disponibile del canvas
     * @param yStart - Coordinata Y dove iniziare a disegnare i neuroni di input
     * @param yEnd - Coordinata Y dove disegnare i neuroni di output
     * @param icons - Array di icone da mostrare sui neuroni di output (es. frecce direzionali)
     */
    static #drawLayer(
        ctx: CanvasRenderingContext2D,
        layer: Layer,
        width: number,
        yStart: number,
        yEnd: number,
        icons: Array<string>,
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
        for (let i = 0; i < inputs.length; i++) {
            for (let j = 0; j < outputs.length; j++) {
                ctx.beginPath()
                // Spessore della linea proporzionale al valore assoluto del peso
                // Pesi più forti = linee più spesse (da 1 a 6 pixel)
                ctx.lineWidth = Math.floor(normalize(weights[i][j], -1, 1, 1, 6))

                // Colore della connessione basato sul segno del peso:
                // Pesi negativi = rosso, pesi positivi = verde
                const r =
                    weights[i][j] < 0 ? normalizeToHex(Math.max(15, weights[i][j]), -1, 0) : '00'
                const g =
                    weights[i][j] > 0 ? normalizeToHex(Math.max(15, weights[i][j]), 0, 1) : '00'
                // const r = normalizeToHex(-weights[i][j], -1, 1)  // Versione alternativa commentata
                // const g = normalizeToHex(weights[i][j], -1, 1)   // Versione alternativa commentata
                const b = '00' // Blu sempre a zero

                // Trasparenza (alpha) basata sull'attivazione del neurone di input
                // Neuroni più attivi = linee più opache
                const alpha = normalizeToHex(inputs[i], 0, 1)
                const color = `#${r}${g}${b}${alpha}`

                // Disegna la linea di connessione dal neurone input al neurone output
                ctx.strokeStyle = color
                ctx.moveTo(inputSlice * (i + 1), yInput)
                ctx.lineTo(outputSlice * (j + 1), yOutput)
                ctx.stroke()
            }
        }

        const NODE_SIZE = 15 // Raggio dei neuroni in pixel

        // FASE 2: Disegna i neuroni di INPUT (cerchi nella parte alta del layer)
        for (let index = 0; index < inputs.length; index++) {
            const x = inputSlice * (index + 1) // Posizione X del neurone

            // Cerchio interno colorato in base al valore di attivazione
            ctx.beginPath()
            // Colore: rosso per valori negativi, verde per valori positivi
            const r = inputs[index] < 0 ? normalizeToHex(inputs[index], -1, 0) : '00'
            const g = inputs[index] > 0 ? normalizeToHex(inputs[index], 0, 1) : '00'
            const b = '00'

            ctx.fillStyle = `#${r}${g}${b}`
            ctx.lineWidth = 1
            ctx.arc(x, yInput, NODE_SIZE, 0, Math.PI * 2)
            ctx.fill()

            // Contorno esterno del neurone (sempre giallo scuro)
            ctx.beginPath()
            ctx.setLineDash([]) // Linea continua
            ctx.strokeStyle = '#550' // Giallo scuro
            ctx.lineWidth = 2
            ctx.arc(x, yInput, NODE_SIZE, 0, Math.PI * 2)
            ctx.stroke()
        }

        // FASE 3: Disegna i neuroni di OUTPUT (cerchi nella parte bassa del layer)
        for (let index = 0; index < outputs.length; index++) {
            const x = outputSlice * (index + 1) // Posizione X del neurone

            // Cerchio interno colorato in base al valore del bias
            ctx.beginPath()
            // Colore del bias: rosso per valori negativi, verde per valori positivi
            const r = biases[index] < 0 ? normalizeToHex(biases[index], -1, 0) : '00'
            const g = biases[index] > 0 ? normalizeToHex(biases[index], 0, 1) : '00'
            const b = '00'
            ctx.fillStyle = `#${r}${g}${b}`
            ctx.lineWidth = 1
            ctx.arc(x, yOutput, NODE_SIZE, 0, Math.PI * 2)
            ctx.fill()

            // Contorno esterno standard (sempre giallo scuro)
            ctx.beginPath()
            ctx.setLineDash([])
            ctx.strokeStyle = '#550' // Giallo scuro
            ctx.lineWidth = 2
            ctx.arc(x, yOutput, NODE_SIZE, 0, Math.PI * 2)
            ctx.stroke()

            // Se il neurone di output è attivo (valore > 0), aggiungi un anello giallo brillante
            // Questo indica quale azione la rete sta "decidendo" di fare
            if (outputs[index] > 0) {
                ctx.beginPath()
                ctx.strokeStyle = '#ff0' // Giallo brillante
                ctx.lineWidth = 4
                ctx.arc(x, yOutput, NODE_SIZE, 0, Math.PI * 2)
                ctx.stroke()
            }

            // Disegna l'icona sopra il neurone (solo per il layer di output)
            // Le icone rappresentano le azioni: ↑ (accelera), ↓ (frena), ← (sinistra), → (destra)
            const icon = icons[index]
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
