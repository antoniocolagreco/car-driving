import Controls from './Controls'
import Drawable from './Drawable'
import type Position from './Position'
import type Size from './Size'
import type VehicleStats from './VehicleStats'

export default class Vehicle extends Drawable {
    speed: number
    stats: VehicleStats
    controls: Controls

    constructor(context: CanvasRenderingContext2D, position: Position, size: Size, stats: VehicleStats) {
        super(context, position, size)
        this.speed = 0
        this.stats = stats
        this.controls = new Controls()
    }

    update() {
        if (this.controls.reverse) {
            if (this.speed > -this.stats.maxReverse) this.speed -= this.stats.breakPower
        } else if (this.controls.forward) {
            if (this.speed < this.stats.maxSpeed) this.speed += this.stats.acceleration
        } else {
            if (this.speed > 0) {
                this.speed -= 0.01
            } else if (this.speed < 0) {
                this.speed += 0.01
            }
        }
        this.position.y -= this.speed
    }
}
