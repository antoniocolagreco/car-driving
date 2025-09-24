import Features from '@models/features'
import NeuralNetwork from '@models/neural-network'
import { RacingCar } from '@models/racing-car'
import Road from '@models/road'
import Sensor from '@models/sensor'
import { CONSTANTS } from '../constants'

export const generateCars = (
    carsQuantity: number,
    networkArchitecture: Array<number>,
    road: Road,
    seed?: NeuralNetwork,
    mutationRate?: number,
) => {
    const cars: Array<RacingCar> = []

    const features = new Features({
        maxSpeed: 10,
        acceleration: 0.05,
        maxReverse: 1,
        breakPower: 0.2,
    })

    for (let index = 0; index < carsQuantity; index++) {
        // Tutte le auto partono dalla corsia centrale nella stessa posizione
        const lane = Math.floor(road.getLaneCount() / 2)
        const position = road.getLanePosition(lane)
        const sensor = new Sensor({ rayCount: 5, rayLength: 500, raySpread: Math.PI * 0.25 })
        let network: NeuralNetwork
        if (seed && mutationRate) {
            const randomMutationRate = Math.random() * mutationRate
            network = NeuralNetwork.getMutatedNetwork(seed, randomMutationRate)
        } else {
            network = new NeuralNetwork(sensor.getRayCount() + 1, ...networkArchitecture, 3)
        }

        const car = new RacingCar({
            position,
            features,
            sensor,
            network,
            ghost: true,
            timeout: CONSTANTS.deathTimeout,
        })
        cars.push(car)
    }
    return cars
}

export const getRemainingCars = (cars: Array<RacingCar>) => cars.filter((car) => !car.isDamaged())

/**
 * Trova l'auto più avanti nella gara.
 * NOTA: Nel canvas l'asse Y è invertito (0 = top, crescente verso il basso).
 * Le auto partono con Y alto e "avanzano" diminuendo Y, quindi:
 * - Auto più avanti = Y più piccola
 * - Cerchiamo il valore Y minimo per trovare l'auto leader
 */
export const getLeadingCar = (cars: Array<RacingCar>) => {
    let leadingCar: RacingCar | undefined
    let leadingPosition = +Infinity // Inizializza con +Infinity per trovare il valore Y più piccolo

    for (const car of cars) {
        car.setActive(false)

        // Y più piccola = auto più avanti (asse Y invertito nel canvas)
        if (car.getPosition().getY() < leadingPosition) {
            leadingPosition = car.getPosition().getY()
            leadingCar = car
        }
    }

    leadingCar?.setActive(true)
    return leadingCar
}

export const getBestCar = (cars: Array<RacingCar>) => {
    const capableCars = cars.filter((car) => {
        const stats = car.getStats()
        if (
            stats.hasEverAccelerated() &&
            stats.hasEverTurnedLeft() &&
            stats.hasEverTurnedRight() &&
            stats.hasEverBreaked() &&
            stats.getOvertakenCars() > 0
        ) {
            return true
        }

        return false
    })

    let bestScore = 0
    for (const car of capableCars) {
        car.setWinner(false)
        bestScore = Math.max(bestScore, car.getStats().getTotalScore())
    }
    const bestCar = cars.find((car) => car.getStats().getTotalScore() === bestScore)

    bestCar?.setWinner(true)
    return bestCar
}
