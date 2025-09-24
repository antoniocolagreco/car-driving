import type { RacingCar } from '@models/racing-car'
import Vehicle from '@models/vehicle'
import { SCORE } from 'src/constants'

/**
 * Ricompense (merit):
 * Sorpasso: +1 per ogni veicolo dietro (già presente, manteniamolo).
 * Frenata intelligente: +0.2/s se c’è un ostacolo frontale vicino e il freno è attivo.
 * Sterzata “utile”: +0.1/s se si sterza forte (|steering| > 0.6) con ostacolo frontale vicino (indicativo di cambio corsia per sorpasso).
 * Penalità (demerit):
 * Tailgating: -0.5/s quando sei troppo vicino a un’auto davanti nella “stessa corsia” (prossimità laterale) e vai piano (stai aspettando invece di sorpassare).
 * Rimanere fermi: -0.2/s quando la velocità è sotto soglia (es. < 0.2) e NON c’è ostacolo vicino (stallo immotivato).
 * Velocità non sicura: -0.4/s se c’è un ostacolo molto vicino e vai più veloce della soglia sicura senza frenare.
 */

export const getOvertakenCars = (racingCar: RacingCar, traffic: Vehicle[]) => {
    const overtakenCars = traffic.filter(
        (car) => car.getPosition().getY() > racingCar.getPosition().getY(),
    ).length
    return overtakenCars
}

// Returns true when the brake is pressed AND there is an obstacle within minimumDistance in front of the car.
// Notes:
// - Sensor.getDistanceFromObstacles returns a number in pixels; Infinity when no obstacle is detected in the cone.
// - Assumes Sensor.checkCollisions(...) has been called earlier in the frame (see Vehicle update loop).
export const isBreakingToAvoidCollision = (racingCar: RacingCar, traffic: Vehicle[]) => {
    const sensor = racingCar.getSensor()
    if (!sensor) {
        return false
    }

    if (racingCar.getSpeed() <= 0) {
        return false
    }

    const brakeActive = racingCar.getControls().isBreaking()
    if (!brakeActive) {
        return false
    }

    const halfCone = SCORE.settings.frontAngleToCheckForCars / 2
    const shapes = traffic.map((car) => car.getShape())
    const frontDistance = sensor.getDistanceFromObstacles(shapes, -halfCone, halfCone)

    // Consider braking to avoid collision only if a finite distance is measured and below threshold
    return (
        Number.isFinite(frontDistance) && frontDistance < SCORE.settings.reactionDistanceThreshold
    )
}

// Returns true when the car is steering significantly AND there is an obstacle within range in front of the car.
// Notes:
// - Uses the same sensor logic as isBreakingToAvoidCollision
// - Returns true when absolute steering degree is at least 0.05 (indicating active steering to avoid collision)
export const isTurningToAvoidCollision = (racingCar: RacingCar, traffic: Vehicle[]) => {
    const sensor = racingCar.getSensor()
    if (!sensor) {
        return false
    }

    if (racingCar.getSpeed() <= 0) {
        return false
    }

    // Check if the car is steering significantly (at least 0.05 degrees)
    const steeringDegree = Math.abs(racingCar.getSteeringDegree())
    if (steeringDegree < SCORE.settings.averageSteeringDegreeReaction) {
        return false
    }

    const halfCone = SCORE.settings.frontAngleToCheckForCars / 2
    const shapes = traffic.map((car) => car.getShape())
    const frontDistance = sensor.getDistanceFromObstacles(shapes, -halfCone, halfCone)

    // Consider turning to avoid collision only if a finite distance is measured and below threshold
    return (
        Number.isFinite(frontDistance) && frontDistance < SCORE.settings.reactionDistanceThreshold
    )
}
