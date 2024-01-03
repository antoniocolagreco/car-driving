import Background from '../models/Background'
import { Car } from '../models/Car'
import Position from '../models/Position'
import Road from '../models/Road'
import Size from '../models/Size'

export function init(canvas: HTMLCanvasElement) {
    window.onresize = () => resizeCanvas()

    function resizeCanvas() {
        canvas.width = canvas.parentElement?.clientWidth ?? canvas.width
        canvas.height = canvas.parentElement?.clientHeight ?? canvas.height
        // canvas.width = 400
        // canvas.height = 400
    }

    resizeCanvas()

    const ctx = canvas.getContext('2d')
    const background = new Background()
    const road = new Road(new Position(0, 0), new Size(300, 1000000))
    const car = new Car(new Position(road.getLaneCenter(0), 0))
    car.controls.drive()

    let framesInterval = 1000 / 60
    let lastFrameTimestamp = 0

    let fpsInterval = 1000
    let lastFpsTimestamp = 0
    let countedFrames = 0
    let fpsLabel = 0

    function animate(timestamp: number) {
        if (!ctx) return

        if (timestamp - lastFrameTimestamp < framesInterval) {
            requestAnimationFrame(animate)
            return
        }
        lastFrameTimestamp = timestamp

        resizeCanvas()

        // ctx.save()

        // ctx.translate(-car.position.x, -car.position.y)

        background.drawIn(ctx)
        road.drawIn(ctx)
        car.drawIn(ctx)
        // ctx.restore()

        countedFrames += 1
        if (timestamp - lastFpsTimestamp >= fpsInterval) {
            lastFpsTimestamp = timestamp
            fpsLabel = countedFrames
            countedFrames = 0
        }

        ctx.fillStyle = '#fff'
        ctx.font = '20px monospace'
        ctx.fillText(`FPS: ${fpsLabel % 60} (frames per second)`, 50, canvas.height - 70)
        ctx.fillText(`Speed: ${Math.abs(car.speed).toFixed(2)} (pixels per frame)`, 50, canvas.height - 50)
        ctx.fillText(`Steering: ${car.steeringPower.toFixed(2)} (radiants per frame)`, 50, canvas.height - 30)

        requestAnimationFrame(animate)
    }

    animate(performance.now())
}
