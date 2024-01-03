import Drawable from './Drawable'
import Position from './Position'
import Size from './Size'

export default class Background extends Drawable {
    constructor() {
        super(new Position(0, 0), new Size(1000000, 1000000))
    }

    objectDrawingFunction(context: CanvasRenderingContext2D): void {
        context.fillStyle = 'green'

        context.fillRect(-this.size.width / 2, -this.size.height / 2, this.size.width, this.size.height)
    }
}
