import { checkPolygonsIntersection, getRandomColor, normalizeWithThreshold } from '../libs/utils'
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
        const acceleration = this.controls.getAcceleration()
        const braking = this.controls.getBrake()

        // Handle acceleration/deceleration with analog input
        if (acceleration > 0) {
            // Forward acceleration
            if (this.speed < this.features.getMaxSpeed()) {
                this.speed += this.features.getAcceleration() * acceleration
            }
        } else if (acceleration < 0) {
            // Reverse acceleration
            if (this.speed > -this.features.getMaxReverse()) {
                this.speed += this.features.getAcceleration() * acceleration
            }
        }

        // Handle braking
        if (braking) {
            if (this.speed > 0) {
                this.speed -= this.features.getBreakPower()
            } else if (this.speed < 0) {
                this.speed += this.features.getBreakPower()
            }
        }

        // Natural deceleration when no input
        if (acceleration === 0 && !braking) {
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

        // Analog steering
        if (Math.abs(this.speed) > 0) {
            const steering = this.controls.getSteering()
            this.direction += this.steeringPower * steering
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
        const normalizedSpeed = normalizeWithThreshold(
            this.speed,
            -this.features.getMaxReverse(),
            this.features.getMaxSpeed(),
            -1,
            1,
            0,
        )
        offsets.push(normalizedSpeed)

        const outputs = NeuralNetwork.feedForward(offsets, this.network)

        this.controls.setAcceleration(outputs[0])
        this.controls.setBrake(Boolean(Math.max(outputs[1], 0)))
        this.controls.setSteering(outputs[2])
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
