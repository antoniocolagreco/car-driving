import Drawable from './Drawable'
import Position from './Position'
import Size from './Size'

export default class Road extends Drawable {
    lanesCount: number
    laneWidth: number
    roadMargins: number
    laneSeparatorWidth: number
    borders: Array<[Position, Position]> = []

    constructor(position: Position, size: Size, lanesCount = 4) {
        super(position, size)
        this.lanesCount = lanesCount
        this.laneWidth = this.size.width / this.lanesCount
        this.roadMargins = 10
        this.laneSeparatorWidth = 5
        const topLeft = new Position(-position.x / 2, -position.y / 2)
        const bottomLeft = new Position(-position.x / 2, position.y / 2)
        const topRight = new Position(position.x / 2, -position.y / 2)
        const bottomRight = new Position(position.x / 2, position.y / 2)
        this.borders.push([topLeft, bottomLeft], [topRight, bottomRight])
    }

    getLaneCenter(index: number) {
        if (index < 0) index = 0
        if (index > this.lanesCount) index = this.lanesCount - 1
        return -this.position.x + (this.laneWidth * index) / 2
    }

    objectDrawingFunction(context: CanvasRenderingContext2D): void {
        const x = -this.size.width / 2
        const y = -this.size.height / 2

        context.fillStyle = 'gray'
        context.fillRect(x - this.roadMargins, y, this.size.width + this.roadMargins * 2, this.size.height)

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
            context.moveTo(x + this.laneWidth * index, y)
            context.lineTo(x + this.laneWidth * index, this.size.height)
        }
        context.stroke()
    }
}
