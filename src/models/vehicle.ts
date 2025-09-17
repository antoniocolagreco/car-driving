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
    private speed: number
    private steeringPower: number
    private features: Features
    private damaged: boolean
    private controls: Controls
    private sensor: Sensor | undefined
    private network: NeuralNetwork | undefined
    private meritPoints: number = 0
    private demeritPoints: number = 0
    private passedCheckPoints: number = 0
    private points: number = 0
    private winner: boolean = false

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

    #move() {
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
            if (trafficVehicle.getPosition().getY() > this.getPosition().getY()) {
                newPoints += 1
            }
        }

        if (newPoints > this.meritPoints) {
            this.meritPoints = newPoints
        }

        this.points = this.meritPoints - this.demeritPoints
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

    #autoPilot() {
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
            this.#autoPilot()
            this.#move()

            this.sensor?.drawIn(context)
        }
    }

    afterDrawing(context: CanvasRenderingContext2D): void {
        context.globalAlpha = 1
        if (!this.winner) {
            return
        }

        context.fillStyle = 'black'
        context.font = '12px monospace'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText('WINNER', this.getPosition().getX(), this.getPosition().getY())
    }

    setGhost(value: boolean): void {
        // Keep this setter free of side-effects; only toggle ghost flag
        super.setGhost(value)
    }

    // Domain method: explicitly mark a car as active/inactive
    setActive(isActive: boolean): void {
        // Active means not ghost and rays visible
        super.setGhost(!isActive)
        this.sensor?.setVisibleRays(isActive)
    }

    getDemeritPoints(): number {
        return this.demeritPoints
    }

    incrementDemeritPoints(): void {
        this.demeritPoints += 1
    }

    resetDemeritPoints(): void {
        this.demeritPoints = 0
    }

    setDemeritPoints(value: number): void {
        this.demeritPoints = value
    }

    addDemeritPoints(value: number): void {
        this.demeritPoints += value
    }

    getPassedCheckPoints(): number {
        return this.passedCheckPoints
    }

    setPassedCheckPoint(value: number): void {
        this.passedCheckPoints = value
    }

    getCheckPoints(): number {
        return this.passedCheckPoints // checkPoints alias for passedCheckPoints
    }

    setCheckPoints(value: number): void {
        this.passedCheckPoints = value
    }

    getMeritPoints(): number {
        return this.meritPoints
    }

    setMeritPoints(value: number): void {
        this.meritPoints = value
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

    getPoints(): number {
        return this.points
    }

    isWinner(): boolean {
        return this.winner
    }

    setWinner(value: boolean): void {
        this.winner = value
    }

    getControls(): Controls {
        return this.controls
    }

    getSensor(): Sensor | undefined {
        return this.sensor
    }
}
