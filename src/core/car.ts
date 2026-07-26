import { type Polygon, type Size, type Vec2, carPolygon, vec } from '@core/geometry'
import { clamp, normalizeWithThreshold } from '@core/math'
import { RACING_CAR, SIMULATION, TRAFFIC_CAR } from '@core/config'

/**
 * Car state and physics. A `Car` is a mutable record (see the mutability rule in
 * CONTRACTS.md): its fields are reassigned in place every step rather than
 * reallocating the whole object, because hundreds of them get stepped 60 times a
 * second. `Vec2` fields are still replaced wholesale, never mutated in place.
 */

/** Driving inputs for one step, either from a human or from a network's outputs. */
export type Controls = {
    /** [-1, 1], negative = reverse. */
    throttle: number
    /**
     * Brake pressure in [0, 1], NOT a boolean. This is what makes speed control
     * learnable: a network whose only brake is an on/off switch above a threshold
     * has to discover an all-or-nothing behaviour, and measured over 30 generations
     * the champion never once pressed it. With analog pressure, "slow down a bit"
     * is a small change to one output instead of a cliff.
     */
    brake: number
    /** [-1, 1], negative = left. */
    steering: number
}

/** Physical characteristics that make a racing car and a traffic car handle differently. */
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
    /** Absolute deviation from the road axis in degrees, 0-180, for the HUD. */
    headingDegrees: number
}

/** Spec for the AI-driven car under evolution. */
export const RACING_CAR_SPEC: CarSpec = {
    maxSpeed: RACING_CAR.maxSpeed,
    acceleration: RACING_CAR.acceleration,
    maxReverse: RACING_CAR.maxReverse,
    brakePower: RACING_CAR.brakePower,
    size: { width: RACING_CAR.width, height: RACING_CAR.height },
}

/** Spec for traffic cars, which only ever drive straight ahead at full throttle. */
export const TRAFFIC_CAR_SPEC: CarSpec = {
    maxSpeed: TRAFFIC_CAR.maxSpeed,
    acceleration: TRAFFIC_CAR.acceleration,
    maxReverse: TRAFFIC_CAR.maxReverse,
    brakePower: TRAFFIC_CAR.brakePower,
    size: { width: TRAFFIC_CAR.width, height: TRAFFIC_CAR.height },
}

/**
 * How fast a car with no throttle and no brake coasts back down to a standstill,
 * per step at 60 Hz. It used to be 0.01, which meant a car at top speed needed
 * about sixteen seconds to roll to a stop: lifting off did nothing you could see,
 * so the brake was the only way to lose speed at all. At 0.04 — the same order as
 * `acceleration` — easing off the throttle is itself a way to modulate speed.
 */
const NATURAL_DECELERATION = 0.04

/** Builds a car at rest, facing up the road (heading 0), with no input applied yet. */
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

/** Folds a heading in radians to [0, 360) degrees, then to the minimal deviation from the road axis, in [0, 180]. */
const headingDeviationDegrees = (heading: number): number => {
    const degrees = (heading * (180 / Math.PI)) % 360
    const normalized = (degrees + 360) % 360
    return normalized <= 180 ? normalized : 360 - normalized
}

/**
 * Advances the car by one physics step of `dt` seconds. Mutates `car` in place.
 *
 * The tuning constants in `CarSpec`/config were authored assuming a fixed 60 Hz
 * step (`SIMULATION.stepSeconds`), the way the old per-frame `vehicle.ts` ran. To
 * keep that same feel at any `dt`, every increment below is scaled by
 * `dt / SIMULATION.stepSeconds` — equivalently `dt * 60` — so one step at half the
 * rate applies exactly twice the change of one step at the full rate.
 *
 * Position is integrated from the AVERAGE of the speed before and after this step
 * (trapezoidal rule), not just the post-step speed. Under constant acceleration —
 * the normal case — this makes the result the same regardless of how a given
 * span of time is split into steps, which is what frame-rate independence means
 * in practice (see the test that steps once at dt=1/30 vs twice at dt=1/60).
 */
export const stepCar = (car: Car, dt: number): void => {
    const scale = dt / SIMULATION.stepSeconds
    const spec = car.spec
    const { throttle, brake, steering } = car.controls
    const speedBefore = car.speed

    // Forward/reverse acceleration under analog throttle.
    if (throttle > 0 && car.speed < spec.maxSpeed) {
        car.speed = Math.min(spec.maxSpeed, car.speed + spec.acceleration * throttle * scale)
    } else if (throttle < 0 && car.speed > -spec.maxReverse) {
        car.speed = Math.max(-spec.maxReverse, car.speed + spec.acceleration * throttle * scale)
    }

    // Braking always pulls speed towards 0 from whichever side it is on, scaled by
    // how hard the brake is pressed, and never overshoots past 0 into the opposite sign.
    if (brake > 0) {
        const braking = spec.brakePower * brake * scale
        if (car.speed > 0) {
            car.speed = Math.max(0, car.speed - braking)
        } else if (car.speed < 0) {
            car.speed = Math.min(0, car.speed + braking)
        }
    }

    // Natural deceleration when coasting: same shape as braking, gentler rate, so
    // an untouched car settles to exactly 0 rather than drifting forever.
    if (throttle === 0 && brake === 0) {
        if (car.speed > 0) {
            car.speed = Math.max(0, car.speed - NATURAL_DECELERATION * scale)
        } else if (car.speed < 0) {
            car.speed = Math.min(0, car.speed + NATURAL_DECELERATION * scale)
        }
    }

    // Empirical curve, ported as-is from the original model: steering is sluggish
    // at low speed and sharpens up around cruising speed (the quadratic branch).
    // It is not derived from any physical model, it was tuned by feel.
    const steeringPower =
        car.speed > 1
            ? 0.000444 * car.speed ** 2 - 0.007667 * car.speed + 0.037222
            : 0.03 * car.speed - 0.003

    // Positive steering turns RIGHT, matching the `Controls` contract and the keyboard.
    // The minus sign is not a fudge: forward is -y and +x is right, so `position.x` moves
    // by `-sin(heading)` — a right turn is therefore a DECREASE in heading.
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

/** The car's collision polygon in world space, for collision checks and rendering. */
export const carShape = (car: Car): Polygon => carPolygon(car.position, car.spec.size, car.heading)

/** Marks the car as crashed and brings it to a full stop. Mutates `car`. */
export const crash = (car: Car): void => {
    car.crashed = true
    car.speed = 0
}

const BRAKE_OUTPUT_INDEX = 1

/**
 * Turns network outputs into controls: `[throttle, brake, steering]`.
 *
 * Throttle and steering use the bipolar [-1, 1] range directly (negative = reverse /
 * left). The network already exposes brake as pressure in [0, 1]; this final clamp is
 * defensive for callers that provide a raw or malformed output vector.
 */
export const controlsFromOutputs = (outputs: readonly number[]): Controls => ({
    throttle: outputs[0],
    brake: clamp(outputs[BRAKE_OUTPUT_INDEX], 0, 1),
    steering: outputs[2],
})

/**
 * Builds the network input vector: sensor readings followed by the car's speed,
 * normalized to [-1, 1] around 0 (see `normalizeWithThreshold`) so both forward
 * and reverse speed share one symmetric input despite their different ranges.
 */
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
