import Point from './Point'
import Shape from './Shape'
import Size from './Size'

export type DrawableProps = {
    position?: Point
    size?: Size
    direction?: number
    fillStyle?: string | CanvasGradient | CanvasPattern
    strokeStyle?: string | CanvasGradient | CanvasPattern
}

export default class Drawable {
    position: Point
    direction: number
    size: Size
    shape: Shape
    fillStyle: string | CanvasGradient | CanvasPattern
    strokeStyle: string | CanvasGradient | CanvasPattern

    constructor(props: DrawableProps) {
        this.position = props.position ?? new Point()
        this.size = props.size ?? new Size(0, 0)
        this.direction = props.direction ?? 0
        this.fillStyle = props.fillStyle ?? '#000'
        this.strokeStyle = props.strokeStyle ?? '#000'
        this.shape = this.#createShape()
    }

    #createShape(): Shape {
        const rad = Math.hypot(this.size.width, this.size.height) / 2
        const alpha = Math.atan2(this.size.width, this.size.height)
        const topLeft = new Point(
            //il seno di un angolo si usa per trovare la posizione sulla ascissa, il coseno la posizione sull'ordinata.
            //Dunque il seno della direzione corernte meno l'angolo opposto al vertice del quale dobbiamo trovare x,
            //ci restutisce la x tentendo anche conto della direzione del veicolo.
            //Rad è l'ipotenusa, ovvero la distanza dal vertice sull'angolo di riferimento, il raggio del relativo cerchio.
            //Moltiplicando il raggio per i valori di x ed y che fanno riferimento all'angolo di un cerchio unitario
            //otteniamo le coordinate
            this.position.x - Math.sin(this.direction - alpha) * rad,
            this.position.y - Math.cos(this.direction - alpha) * rad
        )
        const topRight = new Point(
            this.position.x - Math.sin(this.direction + alpha) * rad,
            this.position.y - Math.cos(this.direction + alpha) * rad
        )
        //Per trovare le coordinate dei vertici inferiori, quelli negativi sull'ordinata, aggiungiamo 3.14 radianti (180 gradi) al calcolo.
        const bottomRight = new Point(
            this.position.x - Math.sin(Math.PI + this.direction - alpha) * rad,
            this.position.y - Math.cos(Math.PI + this.direction - alpha) * rad
        )
        const bottomLeft = new Point(
            this.position.x - Math.sin(Math.PI + this.direction + alpha) * rad,
            this.position.y - Math.cos(Math.PI + this.direction + alpha) * rad
        )
        return new Shape(topLeft, topRight, bottomRight, bottomLeft)
    }

    beforeDrawing(context: CanvasRenderingContext2D) {}

    drawInstructions(context: CanvasRenderingContext2D) {
        context.beginPath()
        context.fillStyle = this.fillStyle
        context.strokeStyle = this.strokeStyle
        if (this.shape.points.length > 2) {
            const startPoint = this.shape.points.at(0)!
            context.moveTo(startPoint.x, startPoint.y)
            for (let index = 1; index < this.shape.points.length; index++) {
                context.lineTo(this.shape.points[index].x, this.shape.points[index].y)
            }
            context.fill()
        }
    }

    drawIn(context: CanvasRenderingContext2D) {
        this.beforeDrawing(context)
        this.shape = this.#createShape()
        this.drawInstructions(context)
    }
}
