import { getIntersection } from '../libs/utils'
import type Collision from './collision'
import Drawable, { type DrawableProps } from './drawable'
import Point from './point'
import Shape from './shape'

export type SensorProps = Omit<DrawableProps, 'fillStyle' | 'strokeStyle' | 'size'> & {
    rayCount: number
    rayLength: number
    raySpread: number
    visibleRays?: boolean
}

export default class Sensor extends Drawable {
    private rayCount: number
    private rayLength: number
    private raySpread: number
    private rays: Array<Shape>
    private raysAngle: Array<number>
    private collisions: Array<Collision | null>
    private visibleRays: boolean

    constructor(props: SensorProps) {
        const { rayCount, rayLength, raySpread, visibleRays, ...otherProps } = props
        super(otherProps)
        this.rayCount = rayCount
        this.rayLength = rayLength
        this.raySpread = raySpread
        this.rays = []
        this.raysAngle = []
        this.collisions = []
        this.visibleRays = visibleRays ?? false
    }

    syncDirection(direction: number) {
        this.direction = direction
    }

    checkCollisions(obstacles: Array<Shape>) {
        this.collisions.length = 0
        for (let ray of this.rays) {
            this.collisions.push(this.getReading(ray, obstacles))
        }
    }

    private getReading(ray: Shape, obstacles: Array<Shape>): Collision | null {
        const touches: Array<Collision> = []

        const flattedObstacles = obstacles.map((o) => o.toArrayOfLines()).flat(2)

        for (let obstacle of flattedObstacles) {
            const touch: Collision | null = getIntersection(ray, obstacle)
            if (touch) {
                touches.push(touch)
            }
        }
        if (touches.length === 0) {
            return null
        }
        const offsets = touches.map((touch) => touch.getOffset())
        const minOffset = Math.min(...offsets)
        return touches.find((touch) => touch.getOffset() === minOffset)!
    }

    getDistanceFromObstacles(shapes: Array<Shape>, fromAngle: number, toAngle: number): number {
        let distance = Infinity

        for (let i = 0; i < this.rayCount; i++) {
            if (this.raysAngle[i] >= fromAngle && this.raysAngle[i] <= toAngle) {
                const collision = this.getReading(this.rays[i], shapes)
                if (collision === null) {
                    continue
                }
                const offsetValue = collision.getOffset()
                const distanceFromObstacle = offsetValue * this.rayLength
                distance = Math.min(distance, distanceFromObstacle)
            }
        }
        return distance
    }

    private castRays() {
        this.rays.length = 0
        const rayRadiants = this.rayCount > 1 ? this.raySpread / (this.rayCount - 1) : 0

        for (let index = 0; index < this.rayCount; index++) {
            const rayDirection = -(this.raySpread / 2) + rayRadiants * index

            const start = new Point(this.position.getX(), this.position.getY())
            const end = new Point(
                this.position.getX() - Math.sin(rayDirection + this.direction) * this.rayLength,
                this.position.getY() - Math.cos(rayDirection + this.direction) * this.rayLength,
            )

            this.raysAngle.unshift(rayDirection)
            this.rays.unshift(new Shape(start, end))
        }
    }

    drawInstructions(context: CanvasRenderingContext2D): void {
        this.castRays()

        if (!this.visibleRays) {
            return
        }

        // Reset alpha to full opacity for sensor rays
        context.globalAlpha = 1

        for (let i = 0; i < this.rayCount; i++) {
            const start = this.rays[i].getFirst()
            const collision = this.collisions[i]?.getPosition() ?? null
            const end = this.rays[i].getLast()

            if (collision) {
                context.beginPath()
                context.fillStyle = 'red'
                context.arc(collision.getX(), collision.getY(), 3, 0, 2 * Math.PI)
                context.fill()

                context.beginPath()
                context.strokeStyle = 'yellow'
                context.setLineDash([1, 5])
                context.lineWidth = 1
                context.moveTo(start.getX(), start.getY())
                context.lineTo(collision.getX(), collision.getY())
                context.stroke()
            } else {
                context.beginPath()
                context.lineWidth = 1
                context.setLineDash([1, 5])
                context.strokeStyle = 'yellow'
                context.moveTo(start.getX(), start.getY())
                context.lineTo(end.getX(), end.getY())
                context.stroke()
            }
        }
    }

    // Getters
    getRayCount(): number {
        return this.rayCount
    }

    getRayLength(): number {
        return this.rayLength
    }

    getRaySpread(): number {
        return this.raySpread
    }

    getRays(): Array<Shape> {
        return [...this.rays] // Return copy to prevent external mutation
    }

    getCollisions(): Array<Collision | null> {
        return [...this.collisions] // Return copy to prevent external mutation
    }

    getVisibleRays(): boolean {
        return this.visibleRays
    }

    // Setters
    setRayCount(value: number): void {
        this.rayCount = value
    }

    setRayLength(value: number): void {
        this.rayLength = value
    }

    setRaySpread(value: number): void {
        this.raySpread = value
    }

    setVisibleRays(value: boolean): void {
        this.visibleRays = value
    }

    setPosition(position: Point): void {
        this.position = position
    }
}
