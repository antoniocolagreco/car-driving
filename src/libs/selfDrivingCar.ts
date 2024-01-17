import { Car } from '../models/Car'
import Map from '../models/Map'
import NeuralNetwork from '../models/NeuralNetwork'
import Point from '../models/Point'
import Road from '../models/Road'
import Sensor from '../models/Sensor'
import Size from '../models/Size'
import Stats from '../models/Stats'
import Visualizer from '../models/Visualizer'

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
        size: new Size(300, map.size.height),
    })

    const cars = generateCars(100, road)

    let activeCar = cars[0]

    const traffic = [
        new Car({ position: road.getLanePosition(0, -250) }),
        new Car({ position: road.getLanePosition(1, -500) }),
        new Car({ position: road.getLanePosition(2, -750) }),
        new Car({ position: road.getLanePosition(3, -1000) }),
    ]

    console.log(traffic)

    for (let vehicle of traffic) {
        vehicle.controls.forward = true
    }

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

        activeCar.sensor!.visibleRays = false
        activeCar.controls.release()
        activeCar = getBestCar(cars)
        activeCar.controls.drive()

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
            for (let vehicle of traffic) {
                vehicle.checkCollisions(car.shape)
                vehicle.drawIn(carContext)
            }
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
        carContext.fillText(`FPS: ${currentFps}`, 10, carCanvas.height - 70)
        carContext.fillText(`PPF: ${Math.abs(activeCar.speed).toFixed(2)}`, 10, carCanvas.height - 50)
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

    const stats = new Stats({ maxSpeed: 10, acceleration: 0.03, maxReverse: 1, breakPower: 0.05 })

    for (let index = 0; index < n; index++) {
        const position = road.getLanePosition(Math.floor(Math.random() * 4))
        const sensor = new Sensor({ rayCount: 5, rayLength: 400, raySpread: Math.PI / 2 })
        const network = new NeuralNetwork(sensor.rayCount + 1, 6, 5)
        const car = new Car({ position, stats, sensor, network })
        cars.push(car)
    }
    return cars
}

const getBestCar = (cars: Array<Car>) => {
    const car = cars.find((car) => car.position.y === Math.min(...cars.map((c) => c.position.y)))!
    car.sensor!.visibleRays = true
    return car
}

const saveNetwork = (network: NeuralNetwork) => {
    localStorage.setItem('best-network', JSON.stringify(network))
}

const deleteNetwork = () => {
    localStorage.removeItem('best-network')
}
