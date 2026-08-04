import { describe, expect, it, vi } from 'vitest'
import { createNetwork } from '@core/neural-network'
import { SENSOR_ZONE_ORDER } from '@core/sensor'
import { drawNetwork } from './network'

type NetworkContextStub = CanvasRenderingContext2D & {
    arc: ReturnType<typeof vi.fn>
    beginPath: ReturnType<typeof vi.fn>
    fill: ReturnType<typeof vi.fn>
    fillText: ReturnType<typeof vi.fn>
    lineTo: ReturnType<typeof vi.fn>
    moveTo: ReturnType<typeof vi.fn>
    setLineDash: ReturnType<typeof vi.fn>
    stroke: ReturnType<typeof vi.fn>
}

const createContext = (): NetworkContextStub =>
    ({
        canvas: { clientWidth: 700, clientHeight: 600 },
        arc: vi.fn(),
        beginPath: vi.fn(),
        fill: vi.fn(),
        fillText: vi.fn(),
        lineTo: vi.fn(),
        moveTo: vi.fn(),
        setLineDash: vi.fn(),
        stroke: vi.fn(),
    }) as unknown as NetworkContextStub

describe('drawNetwork', () => {
    it('places the input labels below the first network row', () => {
        const context: NetworkContextStub = createContext()
        const inputCount: number = SENSOR_ZONE_ORDER.length + 1
        const network = createNetwork([inputCount, 3])

        drawNetwork(context, network)

        for (const call of context.fillText.mock.calls.slice(0, inputCount)) {
            expect(call[2]).toBeGreaterThan(600 / 2)
        }
    })
})
