import { Car } from '../models/Car'
import Position from '../models/Position'

export function init(canvas: HTMLCanvasElement) {
    window.onresize = () => resizeCanvas()

    function resizeCanvas() {
        canvas.width = canvas.parentElement?.clientWidth ?? canvas.width
        canvas.height = canvas.parentElement?.clientHeight ?? canvas.height
    }

    resizeCanvas()

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const car = new Car(ctx, new Position(0, 0))
    car.controls.drive()

    animate()

    function animate() {
        resizeCanvas()
        car.update()
        car.draw()
        requestAnimationFrame(animate)
    }
}
