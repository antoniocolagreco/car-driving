import { Car } from '../models/Car'
import Features from '../models/Features'
import Map from '../models/Map'
import NeuralNetwork from '../models/NeuralNetwork'
import Point from '../models/Point'
import Road from '../models/Road'
import Sensor from '../models/Sensor'
import Size from '../models/Size'
import type Vehicle from '../models/Vehicle'
import Visualizer from '../models/Visualizer'

const BEST_NETWORK_KEY = 'BestNetwork'
const BACKUP_NETWORK_KEY = 'BackupNetwork'
const MUTATION_RATE_KEY = 'MutationRate'
const NUMBER_OF_CARS_KEY = 'NumberOfCars'
const DEATH_TIMER = 15000

export function init(container: HTMLElement) {
    const carCanvas = document.createElement('canvas')
    const networkCanvas = document.createElement('canvas')
    const carContext = carCanvas.getContext('2d', { alpha: false })
    const networkContext = networkCanvas.getContext('2d', { alpha: false })

    container.appendChild(carCanvas)
    container.appendChild(networkCanvas)

    window.onresize = () => resizeCanvas()

    function resizeCanvas() {
        container.style.display = 'grid'
        if (container.clientWidth > 699) {
            container.style.gridTemplateColumns = '1fr 1fr'
            carCanvas.width = container.clientWidth / 2
            carCanvas.height = container.clientHeight
            networkCanvas.width = container.clientWidth / 2
            networkCanvas.height = container.clientHeight
        } else {
            container.style.gridTemplateColumns = '1fr'
            carCanvas.width = container.clientWidth
            carCanvas.height = container.clientHeight / 2
            networkCanvas.width = container.clientWidth
            networkCanvas.height = container.clientHeight / 2
        }
    }

    resizeCanvas()

    const map = new Map({
        position: new Point(carCanvas.width / 2, carCanvas.height / 2),
        size: new Size(1000, 100000),
    })
    const road = new Road({
        position: new Point(carCanvas.width / 2, carCanvas.height / 2),
        size: new Size(240, map.size.height),
        lanesCount: 3,
    })

    let cars: Array<Vehicle> = []
    let traffic: Array<Vehicle> = []
    let aliveCars: Array<Vehicle> = []
    let activeCar: Vehicle | undefined
    let bestCar: Vehicle | undefined
    let activeCarPositionCheckpoint: number
    let notIdleVehicleCheckInterval: NodeJS.Timeout | undefined
    let mutationRate = loadMutationRate() ?? 0.2
    let numberOfCars = loadNumberOfCars() ?? 50
    let totalFrames: number = 0
    let trafficCounter = 0
    let deathTimer: NodeJS.Timeout

    const restart = () => {
        const bestNetwork = loadNetwork()
        clearInterval(deathTimer)
        cars = generateCars(numberOfCars, road)
        activeCar = cars[0]
        activeCarPositionCheckpoint = activeCar.position.y
        clearInterval(notIdleVehicleCheckInterval)
        notIdleVehicleCheckInterval = undefined
        activeCar.fillStyle = 'white'

        if (bestNetwork) {
            activeCar.network = bestNetwork
            if (activeCar.network) {
                for (let index = 1; index < cars.length; index++) {
                    cars[index].network = NeuralNetwork.getMutatedNetwork(activeCar.network, mutationRate)
                }
            }
        }

        traffic = generateTraffic(20, road)

        deathTimer = setTimeout(() => checkLosers(cars, traffic, trafficCounter, getActiveCar, deathTimer), DEATH_TIMER)

        for (let vehicle of traffic) {
            vehicle.controls.forward = true
        }

        if (networkContext && activeCar.network) {
            Visualizer.drawNetworkIn(networkContext, activeCar.network)
        }
    }

    restart()

    const mutationRange = document.querySelector('#mutation-rate') as HTMLInputElement
    const numberOfCarsRange = document.querySelector('#number-of-cars') as HTMLInputElement
    const mutationValue = document.querySelector('#mutation-rate-value') as HTMLSpanElement
    const numberOfCarsValue = document.querySelector('#number-of-cars-value') as HTMLSpanElement

    mutationValue.innerText = `${Math.round(mutationRate * 100)}%`
    mutationRange.value = `${mutationRate * 100}`
    numberOfCarsValue.innerText = String(numberOfCars)
    numberOfCarsRange.value = `${numberOfCars}`

    mutationRange.addEventListener('input', () => {
        const value = Number(mutationRange.value)
        mutationValue.innerText = `${value}%`
        mutationRate = value / 100
        saveMutationRate(mutationRate)
    })
    numberOfCarsRange.addEventListener('input', () => {
        numberOfCarsValue.innerText = numberOfCarsRange.value
        numberOfCars = Number(numberOfCarsRange.value)
        saveNumberOfCars(numberOfCars)
    })

    document.querySelector('#save-network')?.addEventListener('click', () => {
        if (!activeCar || !activeCar.network) return
        backupNetwork(activeCar.network)
    })
    document.querySelector('#restore-network')?.addEventListener('click', () => {
        restoreNetwork()
        restart()
    })
    document.querySelector('#reset-network')?.addEventListener('click', () => {
        resetNetwork()
        restart()
    })
    document.querySelector('#restart-network')?.addEventListener('click', () => {
        restart()
    })
    document.querySelector('#evolve-network')?.addEventListener('click', () => {
        if (!bestCar || !bestCar.network) return
        saveNetwork(bestCar.network)
        restart()
    })

    let targetFPS = 60
    let framesInterval = 1000 / targetFPS
    let lastFrameTimestamp = 0

    let lastFpsCountTimestamp = 0
    let countedFrames = 0
    let currentFps = 0

    requestAnimationFrame(animate)

    function animate(timestamp: number) {
        if (!carContext) return

        if (timestamp - lastFrameTimestamp < framesInterval) {
            requestAnimationFrame(animate)
            return
        }
        lastFrameTimestamp = timestamp

        resizeCanvas()

        activeCar?.controls.release()
        activeCar?.setGhost(true)

        activeCar = getActiveCar(cars)
        bestCar = getBestCar(cars)

        // if (!interval) {
        //     interval = setInterval(() => {
        //         const distance = checkpoint - activeCar.position.y
        //         if (distance < 100) {
        //             if (activeCar.network) {
        //                 saveNetwork(activeCar.network)
        //             }
        //             restart()
        //         }
        //         checkpoint = activeCar.position.y
        //     }, 5000)
        // }

        // activeCar.controls.drive()
        activeCar?.setGhost(false)

        aliveCars = getAliveCars(cars)
        if (aliveCars.length === 0) {
            if (bestCar && bestCar.network) {
                if (bestCar.network) {
                    saveNetwork(bestCar.network)
                }
            }
            restart()
        }

        for (let car of cars) {
            car.updateStatus(traffic, road.borders)
        }

        const translateY = activeCar ? -activeCar.position.y + carCanvas.height * 0.7 : traffic[0].position.y
        const translateX = carCanvas.width / 2
        carContext.translate(translateX, translateY)

        map.drawIn(carContext)
        road.drawIn(carContext)

        for (let car of cars) {
            car.drawIn(carContext)
        }

        for (let vehicle of traffic) {
            vehicle.updateStatus(traffic, road.borders)
            vehicle.drawIn(carContext)
        }

        carContext.translate(-translateX, -translateY)

        countedFrames += 1
        if (timestamp - lastFpsCountTimestamp > 1000) {
            lastFpsCountTimestamp = timestamp
            currentFps = countedFrames
            countedFrames = 0
        }

        if (activeCar) {
            carContext.fillStyle = '#fff'
            carContext.font = '20px monospace'
            carContext.textAlign = 'left'
            carContext.textBaseline = 'bottom'
            carContext.fillText(` ID: ${activeCar.network?.id}`, 10, carCanvas.height - 130)
            carContext.fillText(`PTS: ${activeCar.points}`, 10, carCanvas.height - 110)
            carContext.fillText(`SRS: ${activeCar.network?.survivedRounds}`, 10, carCanvas.height - 90)
            carContext.fillText(`CRS: ${aliveCars.length}`, 10, carCanvas.height - 70)
            carContext.fillText(`FPS: ${currentFps}`, 10, carCanvas.height - 50)
            carContext.fillText(`PPS: ${(activeCar.speed * currentFps).toFixed(2)}`, 10, carCanvas.height - 30)
            carContext.fillText(`RPS: ${(activeCar.steeringPower * currentFps).toFixed(2)}`, 10, carCanvas.height - 10)
        }

        if (networkContext && activeCar && activeCar.network) {
            Visualizer.drawNetworkIn(networkContext, activeCar.network)
        }

        totalFrames += 1
        requestAnimationFrame((t) => animate(t))
    }
}

const generateCars = (n: number, road: Road) => {
    const cars = []

    const features = new Features({ maxSpeed: 7, acceleration: 0.03, maxReverse: 1, breakPower: 0.2 })

    for (let index = 0; index < n; index++) {
        // const lane = Math.floor(Math.random() * 4)
        const lane = 1
        const position = road.getLanePosition(lane)
        const sensor = new Sensor({ rayCount: 7, rayLength: 500, raySpread: Math.PI / 4 })
        const network = new NeuralNetwork(sensor.rayCount + 1, 10, 5)
        const car = new Car({ position, features, sensor, network, ghost: true })
        cars.push(car)
    }
    return cars
}

const getAliveCars = (cars: Array<Car>) => cars.filter((c) => !c.damaged)

const getActiveCar = (cars: Array<Car>) => {
    // const car = cars.find((c) => c.points === Math.max(...cars.map((c) => c.points)))!
    const car = cars.find((car) => car.position.y === Math.min(...cars.map((c) => c.position.y)))

    // let car: Car = cars[0]
    // let record = 0

    // for (let i = 0; i < cars.length; i++) {
    //     const points = car.position.y * car.aliveFor
    //     if (points > record) {
    //         car = cars[i]
    //         record = points
    //         console.log(points, record)
    //     }
    // }
    if (car) {
        car.setGhost(false)
    }
    return car
}

const getBestCar = (cars: Array<Car>) => {
    const carsWithMostPoints = cars.filter((car) => car.points === Math.max(...cars.map((c) => c.points)))
    const carThatDiedLast = carsWithMostPoints.find(
        (car) => car.position.y === Math.min(...cars.map((c) => c.position.y))
    )
    console.log(`Winner is ${carThatDiedLast?.network?.id} with ${carThatDiedLast?.points} points`)
    return carThatDiedLast
}

const checkLosers = (
    cars: Array<Car>,
    traffic: Array<Car>,
    trafficCounter: number,
    getActiveCar: (cars: Array<Car>) => Car | undefined,
    deathTimer: NodeJS.Timeout
) => {
    const bestCar = getActiveCar(cars)

    cars.forEach((car) => {
        if (car.position.y > traffic[trafficCounter].position.y) car.crash()
        if (bestCar) {
            if (car.position.y - 5000 > bestCar.position.y) car.crash()
        }
    })
    trafficCounter += 1
    deathTimer = setTimeout(() => checkLosers(cars, traffic, trafficCounter, getActiveCar, deathTimer), DEATH_TIMER)
}

const saveNetwork = (network: NeuralNetwork) => {
    network.survivedRounds += 1
    localStorage.setItem(BEST_NETWORK_KEY, JSON.stringify(network))
}

const backupNetwork = (network: NeuralNetwork) => {
    localStorage.setItem(BACKUP_NETWORK_KEY, JSON.stringify(network))
}

const restoreNetwork = () => {
    const networkString = localStorage.getItem(BACKUP_NETWORK_KEY)
    if (networkString) {
        const network = JSON.parse(networkString)
        saveNetwork(network)
    }
}

const resetNetwork = () => {
    localStorage.removeItem(BEST_NETWORK_KEY)
}

const loadNetwork = (): NeuralNetwork | undefined => {
    const network = localStorage.getItem(BEST_NETWORK_KEY)
    if (!network) return undefined
    return JSON.parse(network)
}

const generateTraffic = (rowsOfCar: number, road: Road) => {
    let traffic: Array<Vehicle> = []
    const offset = -250
    const firstBatch = Math.floor(rowsOfCar / 2)

    traffic.push(
        new Car({ color: 'black', position: road.getLanePosition(1, offset * 1) }),

        new Car({ color: 'black', position: road.getLanePosition(0, offset * 2) }),

        new Car({ color: 'black', position: road.getLanePosition(2, offset * 3) }),

        new Car({ color: 'black', position: road.getLanePosition(1, offset * 4) }),

        new Car({ color: 'black', position: road.getLanePosition(2, offset * 5) }),

        new Car({ color: 'black', position: road.getLanePosition(0, offset * 6) }),

        new Car({ color: 'black', position: road.getLanePosition(0, offset * 7) }),
        new Car({ color: 'black', position: road.getLanePosition(1, offset * 7 - 50) }),

        new Car({ color: 'black', position: road.getLanePosition(1, offset * 8 - 50) }),
        new Car({ color: 'black', position: road.getLanePosition(2, offset * 8) }),

        new Car({ color: 'black', position: road.getLanePosition(0, offset * 9) }),

        new Car({ color: 'black', position: road.getLanePosition(1, offset * 10 - 50) }),
        new Car({ color: 'black', position: road.getLanePosition(2, offset * 10) }),

        new Car({ color: 'black', position: road.getLanePosition(0, offset * 11) }),
        new Car({ color: 'black', position: road.getLanePosition(2, offset * 11) })
    )
    for (let i = 0; i < rowsOfCar; i++) {
        const numberOfCarsPerRow = Math.random() * (road.lanesCount - 1)
        const lanes = generateUsedLanesPerRow(numberOfCarsPerRow, road)
        for (let j = 0; j < lanes.length; j++) {
            const car = new Car({ color: 'black', position: road.getLanePosition(lanes[j], i * offset + offset * 12) })
            traffic.push(car)
        }
    }

    return traffic
}

const generateUsedLanesPerRow = (n: number, road: Road) => {
    const lanes: Array<number> = []
    let lanesToAdd = 0
    while (lanesToAdd < n) {
        const lane = Math.floor(Math.random() * road.lanesCount)
        if (!lanes.includes(lane)) {
            lanes.push(lane)
            lanesToAdd += 1
        }
    }
    return lanes
}

const loadMutationRate = (): number | undefined => {
    const mutationRate = localStorage.getItem(MUTATION_RATE_KEY)
    if (!mutationRate) return undefined
    return JSON.parse(mutationRate)
}

const saveMutationRate = (mutationRate: number) => {
    localStorage.setItem(MUTATION_RATE_KEY, mutationRate.toString())
}

const loadNumberOfCars = (): number | undefined => {
    const mutationRate = localStorage.getItem(NUMBER_OF_CARS_KEY)
    if (!mutationRate) return undefined
    return JSON.parse(mutationRate)
}

const saveNumberOfCars = (numberOfCars: number) => {
    localStorage.setItem(NUMBER_OF_CARS_KEY, numberOfCars.toString())
}
