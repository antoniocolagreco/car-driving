import type Layer from './Layer'
import type NeuralNetwork from './NeuralNetwork'

const MARGIN = 50
const NODE_RADIUS = 18

export default class Visualizer {
    static drawNetworkIn(ctx: CanvasRenderingContext2D, network: NeuralNetwork) {
        const width = ctx.canvas.width * 2
        const height = ctx.canvas.height * 2

        Visualizer.#drawLayerIn(ctx, network.layers[0], MARGIN, MARGIN, width, height)
    }

    static #drawLayerIn(
        ctx: CanvasRenderingContext2D,
        layer: Layer,
        left: number,
        top: number,
        width: number,
        height: number
    ) {
        const right = left + width
        const bottom = top + height

        for (let index = 0; index < layer.inputs.length; index++) {
            const x = left + (width / layer.inputs.length) * index
            ctx.beginPath()
            ctx.strokeStyle = 'white'
            ctx.lineWidth = 1
            ctx.arc(x, bottom, NODE_RADIUS, 0, Math.PI * 2)
            ctx.stroke()
        }
    }
}
