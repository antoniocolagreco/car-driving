import Drawable, { type DrawableProps } from './drawable'

export default class Map extends Drawable {
    constructor(props: DrawableProps) {
        super(props)
    }

    drawInstructions(context: CanvasRenderingContext2D): void {
        context.fillStyle = 'green'
        context.fillRect(
            -(this.size.width / 2),
            -(this.size.height / 2),
            this.size.width,
            this.size.height,
        )
    }
}
