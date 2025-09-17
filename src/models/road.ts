import Drawable, { type DrawableProps } from './drawable'
import Point from './point'
import Shape from './shape'

export type RoadProps = Omit<DrawableProps, 'fillStyle' | 'strokeStyle'> & {
    laneCount?: number
    oneWay?: boolean
}

export default class Road extends Drawable {
    private laneCount: number
    private laneWidth: number
    private roadMargins: number
    private laneSeparatorWidth: number
    // private oneWay: boolean | undefined //TODO: two ways road
    private borders: Shape[] = []

    constructor(props: RoadProps) {
        const {
            laneCount,
            //  oneWay,
            ...otherProps
        } = props
        super(otherProps)
        this.laneCount = laneCount ?? 4
        this.laneWidth = this.size.getWidth() / this.laneCount
        this.roadMargins = 10
        this.laneSeparatorWidth = 5
        // this.oneWay = oneWay
        const topLeft = new Point(-this.size.getWidth() / 2, -this.size.getHeight() / 2)
        const bottomLeft = new Point(-this.size.getWidth() / 2, this.size.getHeight())
        const topRight = new Point(this.size.getWidth() / 2, -this.size.getHeight() / 2)
        const bottomRight = new Point(this.size.getWidth() / 2, this.size.getHeight())
        this.borders.push(new Shape(topLeft, bottomLeft), new Shape(topRight, bottomRight))
    }

    getLanePosition(index: number, offset = 0) {
        if (index < 0) {
            index = 0
        }
        if (index + 1 > this.laneCount) {
            index = this.laneCount - 1
        }

        const x = -(this.size.getWidth() / 2) + (this.laneWidth * (index + 1) - this.laneWidth / 2)

        return new Point(x, Math.floor(this.size.getHeight() / 2) - 5000 + offset)
    }

    drawInstructions(context: CanvasRenderingContext2D): void {
        const x = -(this.size.getWidth() / 2)
        const y = -(this.size.getHeight() / 2)

        context.fillStyle = 'gray'
        context.fillRect(
            x - this.roadMargins,
            y,
            this.size.getWidth() + this.roadMargins * 2,
            this.size.getHeight(),
        )

        context.strokeStyle = 'white'
        context.lineWidth = this.laneSeparatorWidth

        context.beginPath()
        context.moveTo(x, y)
        context.lineTo(x, this.size.getHeight())
        context.moveTo(x + this.size.getWidth(), y)
        context.lineTo(x + this.size.getWidth(), this.size.getHeight())
        context.stroke()

        context.setLineDash([20, 10])
        context.beginPath()
        for (let index = 1; index < this.laneCount; index++) {
            if (this.laneCount) {
                context.moveTo(x + this.laneWidth * index, y)
            }
            context.lineTo(x + this.laneWidth * index, this.size.getHeight())
        }
        context.stroke()

        // context.lineWidth = 3
        // context.strokeStyle = 'red'
        // for (let b of this.borders) {
        //     context.beginPath()
        //     context.setLineDash([])
        //     context.moveTo(b.start.x, b.start.y)
        //     context.lineTo(b.end.x, b.end.y)
        //     context.stroke()
        // }
    }

    getLaneCount = () => this.laneCount

    getBorders(): Shape[] {
        return this.borders
    }
}
