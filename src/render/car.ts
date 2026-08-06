import { type Polygon, type Vec2, carPolygon, vec } from '@core/geometry'
import { type Car, carShape } from '@core/car'
import { clamp } from '@core/math'
import type { SensorState, SensorZone } from '@core/sensor'

/** Stateless car, marker and radar drawing. */

export type CarStyle = {
    readonly ghost?: boolean
    /** Draws the "WINNER" badge above the car. */
    readonly winner?: boolean
    /** Display-only body color. */
    readonly color?: string
    readonly champion?: boolean
    readonly veteran?: boolean
}

const GHOST_ALPHA = 0.5

/** Dark enough to distinguish wrecks from both live cars and tarmac. */
const CRASHED_COLOR = '#5f5f5f'

/** Gold marks the champion; silver side filets remain visible when it is also a veteran. */
const CHAMPION_BAND_COLOR = '#facc15'
const CHAMPION_BAND_WIDTH = 8
const VETERAN_BAND_COLOR = '#c0c0c0'
const VETERAN_BAND_WIDTH = 6
/** Width and center offset of veteran filets beside a champion band. */
const VETERAN_FILET_WIDTH = 3
const VETERAN_FILET_OFFSET = 7

const REAR_LIGHT_INSET = 5

const REAR_LIGHT_LATERAL_RATIO = 0.3

const BASE_LIGHT_LENGTH = 14
const BASE_LIGHT_THICKNESS = 6
const BASE_LIGHT_COLOR = 'gray'
const BASE_LIGHT_ALPHA = 0.5

/** Manual pressure threshold; neural braking is already binary. */
const BRAKE_LIGHT_THRESHOLD = 0.1

const BRAKE_LIGHT_LENGTH = 12
const BRAKE_LIGHT_THICKNESS = 4
const BRAKE_LIGHT_COLOR = 'red'
const BRAKE_LIGHT_ALPHA = 1

const SENSOR_FAN_COLOR = '#facc15'
const SENSOR_HIT_COLOR = '#ef4444'
const SENSOR_CLEAR_COLOR = '#22c55e'
const SENSOR_AREA_ALPHA = 0.18
/** Faint enough that eleven adjacent zones do not obscure the road. */
const SENSOR_ZONE_AREA_ALPHA = 0.1
const SENSOR_COLLISION_LINE_WIDTH = 2
const SENSOR_MARKER_RADIUS = 3

export type RadarMode = 'hull' | 'zones' | 'off'

const rearLightCenters = (car: Car): { left: Vec2; right: Vec2 } => {
    const distanceFromRear = car.spec.size.height / 2 - REAR_LIGHT_INSET
    const lateralSpacing = car.spec.size.width * REAR_LIGHT_LATERAL_RATIO

    const rearCenter = vec(
        car.position.x + Math.sin(car.heading) * distanceFromRear,
        car.position.y + Math.cos(car.heading) * distanceFromRear,
    )

    return {
        left: vec(
            rearCenter.x - Math.cos(car.heading) * lateralSpacing,
            rearCenter.y + Math.sin(car.heading) * lateralSpacing,
        ),
        right: vec(
            rearCenter.x + Math.cos(car.heading) * lateralSpacing,
            rearCenter.y - Math.sin(car.heading) * lateralSpacing,
        ),
    }
}

const drawLight = (
    ctx: CanvasRenderingContext2D,
    center: Vec2,
    heading: number,
    length: number,
    thickness: number,
    color: string,
    alpha: number,
): void => {
    const half = length / 2
    const start = vec(center.x - Math.cos(heading) * half, center.y + Math.sin(heading) * half)
    const end = vec(center.x + Math.cos(heading) * half, center.y - Math.sin(heading) * half)

    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = thickness
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
}

const drawLightPair = (
    ctx: CanvasRenderingContext2D,
    car: Car,
    length: number,
    thickness: number,
    color: string,
    alpha: number,
): void => {
    const { left, right } = rearLightCenters(car)
    drawLight(ctx, left, car.heading, length, thickness, color, alpha)
    drawLight(ctx, right, car.heading, length, thickness, color, alpha)
}

const fillPolygon = (ctx: CanvasRenderingContext2D, polygon: Polygon): void => {
    ctx.beginPath()
    ctx.moveTo(polygon[0].x, polygon[0].y)
    for (let index = 1; index < polygon.length; index++) {
        ctx.lineTo(polygon[index].x, polygon[index].y)
    }
    ctx.closePath()
    ctx.fill()
}

/** Paints a full-length stripe offset from the car center line. */
const drawBand = (
    ctx: CanvasRenderingContext2D,
    car: Car,
    width: number,
    offset: number,
    color: string,
): void => {
    // The lateral axis is the heading rotated by a quarter turn.
    const center: Vec2 = vec(
        car.position.x + Math.cos(car.heading) * offset,
        car.position.y - Math.sin(car.heading) * offset,
    )
    ctx.fillStyle = color
    fillPolygon(ctx, carPolygon(center, { width, height: car.spec.size.height }, car.heading))
}

/** Draws the body, persistent markers, lights and optional winner badge. */
export const drawCar = (ctx: CanvasRenderingContext2D, car: Car, style?: CarStyle): void => {
    const polygon = carShape(car)

    ctx.save()
    ctx.globalAlpha = style?.ghost ? GHOST_ALPHA : 1
    ctx.fillStyle = car.crashed ? CRASHED_COLOR : (style?.color ?? car.color)
    fillPolygon(ctx, polygon)

    // Persistent champion/veteran markers remain visible on wrecks.
    if (style?.champion) {
        drawBand(ctx, car, CHAMPION_BAND_WIDTH, 0, CHAMPION_BAND_COLOR)
    }
    if (style?.veteran && style?.champion) {
        drawBand(ctx, car, VETERAN_FILET_WIDTH, -VETERAN_FILET_OFFSET, VETERAN_BAND_COLOR)
        drawBand(ctx, car, VETERAN_FILET_WIDTH, VETERAN_FILET_OFFSET, VETERAN_BAND_COLOR)
    } else if (style?.veteran) {
        drawBand(ctx, car, VETERAN_BAND_WIDTH, 0, VETERAN_BAND_COLOR)
    }
    ctx.restore()

    if (!car.crashed) {
        drawLightPair(
            ctx,
            car,
            BASE_LIGHT_LENGTH,
            BASE_LIGHT_THICKNESS,
            BASE_LIGHT_COLOR,
            BASE_LIGHT_ALPHA,
        )
        if (car.controls.brake > BRAKE_LIGHT_THRESHOLD) {
            drawLightPair(
                ctx,
                car,
                BRAKE_LIGHT_LENGTH,
                BRAKE_LIGHT_THICKNESS,
                BRAKE_LIGHT_COLOR,
                BRAKE_LIGHT_ALPHA,
            )
        }
    }

    if (style?.winner) {
        ctx.save()
        ctx.globalAlpha = 1
        ctx.fillStyle = 'black'
        ctx.font = '12px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('WINNER', car.position.x, car.position.y)
        ctx.restore()
    }
}

const towards = (from: Vec2, to: Vec2, amount: number): Vec2 =>
    vec(from.x + (to.x - from.x) * amount, from.y + (to.y - from.y) * amount)

/** Clips a zone's displayed free area at its nearest hit, respecting its vertex order. */
const clearedArea = (zone: SensorZone): Polygon => {
    const reach: number = zone.closestHit ? clamp(zone.closestHit.distance / zone.range, 0, 1) : 1
    if (reach >= 1) {
        return zone.area
    }

    if (zone.area.length === 4) {
        const [nearLeft, nearRight, farRight, farLeft] = zone.area
        return [
            nearLeft,
            nearRight,
            towards(nearRight, farRight, reach),
            towards(nearLeft, farLeft, reach),
        ]
    }

    const [apex, farStart, farEnd] = zone.area
    return [apex, towards(apex, farStart, reach), towards(apex, farEnd, reach)]
}

const tracePolygon = (ctx: CanvasRenderingContext2D, polygon: Polygon): void => {
    ctx.beginPath()
    ctx.moveTo(polygon[0].x, polygon[0].y)
    for (let index = 1; index < polygon.length; index++) {
        ctx.lineTo(polygon[index].x, polygon[index].y)
    }
    ctx.closePath()
}

/** Draws either the free-space marker hull or each clipped sensor zone. */
export const drawSensors = (
    ctx: CanvasRenderingContext2D,
    sensor: SensorState,
    mode: RadarMode = 'hull',
): void => {
    if (mode === 'off' || sensor.zones.length === 0) {
        return
    }

    const markerPoint = (zone: SensorZone): Vec2 => {
        if (zone.closestHit) {
            return zone.closestHit.point
        }

        // Rectangle and triangle outer edges use different vertex offsets.
        const outerStart = zone.area[zone.area.length === 4 ? 2 : 1]
        const outerEnd = zone.area[zone.area.length === 4 ? 3 : 2]
        return vec((outerStart.x + outerEnd.x) / 2, (outerStart.y + outerEnd.y) / 2)
    }

    const markerPoints: Vec2[] = sensor.zones.map(markerPoint)

    ctx.save()
    ctx.setLineDash([])
    ctx.lineWidth = SENSOR_COLLISION_LINE_WIDTH
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    if (mode === 'hull') {
        // A hull needs at least three markers.
        if (markerPoints.length >= 3) {
            ctx.strokeStyle = SENSOR_FAN_COLOR
            ctx.fillStyle = SENSOR_FAN_COLOR
            tracePolygon(ctx, markerPoints)
            ctx.globalAlpha = SENSOR_AREA_ALPHA
            ctx.fill()
            ctx.globalAlpha = 1
            ctx.stroke()
        }
    } else {
        // Yellow represents free space; red is reserved for contact markers.
        ctx.strokeStyle = SENSOR_FAN_COLOR
        ctx.fillStyle = SENSOR_FAN_COLOR
        for (const zone of sensor.zones) {
            tracePolygon(ctx, clearedArea(zone))
            ctx.globalAlpha = SENSOR_ZONE_AREA_ALPHA
            ctx.fill()
            ctx.globalAlpha = 1
            ctx.stroke()
        }
    }

    for (let index = 0; index < sensor.zones.length; index++) {
        const zone = sensor.zones[index]
        const point = markerPoints[index]
        ctx.globalAlpha = 1
        ctx.fillStyle = zone.closestHit ? SENSOR_HIT_COLOR : SENSOR_CLEAR_COLOR
        ctx.beginPath()
        ctx.arc(point.x, point.y, SENSOR_MARKER_RADIUS, 0, Math.PI * 2)
        ctx.fill()
    }

    ctx.restore()
}
