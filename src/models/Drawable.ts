import type Position from './Position'
import type Size from './Size'

export default class Drawable {
    context: CanvasRenderingContext2D
    position: Position
    angle: number
    size: Size

    constructor(context: CanvasRenderingContext2D, position: Position, size: Size) {
        this.context = context
        this.position = position
        this.size = size
        this.angle = 0
    }

    nextPosition(x: number, y: number) {
        this.position.x = x
        this.position.y = y
    }

    draw() {
        this.context.save()
        const centerX = this.context.canvas.width / 2
        const centerY = this.context.canvas.height / 2
        this.context.translate(centerX + this.position.x, centerY + this.position.y)
        this.context.rotate(this.angle)

        this.context.beginPath()

        this.context.rect(-this.size.width / 2, -this.size.height / 2, this.size.width, this.size.height)
        this.context.fill()
        this.context.restore()
    }
}
