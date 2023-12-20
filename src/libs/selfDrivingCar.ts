import { Car } from '../models/Car'

export function init(canvas: HTMLCanvasElement) {
    window.onresize = () => resizeCanvas()

    function resizeCanvas() {
        canvas.width = canvas.parentElement?.clientWidth ?? canvas.width
        canvas.height = canvas.parentElement?.clientHeight ?? canvas.height
    }

    resizeCanvas()

    const ctx = canvas.getContext('2d')
    const car = new Car()
    car.takeControl()

    animate()

    function animate() {
        resizeCanvas()
        car.update()
        car.draw(ctx, { width: canvas.width, height: canvas.height })
        requestAnimationFrame(animate)
    }
}
