import { normalize, normalizeToHex } from '../libs/utils'
import type Layer from './Layer'
import type NeuralNetwork from './NeuralNetwork'

export default class Visualizer {
    static drawNetworkIn(ctx: CanvasRenderingContext2D, network: NeuralNetwork) {
        const margin = Math.floor(ctx.canvas.height * 0.1)
        const heightSlice = Math.floor(ctx.canvas.height - margin * 2) / network.layers.length

        for (let index = network.layers.length - 1; index >= 0; index--) {
            const yStart = ctx.canvas.height - (index * heightSlice + margin)
            const yEnd = ctx.canvas.height - ((index + 1) * heightSlice + margin)
            const icons = index === network.layers.length - 1 ? ['↑', '↓', '←', '→', 'brake'] : []
            Visualizer.#drawLayer(ctx, network.layers[index], ctx.canvas.width, yStart, yEnd, icons)
        }
    }

    static #drawLayer(
        ctx: CanvasRenderingContext2D,
        layer: Layer,
        width: number,
        yStart: number,
        yEnd: number,
        icons: Array<string>
    ) {
        const { biases, inputs, outputs, weights } = layer

        const inputSlice = width / (inputs.length + 1)
        const outputSlice = width / (outputs.length + 1)

        const yOutput = yEnd
        const yInput = yStart

        for (let i = 0; i < inputs.length; i++) {
            for (let j = 0; j < outputs.length; j++) {
                ctx.beginPath()
                ctx.lineWidth = Math.floor(normalize(weights[i][j], -1, 1, 1, 6))

                const r = weights[i][j] < 0 ? normalizeToHex(weights[i][j], -1, 0) : '00'
                const g = weights[i][j] > 0 ? normalizeToHex(weights[i][j], 0, 1) : '00'
                // const r = normalizeToHex(-weights[i][j], -1, 1)
                // const g = normalizeToHex(weights[i][j], -1, 1)
                const b = '00'

                const alpha = normalizeToHex(inputs[i], 0, 1)
                const color = `#${r}${g}${b}${alpha}`

                ctx.strokeStyle = color
                ctx.moveTo(inputSlice * (i + 1), yInput)
                ctx.lineTo(outputSlice * (j + 1), yOutput)
                ctx.stroke()
            }
        }

        const NODE_SIZE = 15

        //inputs
        for (let index = 0; index < inputs.length; index++) {
            const x = inputSlice * (index + 1)
            ctx.beginPath()
            const r = inputs[index] < 0 ? normalizeToHex(inputs[index], -1, 0) : '00'
            const g = inputs[index] > 0 ? normalizeToHex(inputs[index], 0, 1) : '00'
            const b = '00'
            
            ctx.fillStyle = `#${r}${g}${b}`
            ctx.lineWidth = 1
            ctx.arc(x, yInput, NODE_SIZE, 0, Math.PI * 2)
            ctx.fill()

            ctx.beginPath()
            ctx.setLineDash([])
            ctx.strokeStyle = '#550'
            ctx.lineWidth = 2
            ctx.arc(x, yInput, NODE_SIZE, 0, Math.PI * 2)
            ctx.stroke()
        }

        //outputs
        for (let index = 0; index < outputs.length; index++) {
            const x = outputSlice * (index + 1)

            ctx.beginPath()
            const r = biases[index] < 0 ? normalizeToHex(biases[index], -1, 0) : '00'
            const g = biases[index] > 0 ? normalizeToHex(biases[index], 0, 1) : '00'
            const b = '00'
            ctx.fillStyle = `#${r}${g}${b}`
            ctx.lineWidth = 1
            ctx.arc(x, yOutput, NODE_SIZE, 0, Math.PI * 2)
            ctx.fill()
            ctx.beginPath()
            ctx.setLineDash([])
            ctx.strokeStyle = '#550'
            ctx.lineWidth = 2
            ctx.arc(x, yOutput, NODE_SIZE, 0, Math.PI * 2)
            ctx.stroke()

            if (outputs[index] > biases[index]) {
                ctx.beginPath()
                ctx.strokeStyle = '#ff0'
                ctx.lineWidth = 4
                ctx.arc(x, yOutput, NODE_SIZE, 0, Math.PI * 2)
                ctx.stroke()
            }

            const icon = icons[index]
            if (icon) {
                ctx.beginPath()
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillStyle = 'white'
                ctx.fillText(icon, x, yOutput - 25)
            }
        }
    }
}
