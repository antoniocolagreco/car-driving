import Drawable, { type DrawableProps } from './drawable'

export default class Map extends Drawable {
    constructor(props: DrawableProps) {
        super(props)
    }

    drawInstructions(context: CanvasRenderingContext2D): void {
        context.fillStyle = 'green'
        context.fillRect(
            -(this.size.getWidth() / 2),
            -(this.size.getHeight() / 2),
            this.size.getWidth(),
            this.size.getHeight(),
        )
    }
}
