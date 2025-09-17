import Point from './point'
import Shape from './shape'
import Size from './size'

export type DrawableProps = {
    position?: Point
    size?: Size
    direction?: number
    fillStyle?: string | CanvasGradient | CanvasPattern
    strokeStyle?: string | CanvasGradient | CanvasPattern
    ghost?: boolean
}

export default class Drawable {
    protected position: Point
    protected direction: number
    protected size: Size
    protected shape: Shape
    protected fillStyle: string | CanvasGradient | CanvasPattern
    protected strokeStyle: string | CanvasGradient | CanvasPattern
    protected ghost: boolean

    constructor(props: DrawableProps) {
        const { direction, fillStyle, ghost, position, size, strokeStyle } = props
        this.position = position ?? new Point()
        this.size = size ?? new Size(0, 0)
        this.direction = direction ?? 0
        this.fillStyle = fillStyle ?? '#000'
        this.strokeStyle = strokeStyle ?? '#000'
        this.ghost = ghost ?? false
        this.shape = this.createShape()
    }

    protected createShape(): Shape {
        const rad = Math.hypot(this.getSize().getWidth(), this.getSize().getHeight()) / 2
        const alpha = Math.atan2(this.getSize().getWidth(), this.getSize().getHeight())
        const topLeft = new Point(
            //il seno di un angolo si usa per trovare la posizione sulla ascissa, il coseno la posizione sull'ordinata.
            //Dunque il seno della direzione corernte meno l'angolo opposto al vertice del quale dobbiamo trovare x,
            //ci restutisce la x tentendo anche conto della direzione del veicolo.
            //Rad è l'ipotenusa, ovvero la distanza dal vertice sull'angolo di riferimento, il raggio del relativo cerchio.
            //Moltiplicando il raggio per i valori di x ed y che fanno riferimento all'angolo di un cerchio unitario
            //otteniamo le coordinate
            this.position.getX() - Math.sin(this.direction - alpha) * rad,
            this.position.getY() - Math.cos(this.direction - alpha) * rad,
        )
        const topRight = new Point(
            this.position.getX() - Math.sin(this.direction + alpha) * rad,
            this.position.getY() - Math.cos(this.direction + alpha) * rad,
        )
        //Per trovare le coordinate dei vertici inferiori, quelli negativi sull'ordinata, aggiungiamo 3.14 radianti (180 gradi) al calcolo.
        const bottomRight = new Point(
            this.position.getX() - Math.sin(Math.PI + this.direction - alpha) * rad,
            this.position.getY() - Math.cos(Math.PI + this.direction - alpha) * rad,
        )
        const bottomLeft = new Point(
            this.position.getX() - Math.sin(Math.PI + this.direction + alpha) * rad,
            this.position.getY() - Math.cos(Math.PI + this.direction + alpha) * rad,
        )
        return new Shape(topLeft, topRight, bottomRight, bottomLeft)
    }

    beforeDrawing(_context: CanvasRenderingContext2D) {}

    afterDrawing(_context: CanvasRenderingContext2D) {}

    drawInstructions(context: CanvasRenderingContext2D) {
        if (this.ghost) {
            context.globalAlpha = 0.5
        }
        context.beginPath()
        context.fillStyle = this.fillStyle
        context.strokeStyle = this.strokeStyle
        if (this.shape.getPoints().length > 2) {
            const startX = this.shape.getPointAt(0).getX()
            const startY = this.shape.getPointAt(0).getY()
            context.moveTo(startX, startY)
            for (let index = 1; index < this.shape.getPoints().length; index++) {
                const nextX = this.shape.getPointAt(index).getX()
                const nextY = this.shape.getPointAt(index).getY()
                context.lineTo(nextX, nextY)
            }
            context.fill()
        }
        context.globalAlpha = 1
    }

    drawIn(context: CanvasRenderingContext2D) {
        this.beforeDrawing(context)
        this.shape = this.createShape()
        this.drawInstructions(context)
        this.afterDrawing(context)
    }

    // Getters
    getPosition(): Point {
        return this.position
    }

    getDirection(): number {
        return this.direction
    }

    getSize(): Size {
        return this.size
    }

    getShape(): Shape {
        return this.shape
    }

    getFillStyle(): string | CanvasGradient | CanvasPattern {
        return this.fillStyle
    }

    getStrokeStyle(): string | CanvasGradient | CanvasPattern {
        return this.strokeStyle
    }

    isGhost(): boolean {
        return this.ghost
    }

    // Setters
    setPosition(position: Point): void {
        this.position = position
    }

    setDirection(direction: number): void {
        this.direction = direction
    }

    setSize(size: Size): void {
        this.size = size
    }

    setFillStyle(fillStyle: string | CanvasGradient | CanvasPattern): void {
        this.fillStyle = fillStyle
    }

    setStrokeStyle(strokeStyle: string | CanvasGradient | CanvasPattern): void {
        this.strokeStyle = strokeStyle
    }

    setGhost(ghost: boolean): void {
        this.ghost = ghost
    }
}
