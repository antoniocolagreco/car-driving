import { getIntersection } from '../libs/utils'
import Collision from './Collision'
import Drawable, { type DrawableProps } from './Drawable'
import Point from './Point'
import Shape from './Shape'

export type SensorProps = Omit<DrawableProps, 'fillStyle' | 'strokeStyle' | 'size'> & {
    rayCount: number
    rayLength: number
    raySpread: number
}

export default class Sensor extends Drawable {
    rayCount: number
    rayLength: number
    raySpread: number
    rays: Array<Shape>
    collisions: Array<Collision | null>

    constructor(props: SensorProps) {
        const { rayCount, rayLength, raySpread, ...otherProps } = props
        super(otherProps)
        this.rayCount = rayCount
        this.rayLength = rayLength
        this.raySpread = raySpread
        this.rays = []
        this.collisions = []
    }

    syncDirection(direction: number) {
        this.direction = direction
    }

    checkCollisions(obstacles: Array<Shape>) {
        this.collisions.length = 0
        for (let ray of this.rays) {
            this.collisions.push(this.#getReading(ray, obstacles))
        }
    }

    #getReading(ray: Shape, obstacles: Array<Shape>): Collision | null {
        const touches: Array<Collision> = []

        const flattedObstacles = obstacles.map((o) => o.toArrayOfLines()).flat(2)

        for (let obstacle of flattedObstacles) {
            const touch: Collision | null = getIntersection(ray, obstacle)
            if (touch) {
                touches.push(touch)
            }
        }
        if (touches.length === 0) return null
        const offsets = touches.map((touch) => touch.offset)
        const minOffset = Math.min(...offsets)
        return touches.find((touch) => touch.offset === minOffset)!
    }

    #castRays() {
        this.rays.length = 0
        const rayRadiants = this.rayCount > 1 ? this.raySpread / (this.rayCount - 1) : 0

        for (let index = 0; index < this.rayCount; index++) {
            const rayDirection = -(this.raySpread / 2) + rayRadiants * index

            const start = new Point(this.position.x, this.position.y)
            const end = new Point(
                this.position.x - Math.sin(rayDirection + this.direction) * this.rayLength,
                this.position.y - Math.cos(rayDirection + this.direction) * this.rayLength
            )

            this.rays.push(new Shape(start, end))
        }
    }

    drawInstructions(context: CanvasRenderingContext2D): void {
        this.#castRays()

        for (let i = 0; i < this.rayCount; i++) {
            const start = this.rays[i].getFirst()
            const collision = this.collisions[i]?.position ?? null
            const end = this.rays[i].getLast()

            if (collision) {
                context.beginPath()
                context.fillStyle = 'red'
                context.arc(collision.x, collision.y, 3, 0, 2 * Math.PI)
                context.fill()

                context.beginPath()
                context.strokeStyle = 'yellow'
                context.setLineDash([1, 5])
                context.lineWidth = 1
                context.moveTo(start.x, start.y)
                context.lineTo(collision.x, collision.y)
                context.stroke()
            } else {
                context.beginPath()
                context.lineWidth = 1
                context.setLineDash([1, 5])
                context.strokeStyle = 'yellow'
                context.moveTo(start.x, start.y)
                context.lineTo(end.x, end.y)
                context.stroke()
            }
        }
    }
}
