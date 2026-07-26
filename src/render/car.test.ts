import { describe, expect, it, vi } from 'vitest'
import { RACING_CAR_SPEC, createCar } from '@core/car'
import { SENSOR_ZONE, type SensorState } from '@core/sensor'
import { drawCar, drawSensors } from './car'

type DrawingContextStub = CanvasRenderingContext2D & {
    beginPath: ReturnType<typeof vi.fn>
    closePath: ReturnType<typeof vi.fn>
    fill: ReturnType<typeof vi.fn>
    lineTo: ReturnType<typeof vi.fn>
    moveTo: ReturnType<typeof vi.fn>
    restore: ReturnType<typeof vi.fn>
    save: ReturnType<typeof vi.fn>
    setLineDash: ReturnType<typeof vi.fn>
    stroke: ReturnType<typeof vi.fn>
    arc: ReturnType<typeof vi.fn>
}

const createContext = (): DrawingContextStub =>
    ({
        beginPath: vi.fn(), closePath: vi.fn(), fill: vi.fn(), lineTo: vi.fn(), moveTo: vi.fn(),
        restore: vi.fn(), save: vi.fn(), setLineDash: vi.fn(), stroke: vi.fn(), arc: vi.fn(),
        fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1,
    }) as unknown as DrawingContextStub

describe('drawSensors', () => {
    it('draws each area once, truncating the front at its closest transverse contact', () => {
        const context: DrawingContextStub = createContext()
        const sensor: SensorState = {
            origin: { x: 0, y: 0 },
            readings: [0.5],
            zones: [{
                id: SENSOR_ZONE.FRONT,
                area: [{ x: -20, y: 0 }, { x: 20, y: 0 }, { x: 20, y: -700 }, { x: -20, y: -700 }],
                range: 700,
                distance: 140,
                closestHit: { point: { x: 5, y: -140 }, distance: 140 },
                reading: 0.8,
            }],
        }

        drawSensors(context, sensor)

        expect(context.moveTo).toHaveBeenCalledWith(-20, 0)
        expect(context.lineTo).toHaveBeenNthCalledWith(1, 20, 0)
        expect(context.lineTo).toHaveBeenNthCalledWith(2, 20, -140)
        expect(context.lineTo).toHaveBeenNthCalledWith(3, -20, -140)
        expect(context.arc).toHaveBeenCalledWith(5, -140, 3, 0, Math.PI * 2)
        expect(context.fillStyle).toBe('#facc15')
        expect(context.stroke).not.toHaveBeenCalled()
    })

    it('does nothing for no perception zones', () => {
        const context: DrawingContextStub = createContext()
        drawSensors(context, { origin: { x: 0, y: 0 }, zones: [], readings: [] })
        expect(context.save).not.toHaveBeenCalled()
    })

    it('truncates an extended side area perpendicular to the car body', () => {
        const context: DrawingContextStub = createContext()
        const sensor: SensorState = {
            origin: { x: 0, y: -35 },
            readings: [0.75],
            zones: [{
                id: SENSOR_ZONE.LEFT_SIDE,
                area: [
                    { x: -20, y: -35 },
                    { x: -20, y: 35 },
                    { x: -720, y: 35 },
                    { x: -720, y: -35 },
                ],
                range: 700,
                distance: 140,
                closestHit: { point: { x: -160, y: 0 }, distance: 140 },
                reading: 0.8,
            }],
        }

        drawSensors(context, sensor)

        expect(context.moveTo).toHaveBeenCalledWith(-20, -35)
        expect(context.lineTo).toHaveBeenNthCalledWith(1, -20, 35)
        expect(context.lineTo).toHaveBeenNthCalledWith(2, -160, 35)
        expect(context.lineTo).toHaveBeenNthCalledWith(3, -160, -35)
        expect(context.stroke).not.toHaveBeenCalled()
    })
})

describe('drawCar', () => {
    it('can override the body colour without mutating the car', () => {
        const context: DrawingContextStub = createContext()
        const car = createCar({ x: 0, y: 0 }, RACING_CAR_SPEC, 'orange')

        drawCar(context, car, { color: '#38bdf8' })

        expect(context.fillStyle).toBe('#38bdf8')
        expect(car.color).toBe('orange')
    })

    it('draws no running or brake lights after a car has crashed', () => {
        const context: DrawingContextStub = createContext()
        const car = createCar({ x: 0, y: 0 }, RACING_CAR_SPEC, 'red')
        car.controls.brake = 1
        car.crashed = true

        drawCar(context, car)

        expect(context.fillStyle).toBe('#5f5f5f')
        expect(context.stroke).not.toHaveBeenCalled()
    })

    it('keeps running and brake lights active on a living braking car', () => {
        const context: DrawingContextStub = createContext()
        const car = createCar({ x: 0, y: 0 }, RACING_CAR_SPEC, 'red')
        car.controls.brake = 1

        drawCar(context, car)

        expect(context.stroke).toHaveBeenCalledTimes(4)
    })
})
