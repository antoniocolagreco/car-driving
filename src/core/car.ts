import { type Polygon, type Size, type Vec2, carPolygon, vec } from '@core/geometry'
import { normalizeWithThreshold } from '@core/math'
import { RACING_CAR, SIMULATION, TRAFFIC_CAR } from '@core/config'

/** Mutable car state and fixed-step physics. `Vec2` values remain immutable. */

export type Controls = {
    /** [-1, 1], negative = reverse. */
    throttle: number
    /** Brake pressure in [0, 1]. Manual controls may modulate it; the network emits only 0 or 1. */
    brake: number
    /** [-1, 1], negative = left. */
    steering: number
}

export type CarSpec = {
    readonly maxSpeed: number
    readonly acceleration: number
    readonly maxReverse: number
    readonly brakePower: number
    readonly size: Size
}

export type Car = {
    position: Vec2
    /** Radians. 0 = pointing up the road, which is towards negative y on the canvas. */
    heading: number
    speed: number
    controls: Controls
    readonly spec: CarSpec
    color: string
    crashed: boolean
    /** Steering applied this step, in degrees, for the HUD. */
    steeringDegrees: number
    /** Signed deviation from the road axis in degrees, (-180, 180]: right is positive. */
    headingDegrees: number
}

export const RACING_CAR_SPEC: CarSpec = {
    maxSpeed: RACING_CAR.maxSpeed,
    acceleration: RACING_CAR.acceleration,
    maxReverse: RACING_CAR.maxReverse,
    brakePower: RACING_CAR.brakePower,
    size: { width: RACING_CAR.width, height: RACING_CAR.height },
}

export const TRAFFIC_CAR_SPEC: CarSpec = {
    maxSpeed: TRAFFIC_CAR.maxSpeed,
    acceleration: TRAFFIC_CAR.acceleration,
    maxReverse: TRAFFIC_CAR.maxReverse,
    brakePower: TRAFFIC_CAR.brakePower,
    size: { width: TRAFFIC_CAR.width, height: TRAFFIC_CAR.height },
}

/** Coasting deceleration per 60 Hz step; high enough for throttle lift-off to matter. */
const NATURAL_DECELERATION = 0.04

/** Builds a stationary car facing up the road. */
export const createCar = (position: Vec2, spec: CarSpec, color: string): Car => ({
    position,
    heading: 0,
    speed: 0,
    controls: { throttle: 0, brake: 0, steering: 0 },
    spec,
    color,
    crashed: false,
    steeringDegrees: 0,
    headingDegrees: 0,
})

/** Signed road-axis deviation in degrees; positive matches right steering. */
const headingDeviationDegrees = (heading: number): number => {
    const degrees = (-heading * (180 / Math.PI)) % 360
    const normalized = (degrees + 360) % 360
    return normalized <= 180 ? normalized : normalized - 360
}

/**
 * Advances a car in place. Tuning is scaled from the 60 Hz baseline, and position uses
 * average pre/post speed so constant acceleration is independent of step subdivision.
 */
export const stepCar = (car: Car, dt: number): void => {
    const scale = dt / SIMULATION.stepSeconds
    const spec = car.spec
    const { throttle, brake, steering } = car.controls
    const speedBefore = car.speed

    if (throttle > 0 && car.speed < spec.maxSpeed) {
        car.speed = Math.min(spec.maxSpeed, car.speed + spec.acceleration * throttle * scale)
    } else if (throttle < 0 && car.speed > -spec.maxReverse) {
        car.speed = Math.max(-spec.maxReverse, car.speed + spec.acceleration * throttle * scale)
    }

    // Braking approaches zero without crossing into the opposite direction.
    if (brake > 0) {
        const braking = spec.brakePower * brake * scale
        if (car.speed > 0) {
            car.speed = Math.max(0, car.speed - braking)
        } else if (car.speed < 0) {
            car.speed = Math.min(0, car.speed + braking)
        }
    }

    if (throttle === 0 && brake === 0) {
        if (car.speed > 0) {
            car.speed = Math.max(0, car.speed - NATURAL_DECELERATION * scale)
        } else if (car.speed < 0) {
            car.speed = Math.min(0, car.speed + NATURAL_DECELERATION * scale)
        }
    }

    // Empirical steering curve retained from the original model.
    const steeringPower =
        car.speed > 1
            ? 0.000444 * car.speed ** 2 - 0.007667 * car.speed + 0.037222
            : 0.03 * car.speed - 0.003

    // Forward is -y, so positive/right steering decreases heading.
    if (Math.abs(car.speed) > 0) {
        const rotation = -steeringPower * steering * scale
        car.heading += rotation
        car.steeringDegrees = rotation * (180 / Math.PI)
    } else {
        car.steeringDegrees = 0
    }

    const averageSpeed = (speedBefore + car.speed) / 2
    car.position = vec(
        car.position.x - Math.sin(car.heading) * averageSpeed * scale,
        car.position.y - Math.cos(car.heading) * averageSpeed * scale,
    )

    car.headingDegrees = headingDeviationDegrees(car.heading)
}

export const carShape = (car: Car): Polygon => carPolygon(car.position, car.spec.size, car.heading)

export const crash = (car: Car): void => {
    car.crashed = true
    car.speed = 0
}

const BRAKE_OUTPUT_INDEX = 1
/** Neural brake is off through 0.5 and fully on above it. */
const BRAKE_OUTPUT_THRESHOLD = 0.5

/** Maps `[throttle, brake, steering]`; only brake is thresholded to a binary command. */
export const controlsFromOutputs = (outputs: readonly number[]): Controls => ({
    throttle: outputs[0],
    brake: outputs[BRAKE_OUTPUT_INDEX] > BRAKE_OUTPUT_THRESHOLD ? 1 : 0,
    steering: outputs[2],
})

/** Appends normalized speed to the eleven ordered sensor readings. */
export const networkInputs = (car: Car, readings: readonly number[]): number[] => {
    const normalizedSpeed = normalizeWithThreshold(
        car.speed,
        -car.spec.maxReverse,
        car.spec.maxSpeed,
        -1,
        1,
        0,
    )
    return [...readings, normalizedSpeed]
}
