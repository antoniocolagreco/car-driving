import { normalize, toHex, toHexDualColorRange } from '@core/math'
import type { Layer, Network } from '@core/neural-network'

/**
 * Visualizes a neural network on a 2D canvas: every layer is drawn as neurons
 * (circles) connected by lines (weights). Colours encode value: red for
 * negative, green for positive. A connection's opacity encodes how much it
 * actually mattered this frame, not just how strong the weight is.
 *
 * Reads `Layer.inputs`/`outputs`, the caches `feedForward` populates on its
 * way through the network — this module never runs the network itself, it
 * only shows the result of the last time something else did.
 */

/** Labels drawn above the three output neurons, in throttle/brake/steering order. */
const OUTPUT_LABELS = ['Throttle', 'Brake', 'Steering'] as const

/** Radius of a neuron circle, in px. */
const NODE_SIZE = 15

/**
 * Draws the whole network: one row of neurons per layer, output layer at the
 * bottom. Layers are drawn from last to first because the bottom (output) row
 * is the one that carries the throttle/brake/steering labels.
 */
export const drawNetwork = (ctx: CanvasRenderingContext2D, network: Network): void => {
    const width = ctx.canvas.clientWidth
    const height = ctx.canvas.clientHeight

    // 10% margin top and bottom so neurons never touch the canvas edge.
    const margin = Math.floor(height * 0.1)
    const heightSlice = Math.floor(height - margin * 2) / network.layers.length

    for (let index = network.layers.length - 1; index >= 0; index--) {
        const yStart = height - (index * heightSlice + margin)
        const yEnd = height - ((index + 1) * heightSlice + margin)
        const isFirstLayer = index === 0
        const labels = index === network.layers.length - 1 ? OUTPUT_LABELS : []

        drawLayer(ctx, network.layers[index], width, yStart, yEnd, isFirstLayer, labels)
    }
}

/**
 * Draws one layer: its connections, then its input neurons (only for the
 * first layer) and its output neurons.
 */
const drawLayer = (
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    width: number,
    yStart: number,
    yEnd: number,
    isFirstLayer: boolean,
    labels: readonly string[],
): void => {
    const { biases, inputs, outputs, weights } = layer

    // Horizontal spacing that spreads neurons evenly, +1 so none sits on the edge.
    const inputSlice = width / (inputs.length + 1)
    const outputSlice = width / (outputs.length + 1)

    const yInput = yStart
    const yOutput = yEnd

    // PHASE 1: draw every connection (line) between an input and an output
    // neuron. Each line is one weight of the network:
    //   - thickness = |weight| (1 to 6 px): stronger weights draw thicker lines.
    //   - colour = sign of the weight: green excitatory, red inhibitory.
    //   - alpha = |input x weight|: the actual contribution to the output this
    //     frame, so a transparent line means "this connection exists but isn't
    //     carrying any signal right now", not "this weight is small".
    for (let i = 0; i < inputs.length; i++) {
        for (let j = 0; j < outputs.length; j++) {
            ctx.beginPath()
            ctx.lineWidth = Math.floor(normalize(weights[i][j], -1, 1, 1, 6))

            let weightColor = '#0000'
            const contribution = Math.abs(inputs[i] * weights[i][j])
            const weightAlpha = toHex(contribution, 0, 1)
            if (weights[i][j] > 0) {
                weightColor = `#00ff00${weightAlpha}`
            } else if (weights[i][j] < 0) {
                weightColor = `#ff0000${weightAlpha}`
            }

            ctx.strokeStyle = weightColor
            ctx.setLineDash([])
            ctx.moveTo(inputSlice * (i + 1), yInput)
            ctx.lineTo(outputSlice * (j + 1), yOutput)
            ctx.stroke()
        }
    }

    // PHASE 2: input neurons, only drawn for the first layer (every other
    // layer's inputs are the previous layer's outputs, already drawn as
    // that layer's output row). Fill colour is a red/black/green gradient
    // over the activation value, [-1, 1].
    if (isFirstLayer) {
        for (let index = 0; index < inputs.length; index++) {
            const x = inputSlice * (index + 1)

            ctx.beginPath()
            ctx.fillStyle = toHexDualColorRange(inputs[index], -1, 1)
            ctx.lineWidth = 1
            ctx.arc(x, yInput, NODE_SIZE, 0, Math.PI * 2)
            ctx.fill()

            // Yellow outline, purely for visibility against the line clutter.
            ctx.beginPath()
            ctx.setLineDash([])
            ctx.strokeStyle = '#ff0'
            ctx.lineWidth = 4
            ctx.arc(x, yInput, NODE_SIZE, 0, Math.PI * 2)
            ctx.stroke()
        }
    }

    // PHASE 3: output neurons. Fill colour is the same red/black/green
    // gradient, this time over the output value. The ring around each neuron
    // is the "bias ring": yellow when the neuron is active (its output beats
    // its own bias), otherwise green or red depending on the sign of the
    // bias itself — a lazy (high-bias) neuron reads red-ringed even at rest.
    for (let index = 0; index < outputs.length; index++) {
        const x = outputSlice * (index + 1)

        ctx.beginPath()
        ctx.fillStyle = toHexDualColorRange(outputs[index], -1, 1)
        ctx.lineWidth = 1
        ctx.arc(x, yOutput, NODE_SIZE, 0, Math.PI * 2)
        ctx.fill()

        const isNeuronActive = outputs[index] > biases[index]
        let biasColor = '#000'
        let ringWidth = 2

        if (isNeuronActive) {
            biasColor = '#FF0'
            ringWidth = 4
        } else if (biases[index] > 0) {
            biasColor = '#0F0'
        } else if (biases[index] < 0) {
            biasColor = '#F00'
        }

        // A fresh path for the bias ring, so it never blends into the fill.
        ctx.beginPath()
        ctx.strokeStyle = biasColor
        ctx.lineWidth = ringWidth
        ctx.setLineDash([])
        ctx.arc(x, yOutput, NODE_SIZE, 0, Math.PI * 2)
        ctx.stroke()

        const label = labels[index]
        if (label) {
            ctx.beginPath()
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillStyle = 'white'
            ctx.fillText(label, x, yOutput - 25)
        }
    }
}
