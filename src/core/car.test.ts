import { describe, expect, it } from 'vitest'
import { vec } from '@core/geometry'
import { SIMULATION } from '@core/config'
import { RACING_CAR_SPEC, controlsFromOutputs, createCar, networkInputs, stepCar } from './car'

describe('stepCar', () => {
    it('reports heading as a signed deviation, positive when steering right', () => {
        const right = createCar(vec(0, 0), RACING_CAR_SPEC, 'red')
        const left = createCar(vec(0, 0), RACING_CAR_SPEC, 'red')
        right.speed = RACING_CAR_SPEC.maxSpeed
        left.speed = RACING_CAR_SPEC.maxSpeed
        right.controls = { throttle: 1, brake: 0, steering: 1 }
        left.controls = { throttle: 1, brake: 0, steering: -1 }

        for (let step = 0; step < 60; step++) {
            stepCar(right, SIMULATION.stepSeconds)
            stepCar(left, SIMULATION.stepSeconds)
        }

        // Same magnitude, opposite signs: the number reads like the steering that caused it.
        expect(right.headingDegrees).toBeGreaterThan(0)
        expect(left.headingDegrees).toBeCloseTo(-right.headingDegrees)
        // And the car really did move right, which is what the sign claims.
        expect(right.position.x).toBeGreaterThan(0)
        expect(left.position.x).toBeLessThan(0)
    })

    it('accelerates under throttle up to spec.maxSpeed and no further', () => {
        const car = createCar(vec(0, 0), RACING_CAR_SPEC, 'red')
        car.controls = { throttle: 1, brake: 0, steering: 0 }

        for (let i = 0; i < 1000; i++) {
            stepCar(car, SIMULATION.stepSeconds)
            expect(car.speed).toBeLessThanOrEqual(RACING_CAR_SPEC.maxSpeed)
        }

        expect(car.speed).toBeCloseTo(RACING_CAR_SPEC.maxSpeed)
    })

    it('limits reverse speed to spec.maxReverse', () => {
        const car = createCar(vec(0, 0), RACING_CAR_SPEC, 'red')
        car.controls = { throttle: -1, brake: 0, steering: 0 }

        for (let i = 0; i < 1000; i++) {
            stepCar(car, SIMULATION.stepSeconds)
            expect(car.speed).toBeGreaterThanOrEqual(-RACING_CAR_SPEC.maxReverse)
        }

        expect(car.speed).toBeCloseTo(-RACING_CAR_SPEC.maxReverse)
    })

    it('reduces a positive speed towards 0 when braking, without overshooting into negative', () => {
        const car = createCar(vec(0, 0), RACING_CAR_SPEC, 'red')
        car.speed = 5
        car.controls = { throttle: 0, brake: 1, steering: 0 }

        // A large dt so the brake would overshoot past 0 if it were not clamped.
        stepCar(car, 10)

        expect(car.speed).toBe(0)
    })

    it('reduces a negative speed towards 0 when braking, without overshooting into positive', () => {
        const car = createCar(vec(0, 0), RACING_CAR_SPEC, 'red')
        car.speed = -5
        car.controls = { throttle: 0, brake: 1, steering: 0 }

        stepCar(car, 10)

        expect(car.speed).toBe(0)
    })

    it('coasts to exactly 0 with no input', () => {
        const car = createCar(vec(0, 0), RACING_CAR_SPEC, 'red')
        car.speed = 0.05
        car.controls = { throttle: 0, brake: 0, steering: 0 }

        stepCar(car, 10) // large dt, well past what is needed to fully decelerate

        expect(car.speed).toBe(0)
    })

    it('does not change heading while stationary, even with steering input', () => {
        const car = createCar(vec(0, 0), RACING_CAR_SPEC, 'red')
        car.controls = { throttle: 0, brake: 0, steering: 1 }

        stepCar(car, SIMULATION.stepSeconds)

        expect(car.heading).toBe(0)
    })

    it('changes heading from steering input once the car is moving', () => {
        const car = createCar(vec(0, 0), RACING_CAR_SPEC, 'red')
        car.speed = 5
        car.controls = { throttle: 0, brake: 0, steering: 1 }

        stepCar(car, SIMULATION.stepSeconds)

        expect(car.heading).not.toBe(0)
    })

    it('is frame-rate independent: one step at dt=1/30 matches two steps at dt=1/60', () => {
        const carA = createCar(vec(0, 0), RACING_CAR_SPEC, 'red')
        carA.controls = { throttle: 1, brake: 0, steering: 0 }
        stepCar(carA, 1 / 30)

        const carB = createCar(vec(0, 0), RACING_CAR_SPEC, 'red')
        carB.controls = { throttle: 1, brake: 0, steering: 0 }
        stepCar(carB, 1 / 60)
        stepCar(carB, 1 / 60)

        expect(carA.speed).toBeCloseTo(carB.speed, 10)
        expect(carA.position.x).toBeCloseTo(carB.position.x, 10)
        expect(carA.position.y).toBeCloseTo(carB.position.y, 10)
    })
})

describe('controlsFromOutputs', () => {
    it('maps outputs to throttle, brake and steering in order', () => {
        const controls = controlsFromOutputs([0.3, 0.9, -0.5])

        expect(controls.throttle).toBe(0.3)
        expect(controls.brake).toBe(1)
        expect(controls.steering).toBe(-0.5)
    })

    it('keeps the network brake off through 0.5 and turns it fully on above the threshold', () => {
        expect(controlsFromOutputs([0, 0.5, 0]).brake).toBe(0)
        expect(controlsFromOutputs([0, 0.500_001, 0]).brake).toBe(1)
        expect(controlsFromOutputs([0, 1, 0]).brake).toBe(1)
        expect(controlsFromOutputs([0, -0.4, 0]).brake).toBe(0)
        expect(controlsFromOutputs([0, 0, 0]).brake).toBe(0)
    })
})

describe('networkInputs', () => {
    it('appends normalized car speed after the sensor readings', () => {
        const car = createCar(vec(0, 0), RACING_CAR_SPEC, 'red')
        car.speed = 5
        const readings = [0.1, 0.9, 0, 0.4]

        const inputs = networkInputs(car, readings)

        expect(inputs).toHaveLength(readings.length + 1)
        expect(inputs.at(-1)).toBe(0.5)
        for (const value of inputs) {
            expect(value).toBeGreaterThanOrEqual(-1)
            expect(value).toBeLessThanOrEqual(1)
        }
    })
})
