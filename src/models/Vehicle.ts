import Controls from './Controls'
import type { Position, Size } from './definitions'

export default class Vehicle {
    position: Position
    size: Size
    controls: Controls = new Controls()

    constructor(size: Size) {
        this.position = { x: 0, y: 0 }
        this.size = size
    }

    update() {
        if (this.controls.forward) {
            this.position.y -= 2
        }
        if (this.controls.reverse) {
            this.position.y += 2
        }
    }

    draw(ctx: CanvasRenderingContext2D | null, canvasSize: Size) {
        if (!ctx) return
        ctx.beginPath()
        ctx.rect(
            canvasSize.width / 2 + this.position.x - this.size.width / 2,
            canvasSize.height / 2 + this.position.y - this.size.height / 2,
            this.size.width,
            this.size.height
        )

        ctx.fill()
    }

    takeControl() {
        this.controls.install()
    }

    releaseControl() {
        this.controls.unistall()
    }
}
