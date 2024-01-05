import { checkPolygonsIntersection } from '../libs/utils'
import Controls from './Controls'
import Drawable, { type DrawableProps } from './Drawable'
import Sensor from './Sensor'
import type Shape from './Shape'
import type Stats from './Stats'

export type VehicleProps = Omit<DrawableProps, 'fillStyle' | 'strokeStyle'> & {
    stats: Stats
    color?: string
    withSensor?: boolean
}

export default class Vehicle extends Drawable {
    speed: number
    steeringPower: number
    stats: Stats
    controls: Controls
    sensor: Sensor | undefined
    damaged: boolean

    constructor(props: VehicleProps) {
        const { stats, color, withSensor, ...otherProps } = props
        super({ ...otherProps, fillStyle: color })
        this.speed = 0
        this.steeringPower = 0
        this.stats = stats
        this.controls = new Controls()
        this.sensor = withSensor ? new Sensor({ position: this.position }) : undefined
        this.damaged = false
    }

    #move() {
        if (this.controls.brake) {
            if (this.speed > 0.1) {
                this.speed -= this.stats.breakPower
            } else if (this.speed < -0.1) {
                this.speed += this.stats.breakPower
            } else {
                this.speed = 0
            }
        } else if (this.controls.reverse) {
            if (this.speed > -this.stats.maxReverse) this.speed -= this.stats.breakPower
        } else if (this.controls.forward) {
            if (this.speed < this.stats.maxSpeed) this.speed += this.stats.acceleration
        } else {
            if (this.speed > 0) {
                this.speed -= 0.01
            } else if (this.speed < 0) {
                this.speed += 0.01
            } else if (this.speed < 0.02 && this.speed > -0.02) {
                this.speed = 0
            }
        }

        this.steeringPower =
            this.speed > 1
                ? 0.000444 * Math.pow(this.speed, 2) - 0.007667 * this.speed + 0.037222
                : 0.03 * this.speed - 0.003

        if (this.controls.left) {
            this.direction += this.steeringPower
        } else if (this.controls.right) {
            this.direction -= this.steeringPower
        }

        this.position.x -= Math.sin(this.direction) * this.speed
        this.position.y -= Math.cos(this.direction) * this.speed

        this.sensor?.syncDirection(this.direction)
    }

    #assessDamage(obstacles: Array<Shape>) {
        for (let obstacle of obstacles) {
            if (checkPolygonsIntersection(obstacle, this.polygon)) {
                return true
            }
        }
        return false
    }

    checkCollisions(safeObstacle: Shape[], dangerousObstacles: Shape[]) {
        const damaged = this.#assessDamage(dangerousObstacles)
        if (damaged) {
            this.damaged = damaged
        }
        this.sensor?.checkCollisions([...safeObstacle, ...dangerousObstacles])
    }

    beforeDrawing(context: CanvasRenderingContext2D): void {
        if (!this.damaged) {
            this.#move()
            this.sensor?.drawIn(context)
        }
    }
}
