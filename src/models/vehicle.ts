import { checkPolygonsIntersection, getRandomColor, normalize } from '../libs/utils'
import Controls from './controls'
import Drawable, { type DrawableProps } from './drawable'
import type Features from './features'
import NeuralNetwork from './neural-network'
import type Sensor from './sensor'
import type Shape from './shape'

export type VehicleProps = Omit<DrawableProps, 'fillStyle' | 'strokeStyle'> & {
    features: Features
    color?: string
    network?: NeuralNetwork
    sensor?: Sensor
}

export default class Vehicle extends Drawable {
    protected speed: number
    protected steeringPower: number
    protected features: Features
    protected damaged: boolean
    protected controls: Controls
    protected sensor: Sensor | undefined
    protected network: NeuralNetwork | undefined

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
            this.sensor.setPosition(this.getPosition())
        }
    }

    protected move() {
        if (this.controls.getForward()) {
            if (this.speed < this.features.getMaxSpeed()) {
                this.speed += this.features.getAcceleration()
            }
        } else if (this.controls.getReverse()) {
            if (this.speed > -this.features.getMaxReverse()) {
                this.speed -=
                    this.speed > 0 ? this.features.getBreakPower() : this.features.getAcceleration()
            }
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
            if (this.controls.getLeft()) {
                this.direction += this.steeringPower
            }
            if (this.controls.getRight()) {
                this.direction -= this.steeringPower
            }
        }

        const newX = this.getPosition().getX() - Math.sin(this.direction) * this.speed
        const newY = this.getPosition().getY() - Math.cos(this.direction) * this.speed
        this.getPosition().set(newX, newY)

        this.sensor?.syncDirection(this.direction)
    }

    protected assessDamage(shapes: Array<Shape>) {
        for (let shape of shapes) {
            if (checkPolygonsIntersection(shape, this.shape)) {
                return true
            }
        }
        return false
    }

    updateStatus(traffic: Array<Vehicle>, obstacles: Array<Shape>) {
        const shapes = [...traffic.map((v) => v.shape), ...obstacles]
        const damaged = this.assessDamage(shapes)
        if (damaged && !this.damaged) {
            this.crash()
        }
        this.sensor?.checkCollisions(shapes)
    }

    crash() {
        if (!this.network) {
            return
        }
        this.damaged = true
        this.speed = 0
        this.steeringPower = 0
        this.fillStyle = 'darkgray'
        // AudioPlayer.play().scratch()
    }

    protected autoPilot() {
        if (!this.network || !this.sensor) {
            return
        }
        const offsets = this.sensor
            .getCollisions()
            .map((collision) => (collision === null ? 0 : 1 - collision.getOffset()))

        //Aggiunge Speed tra i sensori
        const normalizedSpeed = normalize(
            this.speed,
            -this.features.getMaxReverse(),
            this.features.getMaxSpeed(),
            0,
            1,
        )
        offsets.push(normalizedSpeed)

        const outputs = NeuralNetwork.feedForward(offsets, this.network)
        this.controls.setForward(outputs[0] > 0)
        this.controls.setReverse(outputs[1] > 0)
        this.controls.setLeft(outputs[2] > 0)
        this.controls.setRight(outputs[3] > 0)
    }

    beforeDrawing(context: CanvasRenderingContext2D): void {
        if (this.isGhost()) {
            context.globalAlpha = 0.5
        }
        if (!this.damaged) {
            this.autoPilot()
            this.move()

            this.sensor?.drawIn(context)
        }
    }

    afterDrawing(_context: CanvasRenderingContext2D): void {}

    setGhost(value: boolean): void {
        // Keep this setter free of side-effects; only toggle ghost flag
        super.setGhost(value)
    }

    // Domain method: explicitly mark a car as active/inactive
    setActive(value: boolean): void {
        // Active means not ghost and rays visible
        super.setGhost(!value)
        this.sensor?.setVisibleRays(value)
    }

    getNetwork(): NeuralNetwork | undefined {
        return this.network
    }

    setNetwork(network: NeuralNetwork): void {
        this.network = network
    }

    getSpeed(): number {
        return this.speed
    }

    isDamaged(): boolean {
        return this.damaged
    }

    getControls(): Controls {
        return this.controls
    }

    getSensor(): Sensor | undefined {
        return this.sensor
    }
}
