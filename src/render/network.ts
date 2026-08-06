import { normalize, toHex, toHexDualColorRange } from '@core/math'
import type { Layer, Network } from '@core/neural-network'
import { SENSOR_ZONE, SENSOR_ZONE_ORDER, type SensorZoneId } from '@core/sensor'

/** Draws cached network activations; color encodes sign and connection alpha encodes contribution. */

const OUTPUT_LABELS = ['Throttle', 'Brake', 'Steering'] as const

const SENSOR_INPUT_LABELS: Readonly<Record<SensorZoneId, string>> = {
    [SENSOR_ZONE.LEFT_SIDE]: 'LEFT',
    [SENSOR_ZONE.LEFT_LATERAL]: 'L90',
    [SENSOR_ZONE.LEFT_OUTER]: 'L45',
    [SENSOR_ZONE.LEFT_MIDDLE]: 'L30',
    [SENSOR_ZONE.LEFT_INNER]: 'L15',
    [SENSOR_ZONE.FRONT]: 'FRONT',
    [SENSOR_ZONE.RIGHT_INNER]: 'R15',
    [SENSOR_ZONE.RIGHT_MIDDLE]: 'R30',
    [SENSOR_ZONE.RIGHT_OUTER]: 'R45',
    [SENSOR_ZONE.RIGHT_LATERAL]: 'R90',
    [SENSOR_ZONE.RIGHT_SIDE]: 'RIGHT',
}
const INPUT_LABELS: readonly string[] = [
    ...SENSOR_ZONE_ORDER.map((zone: SensorZoneId): string => SENSOR_INPUT_LABELS[zone]),
    'SPEED',
]

const NODE_SIZE = 15

/** Draws one neuron row per layer with outputs at the bottom. */
export const drawNetwork = (ctx: CanvasRenderingContext2D, network: Network): void => {
    const width = ctx.canvas.clientWidth
    const height = ctx.canvas.clientHeight

    const margin = Math.floor(height * 0.1)
    const heightSlice = Math.floor(height - margin * 2) / network.layers.length

    for (let index = network.layers.length - 1; index >= 0; index--) {
        const yStart = height - (index * heightSlice + margin)
        const yEnd = height - ((index + 1) * heightSlice + margin)
        const isFirstLayer = index === 0
        const outputLabels: readonly string[] =
            index === network.layers.length - 1 ? OUTPUT_LABELS : []
        const inputLabels: readonly string[] = isFirstLayer ? INPUT_LABELS : []

        drawLayer(
            ctx,
            network.layers[index],
            width,
            yStart,
            yEnd,
            isFirstLayer,
            inputLabels,
            outputLabels,
        )
    }
}

const drawLayer = (
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    width: number,
    yStart: number,
    yEnd: number,
    isFirstLayer: boolean,
    inputLabels: readonly string[],
    outputLabels: readonly string[],
): void => {
    const { biases, inputs, outputs, weights } = layer

    const inputSlice = width / (inputs.length + 1)
    const outputSlice = width / (outputs.length + 1)

    const yInput = yStart
    const yOutput = yEnd

    // Connection width encodes weight magnitude; alpha encodes `|input * weight|`.
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

    // Only the first layer needs a separate input row.
    if (isFirstLayer) {
        for (let index = 0; index < inputs.length; index++) {
            const x = inputSlice * (index + 1)

            ctx.beginPath()
            ctx.fillStyle = toHexDualColorRange(inputs[index], -1, 1)
            ctx.lineWidth = 1
            ctx.arc(x, yInput, NODE_SIZE, 0, Math.PI * 2)
            ctx.fill()

            ctx.beginPath()
            ctx.setLineDash([])
            ctx.strokeStyle = '#ff0'
            ctx.lineWidth = 4
            ctx.arc(x, yInput, NODE_SIZE, 0, Math.PI * 2)
            ctx.stroke()

            const label: string | undefined = inputLabels[index]
            if (label) {
                ctx.beginPath()
                ctx.font = '9px monospace'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'top'
                ctx.fillStyle = 'white'
                ctx.fillText(label, x, yInput + NODE_SIZE + 7)
            }
        }
    }

    // Bias rings are yellow when active and otherwise encode the bias sign.
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

        ctx.beginPath()
        ctx.strokeStyle = biasColor
        ctx.lineWidth = ringWidth
        ctx.setLineDash([])
        ctx.arc(x, yOutput, NODE_SIZE, 0, Math.PI * 2)
        ctx.stroke()

        const label: string | undefined = outputLabels[index]
        if (label) {
            ctx.beginPath()
            ctx.font = '10px monospace'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillStyle = 'white'
            ctx.fillText(label, x, yOutput - 25)
        }
    }
}
