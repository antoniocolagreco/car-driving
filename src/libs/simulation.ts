import Features from '@models/features'
import NeuralNetwork from '@models/neural-network'
import { RacingCar } from '@models/racing-car'
import Road from '@models/road'
import Sensor from '@models/sensor'

export const generateCars = (
    carsQuantity: number,
    networkArchitecture: Array<number>,
    road: Road,
    seed?: NeuralNetwork,
    mutationRate?: number,
) => {
    const cars: Array<RacingCar> = []

    const features = new Features({
        maxSpeed: 7,
        acceleration: 0.03,
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

        const car = new RacingCar({ position, features, sensor, network, ghost: true })
        cars.push(car)
    }
    return cars
}

export const getRemainingCars = (cars: Array<RacingCar>) => cars.filter((car) => !car.isDamaged())

export const getActiveCar = (cars: Array<RacingCar>) => {
    const leadingCarPosition = Math.min(...cars.map((c) => c.getPosition().getY()))
    const car = cars.find((car) => car.getPosition().getY() === leadingCarPosition)
    // Reset active state for all cars (ghost + hide rays)
    cars.forEach((c) => c.setActive(false))
    // Mark the current leader as active (non-ghost + show rays)
    if (car) {
        car.setActive(true)
    }

    return car
}

export const getBestCar = (cars: Array<RacingCar>) => {
    // Reset winner flag for all cars
    cars.forEach((car) => car.setWinner(false))

    const bestScore = Math.max(...cars.map((c) => c.getPoints()))
    const bestCars = cars.filter((c) => c.getPoints() === bestScore)
    const mostDistanceCovered = Math.min(...bestCars.map((c) => c.getPosition().getY()))
    const bestCarLastToDie = bestCars.find(
        (car) => car.getPosition().getY() === mostDistanceCovered,
    )
    if (bestCarLastToDie) {
        bestCarLastToDie.setWinner(true)
    }
    return bestCarLastToDie
}
