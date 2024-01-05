import { Car } from '../models/Car'
import Map from '../models/Map'
import Point from '../models/Point'
import Road from '../models/Road'
import Size from '../models/Size'
import Stats from '../models/Stats'
import { getRandomColor } from './utils'

export function init(canvas: HTMLCanvasElement) {
    window.onresize = () => resizeCanvas()

    function resizeCanvas() {
        canvas.width = canvas.parentElement?.clientWidth ?? canvas.width
        canvas.height = canvas.parentElement?.clientHeight ?? canvas.height
    }

    resizeCanvas()

    const ctx = canvas.getContext('2d')
    const map = new Map({ position: new Point(canvas.width / 2, canvas.height / 2), size: new Size(1000000, 1000000) })
    const road = new Road({ position: new Point(map.position.x, map.position.y), size: new Size(300, map.size.height) })

    const myCar = new Car({
        position: new Point(road.getLaneCenter(3), 0),
        stats: new Stats({ maxSpeed: 10, acceleration: 0.03, maxReverse: 1, breakPower: 0.05 }),
        withSensor: true,
    })

    const traffic = [new Car({ position: new Point(road.getLaneCenter(1)), color: getRandomColor() })]

    for (let vehicle of traffic) {
        vehicle.controls.forward = false
    }

    myCar.controls.drive()

    let targetFPS = 60
    let framesInterval = 1000 / targetFPS
    let lastFrameTimestamp = 0

    let lastFpsCountTimestamp = 0
    let countedFrames = 0
    let currentFps = 0

    function animate(timestamp: number) {
        if (!ctx) return

        if (timestamp - lastFrameTimestamp < framesInterval) {
            requestAnimationFrame(animate)
            return
        }
        lastFrameTimestamp = timestamp

        resizeCanvas()

        myCar.checkCollisions(road.borders, [...traffic.map((v) => v.polygon)])

        ctx.save()
        ctx.translate(canvas.width / 2, -myCar.position.y + canvas.height * 0.7)

        map.drawIn(ctx)
        road.drawIn(ctx)
        myCar.drawIn(ctx)

        for (let vehicle of traffic) {
            vehicle.drawIn(ctx)
        }

        ctx.restore()

        countedFrames += 1
        if (timestamp - lastFpsCountTimestamp > 1000) {
            lastFpsCountTimestamp = timestamp
            currentFps = countedFrames
            countedFrames = 0
        }

        ctx.fillStyle = '#fff'
        ctx.font = '20px monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'bottom'
        ctx.fillText(`FPS: ${currentFps}`, 10, canvas.height - 70)
        ctx.fillText(`PPF: ${Math.abs(myCar.speed).toFixed(2)}`, 10, canvas.height - 50)
        ctx.fillText(`PPS: ${Math.abs(myCar.speed * currentFps).toFixed(2)}`, 10, canvas.height - 30)
        ctx.fillText(`RPF: ${myCar.steeringPower.toFixed(2)}`, 10, canvas.height - 10)

        requestAnimationFrame(animate)
    }

    animate(performance.now())
}
