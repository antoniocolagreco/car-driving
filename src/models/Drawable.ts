import type Position from './Position'
import Size from './Size'

export default class Drawable {
    position: Position
    angle: number
    size: Size
    fillStyle: string | CanvasGradient | CanvasPattern
    strokeStyle: string | CanvasGradient | CanvasPattern

    constructor(
        position: Position,
        size: Size,
        angle?: number,
        fillStyle?: string | CanvasGradient | CanvasPattern,
        strokeStyle?: string | CanvasGradient | CanvasPattern
    ) {
        this.position = position
        this.size = size
        this.angle = angle ?? 0
        this.fillStyle = fillStyle ?? '#000'
        this.strokeStyle = strokeStyle ?? '#000'
    }

    objectDrawingFunction(context: CanvasRenderingContext2D) {}

    drawIn(context: CanvasRenderingContext2D) {
        context.save()
        const centerX = context.canvas.width / 2
        const centerY = context.canvas.height / 2
        context.fillStyle = this.fillStyle
        context.strokeStyle = this.strokeStyle
        context.translate(centerX + this.position.x, centerY + this.position.y)
        context.rotate(this.angle)
        this.objectDrawingFunction(context)

        context.restore()
    }
}
