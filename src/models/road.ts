import Drawable, { type DrawableProps } from './drawable'
import Point from './point'
import Shape from './shape'

export type RoadProps = Omit<DrawableProps, 'fillStyle' | 'strokeStyle'> & {
    lanesCount?: number
    oneWay?: boolean
}

export default class Road extends Drawable {
    lanesCount: number
    laneWidth: number
    roadMargins: number
    laneSeparatorWidth: number
    oneWay: boolean | undefined
    borders: Shape[] = []

    constructor(props: RoadProps) {
        const { lanesCount, oneWay, ...otherProps } = props
        super(otherProps)
        this.lanesCount = lanesCount ?? 4
        this.laneWidth = this.size.width / this.lanesCount
        this.roadMargins = 10
        this.laneSeparatorWidth = 5
        this.oneWay = oneWay
        const topLeft = new Point(-this.size.width / 2, -this.size.height / 2)
        const bottomLeft = new Point(-this.size.width / 2, this.size.height)
        const topRight = new Point(this.size.width / 2, -this.size.height / 2)
        const bottomRight = new Point(this.size.width / 2, this.size.height)
        this.borders.push(new Shape(topLeft, bottomLeft), new Shape(topRight, bottomRight))
    }

    getLanePosition(index: number, offset = 0) {
        if (index < 0) index = 0
        if (index + 1 > this.lanesCount) index = this.lanesCount - 1

        const x = -(this.size.width / 2) + (this.laneWidth * (index + 1) - this.laneWidth / 2)

        return new Point(x, Math.floor(this.size.height / 2) - 5000 + offset)
    }

    drawInstructions(context: CanvasRenderingContext2D): void {
        const x = -(this.size.width / 2)
        const y = -(this.size.height / 2)

        context.fillStyle = 'gray'
        context.fillRect(
            x - this.roadMargins,
            y,
            this.size.width + this.roadMargins * 2,
            this.size.height,
        )

        context.strokeStyle = 'white'
        context.lineWidth = this.laneSeparatorWidth

        context.beginPath()
        context.moveTo(x, y)
        context.lineTo(x, this.size.height)
        context.moveTo(x + this.size.width, y)
        context.lineTo(x + this.size.width, this.size.height)
        context.stroke()

        context.setLineDash([20, 10])
        context.beginPath()
        for (let index = 1; index < this.lanesCount; index++) {
            if (this.lanesCount) context.moveTo(x + this.laneWidth * index, y)
            context.lineTo(x + this.laneWidth * index, this.size.height)
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
}
