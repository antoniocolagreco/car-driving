import { type Polygon, type Vec2, vec } from '@core/geometry'
import { type Car, carShape } from '@core/car'
import { SENSOR_ZONE, type SensorState, type SensorZone } from '@core/sensor'

/**
 * Drawing a single car: its body, its rear lights and, when it won its round,
 * its badge. Every function here only reads its arguments and draws — nothing
 * in this module advances physics or mutates the `Car` it is given.
 */

/** Visual variations `drawCar` can apply without touching the car's own data. */
export type CarStyle = {
    /** Reduced alpha, for the population members that are not the followed car. */
    readonly ghost?: boolean
    /** Draws the "WINNER" badge above the car. */
    readonly winner?: boolean
    /** Display-only body colour, used to identify the player while it is driven manually. */
    readonly color?: string
}

/** Body alpha applied when `style.ghost` is set. */
const GHOST_ALPHA = 0.5

/**
 * Body colour of a car that has crashed, replacing its own. Wrecks have to read
 * as wrecks at a glance: keeping their bright body colour makes a screen full of
 * dead cars look like a screen full of racers, and hides which of them is still
 * driving. Darker than the road's gray on purpose, so a wreck reads on tarmac.
 */
const CRASHED_COLOR = '#5f5f5f'

/** Rear lights sit this far forward of the car's rear edge, in px. */
const REAR_LIGHT_INSET = 5

/** Horizontal spacing of the two rear lights, as a fraction of the car's width. */
const REAR_LIGHT_LATERAL_RATIO = 0.3

/** Dim lights on always, so the rear of the car reads correctly even when it is not braking. */
const BASE_LIGHT_LENGTH = 14
const BASE_LIGHT_THICKNESS = 6
const BASE_LIGHT_COLOR = 'gray'
const BASE_LIGHT_ALPHA = 0.5

/** Brake pressure below this leaves the brake lights off — a feather touch is not braking. */
const BRAKE_LIGHT_THRESHOLD = 0.1

/** Brighter, narrower lights drawn on top of the base ones while the brake is pressed. */
const BRAKE_LIGHT_LENGTH = 12
const BRAKE_LIGHT_THICKNESS = 4
const BRAKE_LIGHT_COLOR = 'red'
const BRAKE_LIGHT_ALPHA = 1

/** Yellow perception areas with red markers reserved for closest contacts. */
const SENSOR_FAN_COLOR = '#facc15'
const SENSOR_HIT_COLOR = '#ef4444'
const SENSOR_AREA_ALPHA = 0.18

/** World-space centre point of each rear light, offset sideways and forward of the car's rear edge. */
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

/** Draws one light as a short segment perpendicular to `heading`, centred at `center`. */
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

/**
 * Draws a symmetric pair of rear lights (left and right), given shared
 * geometry and paint. The one helper below replaces what used to be three
 * near-identical blocks of light-drawing code: base lights and brake lights
 * differ only in these five values.
 */
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

/**
 * Draws one car: its body (in its own `car.color`, a display override, or
 * `CRASHED_COLOR` once it has crashed), its rear lights while alive (dim base lights,
 * bright red brake lights while braking) and, when `style.winner` is set, a "WINNER"
 * badge above it.
 */
export const drawCar = (ctx: CanvasRenderingContext2D, car: Car, style?: CarStyle): void => {
    const polygon = carShape(car)

    ctx.save()
    ctx.globalAlpha = style?.ghost ? GHOST_ALPHA : 1
    ctx.fillStyle = car.crashed ? CRASHED_COLOR : (style?.color ?? car.color)
    ctx.beginPath()
    ctx.moveTo(polygon[0].x, polygon[0].y)
    for (let index = 1; index < polygon.length; index++) {
        ctx.lineTo(polygon[index].x, polygon[index].y)
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // A retired/crashed car is electrically dead: both its running lights and brake
    // lights switch off regardless of the last controls it held before impact.
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

/**
 * Draws eleven filled perception areas below the car. Areas stop at their first
 * collision: front and flank rectangles are cut on their measurement axis while
 * angular zones shrink radially.
 */
export const drawSensors = (ctx: CanvasRenderingContext2D, sensor: SensorState): void => {
    if (sensor.zones.length === 0) {
        return
    }

    const truncatedArea = (zone: SensorZone): Polygon => {
        const distance = zone.distance
        if (!Number.isFinite(distance)) {
            return zone.area
        }
        if (zone.id === SENSOR_ZONE.FRONT) {
            const ratio = distance / zone.range
            const nearLeft = zone.area[0]
            const nearRight = zone.area[1]
            const farRight = zone.area[2]
            const farLeft = zone.area[3]
            const atRatio = (near: Vec2, far: Vec2): Vec2 =>
                vec(near.x + (far.x - near.x) * ratio, near.y + (far.y - near.y) * ratio)
            return [nearLeft, nearRight, atRatio(nearRight, farRight), atRatio(nearLeft, farLeft)]
        }
        if (zone.id === SENSOR_ZONE.LEFT_SIDE || zone.id === SENSOR_ZONE.RIGHT_SIDE) {
            const ratio = distance / zone.range
            const innerFront = zone.area[0]
            const innerRear = zone.area[1]
            const outerRear = zone.area[2]
            const outerFront = zone.area[3]
            const atRatio = (inner: Vec2, outer: Vec2): Vec2 =>
                vec(
                    inner.x + (outer.x - inner.x) * ratio,
                    inner.y + (outer.y - inner.y) * ratio,
                )
            return [
                innerFront,
                innerRear,
                atRatio(innerRear, outerRear),
                atRatio(innerFront, outerFront),
            ]
        }
        const origin = zone.area[0]
        const ratio = distance / zone.range
        return zone.area.map((point): Vec2 =>
            vec(origin.x + (point.x - origin.x) * ratio, origin.y + (point.y - origin.y) * ratio),
        )
    }

    ctx.save()
    ctx.fillStyle = SENSOR_FAN_COLOR
    ctx.globalAlpha = SENSOR_AREA_ALPHA
    for (const zone of sensor.zones) {
        const area = truncatedArea(zone)
        ctx.beginPath()
        ctx.moveTo(area[0].x, area[0].y)
        for (let index = 1; index < area.length; index++) {
            ctx.lineTo(area[index].x, area[index].y)
        }
        ctx.closePath()
        ctx.globalAlpha = SENSOR_AREA_ALPHA
        ctx.fill()

        if (zone.closestHit) {
            ctx.globalAlpha = 1
            ctx.fillStyle = SENSOR_HIT_COLOR
            ctx.beginPath()
            ctx.arc(zone.closestHit.point.x, zone.closestHit.point.y, 3, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = SENSOR_FAN_COLOR
        }
    }

    ctx.restore()
}
