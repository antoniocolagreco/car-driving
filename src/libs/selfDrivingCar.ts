import { Car } from '../models/Car'
import Map from '../models/Map'
import NeuralNetwork from '../models/NeuralNetwork'
import Point from '../models/Point'
import Road from '../models/Road'
import Sensor from '../models/Sensor'
import Size from '../models/Size'
import Stats from '../models/Stats'
import type Vehicle from '../models/Vehicle'
import Visualizer from '../models/Visualizer'

const BEST_NETWORK_KEY = 'BestNetwork'

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
    let activeCar: Vehicle
    let checkpoint: number
    let interval: NodeJS.Timeout | undefined

    const restart = () => {
        const bestNetwork = loadNetwork()
        cars = generateCars(100, road)
        activeCar = cars[0]
        checkpoint = activeCar.position.y
        clearInterval(interval)
        interval = undefined
        activeCar.fillStyle = 'white'

        if (bestNetwork) {
            activeCar.network = bestNetwork
            if (activeCar.network) {
                for (let index = 1; index < cars.length; index++) {
                    cars[index].network = NeuralNetwork.getMutatedNetwork(activeCar.network, 0.2)
                }
            }
        }

        traffic = generateTraffic(20, road)

        // for (let vehicle of traffic) {
        //     vehicle.controls.forward = true
        // }

        if (networkContext && activeCar.network) {
            Visualizer.drawNetworkIn(networkContext, activeCar.network)
        }
    }

    restart()

    document.querySelector('#save-network')?.addEventListener('click', () => {
        if (!activeCar.network) return
        saveNetwork(activeCar.network)
    })
    document.querySelector('#discard-network')?.addEventListener('click', () => {
        deleteNetwork()
    })
    document.querySelector('#restart-network')?.addEventListener('click', () => {
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

        activeCar.controls.release()
        activeCar.setGhost(true)
        activeCar = getBestCar(cars)

        if (!interval) {
            interval = setInterval(() => {
                const distance = checkpoint - activeCar.position.y
                if (distance < 100) {
                    if (activeCar.network) {
                        saveNetwork(activeCar.network)
                    }
                    restart()
                }
                checkpoint = activeCar.position.y
            }, 5000)
        }

        activeCar.controls.drive()
        activeCar.setGhost(false)

        aliveCars = getAliveCars(cars)
        killLosers(aliveCars, activeCar, 3000)
        if (aliveCars.length <= 1) {
            if (activeCar.network) {
                if (activeCar.network) {
                    saveNetwork(activeCar.network)
                }
                restart()
            }
        }

        for (let car of cars) {
            car.checkCollisions(...road.borders, ...traffic.map((v) => v.shape))
        }

        const translateY = -activeCar.position.y + carCanvas.height * 0.7
        const translateX = carCanvas.width / 2

        carContext.translate(translateX, translateY)

        map.drawIn(carContext)
        road.drawIn(carContext)

        for (let car of cars) {
            car.drawIn(carContext)
        }

        for (let vehicle of traffic) {
            vehicle.checkCollisions(...cars.map((v) => v.shape))
            vehicle.drawIn(carContext)
        }

        carContext.translate(-translateX, -translateY)

        countedFrames += 1
        if (timestamp - lastFpsCountTimestamp > 1000) {
            lastFpsCountTimestamp = timestamp
            currentFps = countedFrames
            countedFrames = 0
        }

        carContext.fillStyle = '#fff'
        carContext.font = '20px monospace'
        carContext.textAlign = 'left'
        carContext.textBaseline = 'bottom'
        carContext.fillText(`CIG: ${aliveCars.length}`, 10, carCanvas.height - 70)
        carContext.fillText(`FPS: ${currentFps}`, 10, carCanvas.height - 50)
        carContext.fillText(`PPS: ${(activeCar.speed * currentFps).toFixed(2)}`, 10, carCanvas.height - 30)
        carContext.fillText(`RPF: ${activeCar.steeringPower.toFixed(2)}`, 10, carCanvas.height - 10)

        if (networkContext && activeCar.network) {
            Visualizer.drawNetworkIn(networkContext, activeCar.network)
        }

        requestAnimationFrame((t) => animate(t))
    }
}

const generateCars = (n: number, road: Road) => {
    const cars = []

    const stats = new Stats({ maxSpeed: 10, acceleration: 0.03, maxReverse: 1, breakPower: 0.1 })

    for (let index = 0; index < n; index++) {
        // const lane = Math.floor(Math.random() * 4)
        const lane = 1
        const position = road.getLanePosition(lane)
        const sensor = new Sensor({ rayCount: 7, rayLength: 500, raySpread: Math.PI / 2 })
        const network = new NeuralNetwork(sensor.rayCount + 1, 10, 5)
        const car = new Car({ position, stats, sensor, network, ghost: true })
        cars.push(car)
    }
    return cars
}

const getAliveCars = (cars: Array<Car>) => cars.filter((c) => !c.damaged)

const getBestCar = (cars: Array<Car>) => {
    const car = cars.find((car) => car.position.y === Math.min(...cars.map((c) => c.position.y)))!
    car.setGhost(false)
    return car
}

const killLosers = (cars: Array<Car>, bestCar: Car, offset = 1000) => {
    for (let car of cars) {
        if (car.position.y - offset > bestCar.position.y) car.crash()
    }
}

const saveNetwork = (network: NeuralNetwork) => {
    localStorage.setItem(BEST_NETWORK_KEY, JSON.stringify(network))
}

const loadNetwork = (): NeuralNetwork | undefined => {
    const network = localStorage.getItem(BEST_NETWORK_KEY)
    if (!network) return undefined
    return JSON.parse(network)
}

const deleteNetwork = () => {
    localStorage.removeItem(BEST_NETWORK_KEY)
}

const generateTraffic = (rowsOfCar: number, road: Road) => {
    let traffic: Array<Vehicle> = []
    const offset = -500

    traffic.push(
        new Car({ position: road.getLanePosition(1, offset) }),
        new Car({ position: road.getLanePosition(0, offset * 2) }),
        new Car({ position: road.getLanePosition(2, offset * 2) }),
        new Car({ position: road.getLanePosition(0, offset * 3) }),
        new Car({ position: road.getLanePosition(1, offset * 3) }),
        new Car({ position: road.getLanePosition(1, offset * 4) }),
        new Car({ position: road.getLanePosition(2, offset * 4) })
    )

    for (let i = 0; i < rowsOfCar; i++) {
        const numberOfCarsPerRow = Math.random() * road.lanesCount - 1
        const lanes = generateUsedLanesPerRow(numberOfCarsPerRow, road)
        for (let j = 0; j < lanes.length; j++) {
            const car = new Car({ position: road.getLanePosition(lanes[j], i * offset + offset * 5) })
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
