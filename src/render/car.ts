import { type Polygon, type Vec2, vec } from '@core/geometry'
import { type Car, carShape } from '@core/car'
import { clamp } from '@core/math'
import { type SensorState, type SensorZone } from '@core/sensor'

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

/** Manual pressure below this leaves the lights off; neural control supplies only 0 or 1. */
const BRAKE_LIGHT_THRESHOLD = 0.1

/** Brighter, narrower lights drawn on top of the base ones while the brake is pressed. */
const BRAKE_LIGHT_LENGTH = 12
const BRAKE_LIGHT_THICKNESS = 4
const BRAKE_LIGHT_COLOR = 'red'
const BRAKE_LIGHT_ALPHA = 1

/** Yellow radar polygon, with red contact markers and green clear-range markers. */
const SENSOR_FAN_COLOR = '#facc15'
const SENSOR_HIT_COLOR = '#ef4444'
const SENSOR_CLEAR_COLOR = '#22c55e'
const SENSOR_AREA_ALPHA = 0.18
/**
 * Fainter than the hull's: a clear zone still reaches its full 700 px, and eleven of
 * those cover most of the screen. They also butt up against each other, so the outlines
 * carry the shape and the fill only has to hint at the area.
 */
const SENSOR_ZONE_AREA_ALPHA = 0.1
const SENSOR_COLLISION_LINE_WIDTH = 2
const SENSOR_MARKER_RADIUS = 3

/**
 * How perception is presented. The hull is the summary — one closed polygon through the
 * eleven markers, i.e. the space the car currently reads as clear — and `zones` shows the
 * individual perception areas that summary is built from.
 */
export type RadarMode = 'hull' | 'zones' | 'off'

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

/** Point `amount` of the way from `from` to `to`. */
const towards = (from: Vec2, to: Vec2, amount: number): Vec2 =>
    vec(from.x + (to.x - from.x) * amount, from.y + (to.y - from.y) * amount)

/**
 * The part of a zone that is actually clear: its own area cut back to the closest
 * obstacle, so the polygon ENDS where the car would hit something instead of running
 * on to the full 700 px range regardless of what is in the way.
 *
 * Both zone shapes shrink along their own measurement axis: a triangle towards its
 * apex, a rectangle towards its near edge. `carPolygon`-style vertex order makes the
 * pairing fixed — rectangles store [near, near, far, far] with [1] opposite [2] and
 * [0] opposite [3]; triangles store their apex first and both far points after it.
 */
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

/** Traces `polygon` as a closed path, leaving the fill and the stroke to the caller. */
const tracePolygon = (ctx: CanvasRenderingContext2D, polygon: Polygon): void => {
    ctx.beginPath()
    ctx.moveTo(polygon[0].x, polygon[0].y)
    for (let index = 1; index < polygon.length; index++) {
        ctx.lineTo(polygon[index].x, polygon[index].y)
    }
    ctx.closePath()
}

/**
 * Draws perception in the requested `mode`, over the same eleven zone markers: a marker
 * is the closest collision or, for a clear zone, the midpoint of the zone's outer edge.
 *
 * `hull` joins those markers into one closed polygon — an approximation of the space the
 * car reads as free. `zones` draws the same free space one perception area at a time,
 * each cut back to whatever it ran into: same yellow, same markers, but this view shows
 * WHICH of the eleven inputs is firing and how far into its own area the obstacle sits.
 */
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

        // Rectangles store their outer edge at [2]-[3], triangles at [1]-[2].
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
        // Two markers cannot enclose anything: with fewer than three zones only the
        // markers themselves are drawn.
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
        // Yellow like the hull, because it is the same thing seen zone by zone: the free
        // space. Red belongs to the contact markers alone — an area painted in the colour
        // of a collision reads as "this zone is blocked" when it means the opposite.
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
