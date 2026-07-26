import { describe, expect, it } from 'vitest'
import { type Polygon, type Segment, type Vec2, clipSegmentToConvexPolygon, vec } from '@core/geometry'
import { RACING_CAR, SENSOR } from '@core/config'
import {
    SENSOR_ZONE,
    SENSOR_ZONE_ORDER,
    type SensorZoneId,
    castSensors,
    frontDistance,
    sensorZones,
} from './sensor'

const origin = vec(0, 0)

const pointAt = (degrees: number, distance: number): Vec2 => {
    const radians = (degrees * Math.PI) / 180
    return vec(-Math.sin(radians) * distance, -RACING_CAR.height / 2 - Math.cos(radians) * distance)
}

/** A short obstacle fully inside a sector, centred at its named relative heading. */
const obstacleInSector = (degrees: number, distance = 200): Segment => {
    const radians = (degrees * Math.PI) / 180
    const sideOffset = degrees > 0 ? -RACING_CAR.width / 2 : RACING_CAR.width / 2
    const center = vec(
        sideOffset - Math.sin(radians) * distance,
        -RACING_CAR.height / 2 - Math.cos(radians) * distance,
    )
    return { a: vec(center.x - 2, center.y - 2), b: vec(center.x + 2, center.y + 2) }
}

const polygonContains = (polygon: Polygon, point: Vec2): boolean =>
    clipSegmentToConvexPolygon({ a: point, b: point }, polygon) !== null

describe('castSensors', () => {
    it('always returns the eleven named zones in stable left-to-right order', () => {
        const sensor = castSensors(origin, 0, [])

        expect(sensor.zones).toHaveLength(SENSOR_ZONE_ORDER.length)
        expect(sensor.zones.map((zone) => zone.id)).toEqual(SENSOR_ZONE_ORDER)
        expect(sensor.readings).toHaveLength(SENSOR_ZONE_ORDER.length)
        expect(sensor.readings).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    })

    it('places LEFT zones at negative x and RIGHT zones at positive x at heading zero', () => {
        const zones = sensorZones(origin, 0)
        const leftBumperX = zones[1].area[0].x
        const rightBumperX = zones[6].area[0].x

        for (const zone of zones.slice(1, 5)) {
            expect(zone.area[0].x).toBe(leftBumperX)
            expect((zone.area[1].x + zone.area[2].x) / 2).toBeLessThan(leftBumperX)
        }
        for (const zone of zones.slice(6, 10)) {
            expect(zone.area[0].x).toBe(rightBumperX)
            expect((zone.area[1].x + zone.area[2].x) / 2).toBeGreaterThan(rightBumperX)
        }
    })

    it('starts side zones at the matching front corner without overlapping zone interiors', () => {
        const zones = sensorZones(origin, 0)
        const front = zones.find((zone) => zone.id === SENSOR_ZONE.FRONT)

        expect(front).toBeDefined()
        for (const zone of zones.slice(1, 5)) {
            expect(zone.area[0]).toEqual(front?.area[0])
        }
        for (const zone of zones.slice(6, 10)) {
            expect(zone.area[0]).toEqual(front?.area[1])
        }

        const interiorPoints: readonly Vec2[] = [
            pointAt(67.5, 200),
            pointAt(37.5, 200),
            pointAt(22.5, 200),
            pointAt(7.5, 200),
            vec(0, -RACING_CAR.height / 2 - 200),
            pointAt(-7.5, 200),
            pointAt(-22.5, 200),
            pointAt(-37.5, 200),
            pointAt(-67.5, 200),
        ].map((point, index): Vec2 => {
            if (index < 4) {
                return vec(point.x - RACING_CAR.width / 2, point.y)
            }
            if (index > 4) {
                return vec(point.x + RACING_CAR.width / 2, point.y)
            }
            return point
        })

        const angularZoneOrder: readonly SensorZoneId[] = SENSOR_ZONE_ORDER.slice(1, -1)
        for (let index = 0; index < interiorPoints.length; index++) {
            const containingZones = zones.filter((zone) =>
                polygonContains(zone.area, interiorPoints[index]),
            )
            expect(containingZones.map((zone) => zone.id)).toEqual([angularZoneOrder[index]])
        }
    })

    it('projects full-flank side areas out to the common sensor range', () => {
        const halfWidth = RACING_CAR.width / 2
        const halfHeight = RACING_CAR.height / 2
        const sensor = castSensors(origin, 0, [
            { a: vec(-halfWidth - 10, -30), b: vec(-halfWidth - 10, 30) },
            { a: vec(halfWidth + 15, -30), b: vec(halfWidth + 15, 30) },
        ])
        const leftSide = sensor.zones.find((zone) => zone.id === SENSOR_ZONE.LEFT_SIDE)
        const rightSide = sensor.zones.find((zone) => zone.id === SENSOR_ZONE.RIGHT_SIDE)

        const expectedLeft: readonly Vec2[] = [
            vec(-halfWidth, -halfHeight),
            vec(-halfWidth, halfHeight),
            vec(-halfWidth - SENSOR.range, halfHeight),
            vec(-halfWidth - SENSOR.range, -halfHeight),
        ]
        const expectedRight: readonly Vec2[] = [
            vec(halfWidth, -halfHeight),
            vec(halfWidth, halfHeight),
            vec(halfWidth + SENSOR.range, halfHeight),
            vec(halfWidth + SENSOR.range, -halfHeight),
        ]
        expectedLeft.forEach((point, index) => {
            expect(leftSide?.area[index].x).toBeCloseTo(point.x)
            expect(leftSide?.area[index].y).toBeCloseTo(point.y)
        })
        expectedRight.forEach((point, index) => {
            expect(rightSide?.area[index].x).toBeCloseTo(point.x)
            expect(rightSide?.area[index].y).toBeCloseTo(point.y)
        })
        expect(leftSide?.distance).toBeCloseTo(10)
        expect(rightSide?.distance).toBeCloseTo(15)
        expect(leftSide?.reading).toBeCloseTo(1 - 10 / SENSOR.sideClearanceRange)
        expect(rightSide?.reading).toBeCloseTo(1 - 15 / SENSOR.sideClearanceRange)
    })

    it('front sees an obstacle between former ray lines across the whole car width', () => {
        const insideX = RACING_CAR.width / 2 - 1
        const expectedDistance = 120 - RACING_CAR.height / 2
        const obstacle: Segment = { a: vec(insideX, -170), b: vec(insideX, -120) }
        const sensor = castSensors(origin, 0, [obstacle])
        const front = sensor.zones.find((zone) => zone.id === SENSOR_ZONE.FRONT)

        expect(front?.distance).toBeCloseTo(expectedDistance)
        expect(front?.closestHit?.point.x).toBe(insideX)
        expect(front?.reading).toBeCloseTo(1 - expectedDistance / SENSOR.range)
    })

    it('front ignores a segment just outside its car-width rectangle', () => {
        const outsideX = RACING_CAR.width / 2 + 0.01
        const obstacle: Segment = { a: vec(outsideX, -170), b: vec(outsideX, -120) }
        const sensor = castSensors(origin, 0, [obstacle])

        expect(frontDistance(sensor)).toBe(Infinity)
    })

    it('front detects contacts exactly on both width boundaries', () => {
        const halfWidth = RACING_CAR.width / 2
        const expectedDistance = 120 - RACING_CAR.height / 2
        for (const x of [-halfWidth, halfWidth]) {
            const obstacle: Segment = { a: vec(x, -170), b: vec(x, -120) }
            const sensor = castSensors(origin, 0, [obstacle])
            expect(frontDistance(sensor)).toBeCloseTo(expectedDistance)
        }
    })

    it('detects all six forward sectors and both lateral escape zones', () => {
        const cases: readonly [number, SensorZoneId][] = [
            [67.5, SENSOR_ZONE.LEFT_LATERAL],
            [37.5, SENSOR_ZONE.LEFT_OUTER],
            [22.5, SENSOR_ZONE.LEFT_MIDDLE],
            [7.5, SENSOR_ZONE.LEFT_INNER],
            [-7.5, SENSOR_ZONE.RIGHT_INNER],
            [-22.5, SENSOR_ZONE.RIGHT_MIDDLE],
            [-37.5, SENSOR_ZONE.RIGHT_OUTER],
            [-67.5, SENSOR_ZONE.RIGHT_LATERAL],
        ]

        for (const [degrees, id] of cases) {
            const sensor = castSensors(origin, 0, [obstacleInSector(degrees)])
            expect(sensor.zones.find((zone) => zone.id === id)?.closestHit).not.toBeNull()
        }
    })

    it('uses the nearest point when multiple obstacles enter the same zone', () => {
        const sensor = castSensors(origin, 0, [obstacleInSector(-7.5, 300), obstacleInSector(-7.5, 120)])
        const rightInner = sensor.zones.find((zone) => zone.id === SENSOR_ZONE.RIGHT_INNER)

        expect(rightInner?.distance).toBeLessThan(130)
    })

    it('detects an obstacle segment wholly inside an area without needing an edge crossing', () => {
        const sensor = castSensors(origin, 0, [obstacleInSector(22.5)])
        const leftMiddle = sensor.zones.find((zone) => zone.id === SENSOR_ZONE.LEFT_MIDDLE)

        expect(leftMiddle?.closestHit).not.toBeNull()
        expect(leftMiddle?.distance).toBeLessThan(205)
    })

    it('rotates front perception with the car', () => {
        const obstacle: Segment = { a: vec(-170, -10), b: vec(-120, 10) }
        const sensor = castSensors(origin, Math.PI / 2, [obstacle])

        expect(frontDistance(sensor)).toBeCloseTo(120 - RACING_CAR.height / 2)
    })

    it('is deterministic for equal world inputs', () => {
        const obstacles: Segment[] = [obstacleInSector(7.5), { a: vec(-15, -180), b: vec(15, -180) }]
        const first = castSensors(origin, 0, obstacles)
        const second = castSensors(origin, 0, obstacles)

        expect(second).toEqual(first)
    })
})
