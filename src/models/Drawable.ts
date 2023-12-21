import type Position from './Position'
import type Size from './Size'

export default class Drawable {
    context: CanvasRenderingContext2D
    position: Position
    size: Size

    constructor(context: CanvasRenderingContext2D, position: Position, size: Size) {
        this.context = context
        this.position = position
        this.size = size
    }

    nextPosition(x: number, y: number) {
        this.position.x = x
        this.position.y = y
    }

    draw() {
        this.context.beginPath()
        const canvasWidth = this.context.canvas.width
        const canvasHeight = this.context.canvas.height

        this.context.rect(
            canvasWidth / 2 + this.position.x - this.size.width / 2,
            canvasHeight / 2 + this.position.y - this.size.height / 2,
            this.size.width,
            this.size.height
        )
        this.context.fill()
    }
}
