import { Car, type CarProps } from './car'
import type Shape from './shape'

export class RacingCar extends Car {
    private meritPoints: number = 0
    private demeritPoints: number = 0
    private checkpoints: number = 0
    private secondsFromLastCheckpoint: number = 0
    private points: number = 0
    private winner: boolean = false

    constructor(props: CarProps) {
        super(props)
    }

    protected calculatePoints(traffic: Array<Car>) {
        // Bonus per superare traffico
        let trafficReward = 0
        for (let trafficVehicle of traffic) {
            if (trafficVehicle.getPosition().getY() > this.getPosition().getY()) {
                trafficReward += 1
            }
        }

        if (trafficReward > this.meritPoints) {
            this.meritPoints = trafficReward
        }

        this.points = this.meritPoints - this.demeritPoints
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

    updateStatus(traffic: Array<Car>, obstacles: Array<Shape>): void {
        super.updateStatus(traffic, obstacles)
        this.calculatePoints(traffic)
    }

    getDemeritPoints(): number {
        return this.demeritPoints
    }

    setDemeritPoints(value: number): void {
        this.demeritPoints = value
    }

    addDemeritPoints(value: number): void {
        this.demeritPoints += value
    }

    getCheckPoints(): number {
        return this.checkpoints // checkPoints alias for passedCheckPoints
    }

    setCheckPoints(value: number): void {
        this.checkpoints = value
    }

    getMeritPoints(): number {
        return this.meritPoints
    }

    setMeritPoints(value: number): void {
        this.meritPoints = value
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

    getSecondsFromLastCheckpoint(): number {
        return this.secondsFromLastCheckpoint
    }

    setSecondsFromLastCheckpoint(value: number): void {
        this.secondsFromLastCheckpoint = value
    }
}
