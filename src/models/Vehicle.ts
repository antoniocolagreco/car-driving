import { checkPolygonsIntersection, getRandomColor, normalize } from '../libs/utils'
import Controls from './Controls'
import Drawable, { type DrawableProps } from './Drawable'
import type Features from './Features'
import NeuralNetwork from './NeuralNetwork'
import Sensor from './Sensor'
import type Shape from './Shape'

export type VehicleProps = Omit<DrawableProps, 'fillStyle' | 'strokeStyle'> & {
    features: Features
    color?: string
    network?: NeuralNetwork
    sensor?: Sensor
}

export default class Vehicle extends Drawable {
    speed: number
    steeringPower: number
    features: Features
    damaged: boolean
    controls: Controls
    sensor: Sensor | undefined
    network: NeuralNetwork | undefined
    meritPoints: number = 0
    demeritPoints: number = 0
    checkPoints: number = 0
    points: number = 0
    aliveFor: number
    winner: boolean = false

    constructor(props: VehicleProps) {
        const { features, color, network, sensor, ...otherProps } = props
        super({ ...otherProps, fillStyle: color ?? getRandomColor() })
        this.speed = 0
        this.steeringPower = 0
        this.features = features
        this.controls = new Controls()
        this.damaged = false
        this.network = network
        this.sensor = sensor
        if (this.sensor) {
            this.sensor.position = this.position
        }
        this.aliveFor = 1
    }

    #move() {
        if (this.controls.brake) {
            if (this.speed > 0.1) {
                this.speed -= this.features.breakPower
            } else if (this.speed < -0.1) {
                this.speed += this.features.breakPower
            } else {
                this.speed = 0
            }
        } else if (this.controls.reverse) {
            if (this.speed > -this.features.maxReverse) this.speed -= this.features.breakPower
        } else if (this.controls.forward) {
            if (this.speed < this.features.maxSpeed) this.speed += this.features.acceleration
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

    updateStatus(traffic: Array<Vehicle>, obstacles: Array<Shape>) {
        const shapes = [...traffic.map((v) => v.shape), ...obstacles]
        const damaged = this.#assessDamage(shapes)
        if (damaged && !this.damaged) {
            this.crash()
        }
        this.#calculatePoints(traffic)
        this.sensor?.checkCollisions(shapes)
    }

    #calculatePoints(traffic: Array<Vehicle>) {
        let newPoints = 0
        for (let trafficVehicle of traffic) {
            if (trafficVehicle.position.y > this.position.y) {
                newPoints += 1
            }
        }

        if (newPoints > this.meritPoints) {
            this.meritPoints = newPoints
        }

        this.points = this.meritPoints - this.demeritPoints
    }

    crash() {
        if (!this.network) return
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
        const normalizedSpeed = normalize(this.speed, -this.features.maxReverse, this.features.maxSpeed, 0, 1)
        offsets.push(normalizedSpeed)

        const outputs = NeuralNetwork.feedForward(offsets, this.network)
        this.controls.forward = outputs[0] > 0
        this.controls.reverse = outputs[1] > 0
        this.controls.left = outputs[2] > 0
        this.controls.right = outputs[3] > 0
        this.controls.brake = outputs[4] > 0
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
        if (!this.winner) return

        context.fillStyle = 'black'
        context.font = '12px monospace'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText('WINNER', this.position.x, this.position.y)
    }

    setGhost(value: boolean): void {
        super.setGhost(value)
        if (this.sensor) {
            this.sensor.visibleRays = !value
        }
    }
}
