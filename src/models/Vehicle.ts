import { checkPolygonsIntersection, getRandomColor, normalize } from '../libs/utils'
import Controls from './Controls'
import Drawable, { type DrawableProps } from './Drawable'
import NeuralNetwork from './NeuralNetwork'
import Sensor from './Sensor'
import type Shape from './Shape'
import type Stats from './Stats'

export type VehicleProps = Omit<DrawableProps, 'fillStyle' | 'strokeStyle'> & {
    stats: Stats
    color?: string
    network?: NeuralNetwork
    sensor?: Sensor
}

export default class Vehicle extends Drawable {
    speed: number
    steeringPower: number
    stats: Stats
    damaged: boolean
    controls: Controls
    sensor: Sensor | undefined
    network: NeuralNetwork | undefined

    constructor(props: VehicleProps) {
        const { stats, color, network, sensor, ...otherProps } = props
        super({ ...otherProps, fillStyle: color ?? getRandomColor() })
        this.speed = 0
        this.steeringPower = 0
        this.stats = stats
        this.controls = new Controls()
        this.damaged = false
        this.network = network
        this.sensor = sensor
        if (this.sensor) {
            this.sensor.position = this.position
        }
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
            if (this.speed < 0.02 && this.speed > -0.02) {
                this.speed = 0
            } else if (this.speed > 0) {
                this.speed -= 0.01
            } else if (this.speed < 0) {
                this.speed += 0.01
            }
        }

        this.steeringPower =
            this.speed > 1
                ? 0.000444 * Math.pow(this.speed, 2) - 0.007667 * this.speed + 0.037222
                : 0.03 * this.speed - 0.003

        if (Math.abs(this.speed) > 0) {
            if (this.controls.left) {
                this.direction += this.steeringPower
            } else if (this.controls.right) {
                this.direction -= this.steeringPower
            }
        }

        this.position.x -= Math.sin(this.direction) * this.speed
        this.position.y -= Math.cos(this.direction) * this.speed

        this.sensor?.syncDirection(this.direction)
    }

    #assessDamage(shapes: Array<Shape>) {
        for (let shape of shapes) {
            if (checkPolygonsIntersection(shape, this.shape)) {
                return true
            }
        }
        return false
    }

    checkCollisions(...shapes: Array<Shape>) {
        const damaged = this.#assessDamage(shapes)
        if (damaged && !this.damaged) {
            this.crash()
        }
        this.sensor?.checkCollisions(shapes)
    }

    crash() {
        this.damaged = true
        this.speed = 0
        this.steeringPower = 0
        this.fillStyle = 'darkgray'
        // AudioPlayer.play().scratch()
    }

    #autoPilot() {
        if (!this.network || !this.sensor) return
        const offsets = this.sensor.collisions.map((collision) => (collision === null ? 0 : 1 - collision.offset))

        //Aggiunge Speed tra i sensori
        const normalizedSpeed = normalize(this.speed, -this.stats.maxReverse, this.stats.maxSpeed, 0, 1)
        offsets.push(normalizedSpeed)

        const outputs = NeuralNetwork.feedForward(offsets, this.network)
        this.controls.forward = Boolean(outputs[0])
        this.controls.reverse = Boolean(outputs[1])
        this.controls.left = Boolean(outputs[2])
        this.controls.right = Boolean(outputs[3])
        this.controls.brake = Boolean(outputs[4])
    }

    beforeDrawing(context: CanvasRenderingContext2D): void {
        if (this.isGhost()) {
            context.globalAlpha = 0.5
        }
        if (!this.damaged) {
            this.#autoPilot()
            this.#move()
            this.sensor?.drawIn(context)
        }
    }

    afterDrawing(context: CanvasRenderingContext2D): void {
        context.globalAlpha = 1
    }

    setGhost(value: boolean): void {
        super.setGhost(value)
        if (this.sensor) {
            this.sensor.visibleRays = !value
        }
    }
}
