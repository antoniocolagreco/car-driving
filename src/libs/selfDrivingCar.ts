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
    const carContext = carCanvas.getContext('2d')
    const networkContext = networkCanvas.getContext('2d')

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
        size: new Size(1000000, 1000000),
    })
    const road = new Road({ position: new Point(map.position.x, map.position.y), size: new Size(300, map.size.height) })

    const myPosition = new Point(road.getLaneCenter(1), 0)
    const myStats = new Stats({ maxSpeed: 10, acceleration: 0.03, maxReverse: 1, breakPower: 0.05 })
    const mySensor = new Sensor({ rayCount: 5, rayLength: 400, raySpread: Math.PI / 2 })
    const myDriver = new NeuralNetwork(5, 6, 5)
    const myCar = new Car({ position: myPosition, stats: myStats, sensor: mySensor, driver: myDriver })

    const traffic = [
        new Car({ position: new Point(road.getLaneCenter(0), -2000), direction: Math.PI }),
        new Car({ position: new Point(road.getLaneCenter(1), -1000), direction: Math.PI }),
        new Car({ position: new Point(road.getLaneCenter(2), 2000) }),
        new Car({ position: new Point(road.getLaneCenter(3), 1000) }),
    ]

    for (let vehicle of traffic) {
        vehicle.controls.forward = true
    }

    myCar.controls.drive()

    let targetFPS = 60
    let framesInterval = 1000 / targetFPS
    let lastFrameTimestamp = 0

    let lastFpsCountTimestamp = 0
    let countedFrames = 0
    let currentFps = 0

    function animate(timestamp: number) {
        if (!carContext) return

        if (timestamp - lastFrameTimestamp < framesInterval) {
            requestAnimationFrame(animate)
            return
        }
        lastFrameTimestamp = timestamp

        resizeCanvas()

        myCar.checkCollisions(...road.borders, ...traffic.map((v) => v.shape))

        const translateY = -myCar.position.y + carCanvas.height * 0.7
        const translateX = carCanvas.width / 2

        carContext.translate(translateX, translateY)

        map.drawIn(carContext)
        road.drawIn(carContext)
        myCar.drawIn(carContext)

        for (let vehicle of traffic) {
            vehicle.checkCollisions(myCar.shape)
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
        carContext.fillText(`FPS: ${currentFps}`, 10, carCanvas.height - 70)
        carContext.fillText(`PPF: ${Math.abs(myCar.speed).toFixed(2)}`, 10, carCanvas.height - 50)
        carContext.fillText(`PPS: ${Math.abs(myCar.speed * currentFps).toFixed(2)}`, 10, carCanvas.height - 30)
        carContext.fillText(`RPF: ${myCar.steeringPower.toFixed(2)}`, 10, carCanvas.height - 10)

        if (networkContext && myCar.driver) {
            Visualizer.drawNetworkIn(networkContext, myCar.driver)
        }

        requestAnimationFrame(animate)
    }

    animate(performance.now())
}
