import Features from '@models/features'
import NeuralNetwork from '@models/neural-network'
import { RacingCar } from '@models/racing-car'
import Road from '@models/road'
import Sensor from '@models/sensor'
import { CONSTANTS } from '../constants'
import { clamp } from './utils'

export const generateCars = (
    carsQuantity: number,
    networkArchitecture: Array<number>,
    road: Road,
    seed: NeuralNetwork | undefined,
    mutationRate: number,
    sensorCount: number,
    sensorSpread: number,
) => {
    const cars: Array<RacingCar> = []

    const features = new Features({
        maxSpeed: 10,
        acceleration: 0.05,
        maxReverse: 1,
        breakPower: 0.2,
    })

    const lane = Math.floor(road.getLaneCount() / 2)
    const rayCount = Math.min(36, Math.max(3, Math.round(sensorCount)))
    const raySpread = clamp(0, Math.PI * 2, sensorSpread)
    const baseMutationRate = clamp(0, 1, mutationRate)

    let minimumMutationCount = 0
    let lowMutationCount = 0
    let targetMutationCount = 0
    if (seed) {
        minimumMutationCount = Math.floor(carsQuantity * 0.1) // 10%
        lowMutationCount = minimumMutationCount + Math.floor(carsQuantity * 0.2) // 20%
        targetMutationCount = lowMutationCount + Math.floor(carsQuantity * 0.4) // 40%
        // I restanti (30%) saranno gestiti nell'else finale
    }

    const MIN_LOW_MUTATION_RATE = 0.01

    const getLowMutationRange = () => {
        const upperBound = baseMutationRate
        if (upperBound <= MIN_LOW_MUTATION_RATE) {
            return upperBound
        }
        return MIN_LOW_MUTATION_RATE + Math.random() * (upperBound - MIN_LOW_MUTATION_RATE)
    }

    const getHighRangeMutation = () => {
        if (baseMutationRate >= 1) {
            return 1
        }
        return baseMutationRate + Math.random() * (1 - baseMutationRate)
    }

    for (let index = 0; index < carsQuantity; index++) {
        // Tutte le auto partono dalla corsia centrale nella stessa posizione
        const position = road.getLanePosition(lane)
        const sensor = new Sensor({ rayCount, rayLength: 700, raySpread })

        let network: NeuralNetwork
        if (seed) {
            let mutatioRateToApply = baseMutationRate
            if (index < minimumMutationCount) {
                // 10% con mutazione fissa all'1%
                mutatioRateToApply = MIN_LOW_MUTATION_RATE
            } else if (index < lowMutationCount) {
                // 20% con mutazione tra 1% e mutazione selezionata
                mutatioRateToApply = getLowMutationRange()
            } else if (index < targetMutationCount) {
                // 40% con mutazione selezionata
                mutatioRateToApply = baseMutationRate
            } else {
                // 30% con mutazione da target a 100%
                mutatioRateToApply = getHighRangeMutation()
            }

            mutatioRateToApply = clamp(0, 1, mutatioRateToApply)
            network = NeuralNetwork.getMutatedNetwork(seed, mutatioRateToApply)
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

    for (const car of cars) {
        car.setWinner(false)
    }

    let bestCar: RacingCar | undefined
    let bestScore = -Infinity
    for (const car of capableCars) {
        const score = car.getStats().getTotalScore()
        if (score > bestScore) {
            bestScore = score
            bestCar = car
        }
    }

    bestCar?.setWinner(true)
    return bestCar
}
