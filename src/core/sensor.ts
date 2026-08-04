import { RACING_CAR, SENSOR, SENSOR_RANGE } from '@core/config'
import {
    type Polygon,
    type Segment,
    type Vec2,
    clipSegmentToConvexPolygon,
    carPolygon,
    distance,
    dot,
    vec,
} from '@core/geometry'
import { clamp } from '@core/math'

/** Stable left-to-right identifiers for the network's eleven perception inputs. */
export const SENSOR_ZONE = {
    LEFT_SIDE: 'left-side',
    LEFT_LATERAL: 'left-lateral',
    LEFT_OUTER: 'left-outer',
    LEFT_MIDDLE: 'left-middle',
    LEFT_INNER: 'left-inner',
    FRONT: 'front',
    RIGHT_INNER: 'right-inner',
    RIGHT_MIDDLE: 'right-middle',
    RIGHT_OUTER: 'right-outer',
    RIGHT_LATERAL: 'right-lateral',
    RIGHT_SIDE: 'right-side',
} as const

export type SensorZoneId = (typeof SENSOR_ZONE)[keyof typeof SENSOR_ZONE]

/** The order is part of the network input contract: left flank through right flank. */
export const SENSOR_ZONE_ORDER: readonly SensorZoneId[] = [
    SENSOR_ZONE.LEFT_SIDE,
    SENSOR_ZONE.LEFT_LATERAL,
    SENSOR_ZONE.LEFT_OUTER,
    SENSOR_ZONE.LEFT_MIDDLE,
    SENSOR_ZONE.LEFT_INNER,
    SENSOR_ZONE.FRONT,
    SENSOR_ZONE.RIGHT_INNER,
    SENSOR_ZONE.RIGHT_MIDDLE,
    SENSOR_ZONE.RIGHT_OUTER,
    SENSOR_ZONE.RIGHT_LATERAL,
    SENSOR_ZONE.RIGHT_SIDE,
]

export type SensorHit = {
    readonly point: Vec2
    /** Distance from the bumper/side edge in the zone's own measurement axis. */
    readonly distance: number
}

/** One fixed perception area and its closest obstacle in the current frame. */
export type SensorZone = {
    readonly id: SensorZoneId
    /** Full unoccluded world-space area, retained for rendering. */
    readonly area: Polygon
    /**
     * Maximum distance represented by this zone, and therefore its resolution: the
     * reading is `1 - distance / range`. Zones do not share one — see `SENSOR_RANGE`.
     */
    readonly range: number
    readonly distance: number
    readonly closestHit: SensorHit | null
    /** 0 means clear; 1 means an obstacle is touching the bumper. */
    readonly reading: number
}

/** Complete fixed perception state; `readings` follows `SENSOR_ZONE_ORDER`. */
export type SensorState = {
    readonly origin: Vec2
    readonly zones: readonly SensorZone[]
    readonly readings: readonly number[]
}

type ZoneDefinition = {
    readonly id: SensorZoneId
    readonly area: Polygon
    readonly range: number
    readonly measureDistance: (point: Vec2) => number
}

const directionAt = (heading: number, relativeRadians: number): Vec2 =>
    vec(-Math.sin(heading + relativeRadians), -Math.cos(heading + relativeRadians))

const pointAlong = (origin: Vec2, direction: Vec2, amount: number): Vec2 =>
    vec(origin.x + direction.x * amount, origin.y + direction.y * amount)

/** Centre of the car's front bumper, rather than its centre of mass. */
export const sensorOrigin = (position: Vec2, heading: number): Vec2 =>
    pointAlong(position, directionAt(heading, 0), RACING_CAR.height / 2)

const triangle = (
    origin: Vec2,
    heading: number,
    startDegrees: number,
    endDegrees: number,
    range: number,
): Polygon => [
    origin,
    pointAlong(origin, directionAt(heading, (startDegrees * Math.PI) / 180), range),
    pointAlong(origin, directionAt(heading, (endDegrees * Math.PI) / 180), range),
]

const frontArea = (origin: Vec2, heading: number): Polygon => {
    const forward = directionAt(heading, 0)
    const right = vec(Math.cos(heading), -Math.sin(heading))
    const halfWidth = RACING_CAR.width / 2
    const nearLeft = pointAlong(origin, right, -halfWidth)
    const nearRight = pointAlong(origin, right, halfWidth)
    const farLeft = pointAlong(nearLeft, forward, SENSOR_RANGE.front)
    const farRight = pointAlong(nearRight, forward, SENSOR_RANGE.front)
    return [nearLeft, nearRight, farRight, farLeft]
}

const sideArea = (innerFront: Vec2, innerRear: Vec2, outward: Vec2): Polygon => {
    const outerFront = pointAlong(innerFront, outward, SENSOR_RANGE.side)
    const outerRear = pointAlong(innerRear, outward, SENSOR_RANGE.side)
    return [innerFront, innerRear, outerRear, outerFront]
}

/** Builds every fixed zone in the canonical left-to-right network order. */
export const sensorZones = (position: Vec2, heading: number): readonly ZoneDefinition[] => {
    const origin = sensorOrigin(position, heading)
    const forward = directionAt(heading, 0)
    const sector = SENSOR.sideSectorDegrees
    const outerAngle = sector * SENSOR.sideSectorsPerSide
    const front = frontArea(origin, heading)
    const frontLeft = front[0]
    const frontRight = front[1]
    const [bodyFrontRight, bodyFrontLeft, bodyRearLeft, bodyRearRight] = carPolygon(
        position,
        { width: RACING_CAR.width, height: RACING_CAR.height },
        heading,
    )
    const right = vec(Math.cos(heading), -Math.sin(heading))
    const left = vec(-right.x, -right.y)
    const leftSide = sideArea(bodyFrontLeft, bodyRearLeft, left)
    const rightSide = sideArea(bodyFrontRight, bodyRearRight, right)
    const radialDistanceFrom =
        (zoneOrigin: Vec2): ((point: Vec2) => number) =>
        (point: Vec2): number =>
            distance(zoneOrigin, point)
    const longitudinalDistance = (point: Vec2): number =>
        Math.max(0, dot(vec(point.x - origin.x, point.y - origin.y), forward))

    return [
        {
            id: SENSOR_ZONE.LEFT_SIDE,
            area: leftSide,
            range: SENSOR_RANGE.side,
            measureDistance: (point: Vec2): number =>
                Math.max(0, dot(vec(point.x - bodyFrontLeft.x, point.y - bodyFrontLeft.y), left)),
        },
        {
            id: SENSOR_ZONE.LEFT_LATERAL,
            area: triangle(
                frontLeft,
                heading,
                SENSOR.lateralCoverageDegrees,
                outerAngle,
                SENSOR_RANGE.lateral,
            ),
            range: SENSOR_RANGE.lateral,
            measureDistance: radialDistanceFrom(frontLeft),
        },
        {
            id: SENSOR_ZONE.LEFT_OUTER,
            area: triangle(frontLeft, heading, outerAngle, outerAngle - sector, SENSOR_RANGE.outer),
            range: SENSOR_RANGE.outer,
            measureDistance: radialDistanceFrom(frontLeft),
        },
        {
            id: SENSOR_ZONE.LEFT_MIDDLE,
            area: triangle(frontLeft, heading, outerAngle - sector, sector, SENSOR_RANGE.middle),
            range: SENSOR_RANGE.middle,
            measureDistance: radialDistanceFrom(frontLeft),
        },
        {
            id: SENSOR_ZONE.LEFT_INNER,
            area: triangle(frontLeft, heading, sector, 0, SENSOR_RANGE.inner),
            range: SENSOR_RANGE.inner,
            measureDistance: radialDistanceFrom(frontLeft),
        },
        {
            id: SENSOR_ZONE.FRONT,
            area: front,
            range: SENSOR_RANGE.front,
            measureDistance: longitudinalDistance,
        },
        {
            id: SENSOR_ZONE.RIGHT_INNER,
            area: triangle(frontRight, heading, 0, -sector, SENSOR_RANGE.inner),
            range: SENSOR_RANGE.inner,
            measureDistance: radialDistanceFrom(frontRight),
        },
        {
            id: SENSOR_ZONE.RIGHT_MIDDLE,
            area: triangle(
                frontRight,
                heading,
                -sector,
                -(outerAngle - sector),
                SENSOR_RANGE.middle,
            ),
            range: SENSOR_RANGE.middle,
            measureDistance: radialDistanceFrom(frontRight),
        },
        {
            id: SENSOR_ZONE.RIGHT_OUTER,
            area: triangle(
                frontRight,
                heading,
                -(outerAngle - sector),
                -outerAngle,
                SENSOR_RANGE.outer,
            ),
            range: SENSOR_RANGE.outer,
            measureDistance: radialDistanceFrom(frontRight),
        },
        {
            id: SENSOR_ZONE.RIGHT_LATERAL,
            area: triangle(
                frontRight,
                heading,
                -outerAngle,
                -SENSOR.lateralCoverageDegrees,
                SENSOR_RANGE.lateral,
            ),
            range: SENSOR_RANGE.lateral,
            measureDistance: radialDistanceFrom(frontRight),
        },
        {
            id: SENSOR_ZONE.RIGHT_SIDE,
            area: rightSide,
            range: SENSOR_RANGE.side,
            measureDistance: (point: Vec2): number =>
                Math.max(0, dot(vec(point.x - bodyFrontRight.x, point.y - bodyFrontRight.y), right)),
        },
    ]
}

/** Nearest point of the part of an obstacle segment that lies in a zone. */
const closestZoneHit = (zone: ZoneDefinition, obstacle: Segment): SensorHit | null => {
    const inside = clipSegmentToConvexPolygon(obstacle, zone.area)
    if (!inside) {
        return null
    }

    const candidates: Vec2[] = [inside.a, inside.b]
    // Radial distance can attain its minimum in the interior of the clipped segment.
    const segmentDirection = vec(inside.b.x - inside.a.x, inside.b.y - inside.a.y)
    const lengthSquared = dot(segmentDirection, segmentDirection)
    if (lengthSquared > 0) {
        const origin = zone.area[0]
        const projection = clamp(
            dot(vec(origin.x - inside.a.x, origin.y - inside.a.y), segmentDirection) / lengthSquared,
            0,
            1,
        )
        candidates.push(pointAlong(inside.a, segmentDirection, projection))
    }

    let closest: SensorHit | null = null
    for (const point of candidates) {
        const hit: SensorHit = { point, distance: zone.measureDistance(point) }
        if (closest === null || hit.distance < closest.distance) {
            closest = hit
        }
    }
    return closest
}

/**
 * Casts the fixed eleven-area perception. Unlike rays, an obstacle is seen when any
 * portion of its segment enters or merely touches the whole zone.
 */
export const castSensors = (
    position: Vec2,
    heading: number,
    obstacles: readonly Segment[],
): SensorState => {
    const definitions = sensorZones(position, heading)
    const zones: SensorZone[] = definitions.map((definition) => {
        let closestHit: SensorHit | null = null
        for (const obstacle of obstacles) {
            const hit = closestZoneHit(definition, obstacle)
            if (hit !== null && (closestHit === null || hit.distance < closestHit.distance)) {
                closestHit = hit
            }
        }
        const measuredDistance = closestHit?.distance ?? Infinity
        return {
            id: definition.id,
            area: definition.area,
            range: definition.range,
            distance: measuredDistance,
            closestHit,
            reading: Number.isFinite(measuredDistance)
                ? 1 - clamp(measuredDistance / definition.range, 0, 1)
                : 0,
        }
    })

    return {
        origin: sensorOrigin(position, heading),
        zones,
        readings: zones.map((zone) => zone.reading),
    }
}

/** The longitudinal distance sensed by the named front rectangle. */
export const frontDistance = (sensor: SensorState): number =>
    sensor.zones.find((zone) => zone.id === SENSOR_ZONE.FRONT)?.distance ?? Infinity
