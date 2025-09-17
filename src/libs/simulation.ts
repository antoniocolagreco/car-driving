import { Car } from '@models/car'
import Features from '@models/features'
import NeuralNetwork from '@models/neural-network'
import Road from '@models/road'
import Sensor from '@models/sensor'

export const generateCars = (carsQuantity: number, neurons: Array<number>, road: Road) => {
    const cars: Array<Car> = []

    const features = new Features({
        maxSpeed: 7,
        acceleration: 0.03,
        maxReverse: 1,
        breakPower: 0.2,
    })

    for (let index = 0; index < carsQuantity; index++) {
        // const lane = Math.floor(Math.random() * road.getLaneCount()) // Random lane
        const lane = 1 // TODO: opzionale random lane
        const position = road.getLanePosition(lane)
        const sensor = new Sensor({ rayCount: 7, rayLength: 500, raySpread: Math.PI * 0.5 })
        const network = new NeuralNetwork(sensor.getRayCount() + 1, ...neurons, 4)
        const car = new Car({ position, features, sensor, network, ghost: true })
        cars.push(car)
    }
    return cars
}

export const getRemainingCars = (cars: Array<Car>) => cars.filter((car) => !car.isDamaged())

export const getActiveCar = (cars: Array<Car>) => {
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

export const getBestCar = (cars: Array<Car>) => {
    // Reset winner flag for all cars
    cars.forEach((car) => car.setWinner(false))

    const bestScore = Math.max(...cars.map((c) => c.getPoints()))
    const bestCars = cars.filter((c) => c.getPoints() === bestScore)
    const mostDistanceCovered = Math.max(...bestCars.map((c) => c.getPosition().getY()))
    const bestCarLastToDie = bestCars.find(
        (car) => car.getPosition().getY() === mostDistanceCovered,
    )
    if (bestCarLastToDie) {
        bestCarLastToDie.setWinner(true)
    }
    return bestCarLastToDie
}
