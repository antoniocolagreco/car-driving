import { Car } from '@models/car'
import Features from '@models/features'
import NeuralNetwork from '@models/neural-network'
import Road from '@models/road'
import Sensor from '@models/sensor'
import type Vehicle from '@models/vehicle'

export const generateCars = (numberOfCars: number, neurons: Array<number>, road: Road) => {
    const cars: Array<Vehicle> = []

    const features = new Features({
        maxSpeed: 7,
        acceleration: 0.03,
        maxReverse: 1,
        breakPower: 0.2,
    })

    for (let index = 0; index < numberOfCars; index++) {
        const lane = 1 // TODO: opzionale random lane
        const position = road.getLanePosition(lane)
        const sensor = new Sensor({ rayCount: 7, rayLength: 500, raySpread: Math.PI * 0.5 })
        const network = new NeuralNetwork(sensor.rayCount + 1, ...neurons, 4)
        const car = new Car({ position, features, sensor, network, ghost: true })
        cars.push(car)
    }
    return cars
}

export const getAliveCars = (cars: Array<Vehicle>) => cars.filter((c) => !c.damaged)

export const getActiveCar = (cars: Array<Vehicle>, currentActiveCar?: Vehicle) => {
    const car = cars.find((car) => car.position.y === Math.min(...cars.map((c) => c.position.y)))
    if (car && currentActiveCar) {
        currentActiveCar.setGhost(true)
        car.setGhost(false)
    }
    return car
}

export const getBestCar = (cars: Array<Car>) => {
    const carsWithMostPoints = cars.filter(
        (car) =>
            car.points ===
            Math.max(
                ...cars.map((c) => {
                    c.winner = false
                    return c.points
                }),
            ),
    )
    const carThatDiedLast = carsWithMostPoints.find(
        (car) => car.position.y === Math.min(...carsWithMostPoints.map((c) => c.position.y)),
    )
    if (carThatDiedLast) {
        carThatDiedLast.winner = true
    }
    return carThatDiedLast
}
