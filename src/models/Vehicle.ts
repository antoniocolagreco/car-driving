import Controls from './Controls'
import Drawable from './Drawable'
import type Position from './Position'
import type Size from './Size'
import type VehicleStats from './VehicleStats'

export default class Vehicle extends Drawable {
    speed: number
    steeringPower: number
    stats: VehicleStats
    controls: Controls

    constructor(position: Position, size: Size, stats: VehicleStats) {
        super(position, size)
        this.speed = 0
        this.steeringPower = 0
        this.stats = stats
        this.controls = new Controls()
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

        this.steeringPower = this.speed > 1 ? -0.005 * this.speed + 0.035 : 0.03 * this.speed - 0.003
        // const steeringDirection = this.speed > 0 ? 1 : -1

        if (this.controls.left) {
            this.angle -= this.steeringPower
        } else if (this.controls.right) {
            this.angle += this.steeringPower
        }

        this.position.x += Math.sin(this.angle) * this.speed
        this.position.y -= Math.cos(this.angle) * this.speed
    }

    objectDrawingFunction(context: CanvasRenderingContext2D): void {
        context.fillRect(0 - this.size.width / 2, 0 - this.size.height / 2, this.size.width, this.size.height)

        context.beginPath()
        context.strokeStyle = '#fff'
        context.lineWidth = 3
        context.moveTo(0, 0 - this.size.height / 2)
        context.lineTo(0, 0)
        context.stroke()
    }

    drawIn(context: CanvasRenderingContext2D) {
        this.#move()
        super.drawIn(context)
    }
}
