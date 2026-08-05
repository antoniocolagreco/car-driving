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
        beginPath: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        lineTo: vi.fn(),
        moveTo: vi.fn(),
        restore: vi.fn(),
        save: vi.fn(),
        setLineDash: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn(),
        fillStyle: '',
        strokeStyle: '',
        globalAlpha: 1,
        lineWidth: 1,
    }) as unknown as DrawingContextStub

describe('drawSensors', () => {
    it('draws a lone collision marker without filling its sensor area', () => {
        const context: DrawingContextStub = createContext()
        const sensor: SensorState = {
            origin: { x: 0, y: 0 },
            readings: [0.5],
            zones: [
                {
                    id: SENSOR_ZONE.FRONT,
                    area: [
                        { x: -20, y: 0 },
                        { x: 20, y: 0 },
                        { x: 20, y: -700 },
                        { x: -20, y: -700 },
                    ],
                    range: 700,
                    distance: 140,
                    closestHit: { point: { x: 5, y: -140 }, distance: 140 },
                    reading: 0.8,
                },
            ],
        }

        drawSensors(context, sensor)

        expect(context.arc).toHaveBeenCalledWith(5, -140, 3, 0, Math.PI * 2)
        expect(context.fillStyle).toBe('#ef4444')
        expect(context.stroke).not.toHaveBeenCalled()
        expect(context.closePath).not.toHaveBeenCalled()
    })

    it('does nothing for no perception zones', () => {
        const context: DrawingContextStub = createContext()
        drawSensors(context, { origin: { x: 0, y: 0 }, zones: [], readings: [] })
        expect(context.save).not.toHaveBeenCalled()
    })

    it('connects collision points from left to right without outlining sensor areas', () => {
        const context: DrawingContextStub = createContext()
        const points = [
            { x: -100, y: -120 },
            { x: 0, y: -180 },
            { x: 90, y: -130 },
        ] as const
        const sensor: SensorState = {
            origin: { x: 0, y: 0 },
            readings: [0.8, 0.7, 0.8],
            zones: [SENSOR_ZONE.LEFT_INNER, SENSOR_ZONE.RIGHT_INNER, SENSOR_ZONE.RIGHT_MIDDLE].map(
                (id, index) => ({
                    id,
                    area: [
                        { x: 0, y: 0 },
                        { x: -150 + index * 100, y: -700 },
                        { x: -50 + index * 100, y: -700 },
                    ],
                    range: 700,
                    distance: 140,
                    closestHit: { point: points[index], distance: 140 },
                    reading: 0.8,
                }),
            ),
        }

        drawSensors(context, sensor)

        expect(context.moveTo).toHaveBeenCalledWith(points[0].x, points[0].y)
        expect(context.lineTo).toHaveBeenCalledWith(points[1].x, points[1].y)
        expect(context.lineTo).toHaveBeenCalledWith(points[2].x, points[2].y)
        expect(context.strokeStyle).toBe('#facc15')
        expect(context.lineWidth).toBe(2)
        expect(context.setLineDash).toHaveBeenCalledWith([])
        expect(context.closePath).toHaveBeenCalledTimes(1)
        expect(context.stroke).toHaveBeenCalledTimes(1)
        expect(context.stroke.mock.invocationCallOrder[0]).toBeLessThan(
            context.arc.mock.invocationCallOrder[0],
        )
    })

    it('places green markers at the midpoint of clear zones outer edges', () => {
        const context: DrawingContextStub = createContext()
        const sensor: SensorState = {
            origin: { x: 0, y: 0 },
            readings: [0, 0, 0],
            zones: [
                {
                    id: SENSOR_ZONE.LEFT_INNER,
                    area: [
                        { x: 0, y: 0 },
                        { x: -100, y: -700 },
                        { x: 0, y: -700 },
                    ],
                    range: 700,
                    distance: Infinity,
                    closestHit: null,
                    reading: 0,
                },
                {
                    id: SENSOR_ZONE.FRONT,
                    area: [
                        { x: -21, y: 0 },
                        { x: 21, y: 0 },
                        { x: 21, y: -700 },
                        { x: -21, y: -700 },
                    ],
                    range: 700,
                    distance: Infinity,
                    closestHit: null,
                    reading: 0,
                },
                {
                    id: SENSOR_ZONE.RIGHT_INNER,
                    area: [
                        { x: 0, y: 0 },
                        { x: 0, y: -700 },
                        { x: 100, y: -700 },
                    ],
                    range: 700,
                    distance: Infinity,
                    closestHit: null,
                    reading: 0,
                },
            ],
        }

        drawSensors(context, sensor)

        expect(context.arc).toHaveBeenCalledWith(-50, -700, 3, 0, Math.PI * 2)
        expect(context.arc).toHaveBeenCalledWith(0, -700, 3, 0, Math.PI * 2)
        expect(context.arc).toHaveBeenCalledWith(50, -700, 3, 0, Math.PI * 2)
        expect(context.fillStyle).toBe('#22c55e')
        expect(context.stroke).toHaveBeenCalledTimes(1)
    })

    it('cuts every zone back to what it ran into, in zones mode', () => {
        const context: DrawingContextStub = createContext()
        const strokeColors: string[] = []
        context.stroke.mockImplementation(() => {
            strokeColors.push(String(context.strokeStyle))
        })
        const sensor: SensorState = {
            origin: { x: 0, y: 0 },
            readings: [0, 0.8],
            zones: [
                {
                    id: SENSOR_ZONE.LEFT_INNER,
                    area: [
                        { x: 0, y: 0 },
                        { x: -100, y: -700 },
                        { x: 0, y: -700 },
                    ],
                    range: 700,
                    distance: Infinity,
                    closestHit: null,
                    reading: 0,
                },
                {
                    id: SENSOR_ZONE.FRONT,
                    area: [
                        { x: -21, y: 0 },
                        { x: 21, y: 0 },
                        { x: 21, y: -700 },
                        { x: -21, y: -700 },
                    ],
                    range: 700,
                    distance: 140,
                    closestHit: { point: { x: 5, y: -140 }, distance: 140 },
                    reading: 0.8,
                },
            ],
        }

        drawSensors(context, sensor, 'zones')

        // Each area is traced from its own first vertex, rather than through the markers.
        expect(context.moveTo).toHaveBeenCalledWith(0, 0)
        expect(context.moveTo).toHaveBeenCalledWith(-21, 0)
        // The clear triangle keeps its full 700 px; the front rectangle stops at the
        // obstacle 140 px away instead of running on behind it.
        expect(context.lineTo).toHaveBeenCalledWith(-100, -700)
        expect(context.lineTo).toHaveBeenCalledWith(21, -140)
        expect(context.lineTo).toHaveBeenCalledWith(-21, -140)
        expect(context.lineTo).not.toHaveBeenCalledWith(21, -700)
        // Free space is yellow in both views; red is reserved for the contact marker.
        expect(strokeColors).toEqual(['#facc15', '#facc15'])
        expect(context.arc).toHaveBeenCalledWith(5, -140, 3, 0, Math.PI * 2)
    })

    it('draws nothing at all when the radar is off', () => {
        const context: DrawingContextStub = createContext()
        const sensor: SensorState = {
            origin: { x: 0, y: 0 },
            readings: [0],
            zones: [
                {
                    id: SENSOR_ZONE.FRONT,
                    area: [
                        { x: 0, y: 0 },
                        { x: -100, y: -700 },
                        { x: 0, y: -700 },
                    ],
                    range: 700,
                    distance: Infinity,
                    closestHit: null,
                    reading: 0,
                },
            ],
        }

        drawSensors(context, sensor, 'off')

        expect(context.save).not.toHaveBeenCalled()
        expect(context.arc).not.toHaveBeenCalled()
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
