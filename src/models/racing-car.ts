import {
    getOvertakenCars,
    isBreakingToAvoidCollision,
    isTurningToAvoidCollision,
} from '@libs/score'
import { SCORE } from 'src/constants'
import { Car, type CarProps } from './car'
import { CarStats } from './car-stats'
import type Shape from './shape'
import { Timeout } from './timeout'

type RacingCarProps = CarProps & {
    timeout: number
}

export class RacingCar extends Car {
    private stats: CarStats = new CarStats(this.position)
    private winner: boolean = false
    private timeout: Timeout

    constructor(props: RacingCarProps) {
        super(props)
        this.timeout = new Timeout(props.timeout, () => {
            this.crash()
        })
        this.timeout.start()
    }

    crash(): void {
        super.crash()
        if (this.timeout) {
            this.timeout.stop()
        }
        this.stats.calculateScore()
    }

    private updateStats(traffic: Array<Car>) {
        const currentOvertakenCars = getOvertakenCars(this, traffic)
        if (currentOvertakenCars > this.stats.getOvertakenCars()) {
            this.timeout.reset()
            this.stats.setOvertakenCars(currentOvertakenCars)
        }

        const isBreaking = isBreakingToAvoidCollision(this, traffic)
        if (isBreaking) {
            this.stats.increaseBreakingsCount()
            this.stats.markHasBreaked()
        }

        const isTurning = isTurningToAvoidCollision(this, traffic)
        if (isTurning) {
            if (this.steeringDegree >= SCORE.settings.greaterSteeringDegreeReaction) {
                this.stats.incrementGreaterTurningCount()
            } else if (this.steeringDegree >= SCORE.settings.averageSteeringDegreeReaction) {
                this.stats.incrementAverageTurningCount()
            } else if (this.steeringDegree >= SCORE.settings.lesserSteeringDegreeReaction) {
                this.stats.incrementLesserTurningCount()
            }
        }

        const controls = this.getControls()
        const accel = controls.getAcceleration()
        if (accel > 0.1) {
            this.stats.markHasAccelerated()
        }
        if (controls.isBreaking()) {
            this.stats.markHasBreaked()
        }
        const steering = controls.getSteering()
        if (steering < -0.1) {
            this.stats.markHasTurnedLeft()
        } else if (steering > 0.1) {
            this.stats.markHasTurnedRight()
        }

        this.stats.updateDistanceTravelled(this.position)

        this.stats.calculateScore()
    }

    protected afterDrawing(context: CanvasRenderingContext2D): void {
        super.afterDrawing(context)
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
        this.updateStats(traffic)
    }

    isWinner(): boolean {
        return this.winner
    }

    setWinner(value: boolean): void {
        this.winner = value
    }

    getTimeout(): Timeout | null {
        return this.timeout
    }

    getStats(): CarStats {
        return this.stats
    }

    resetStats(): void {
        this.stats = new CarStats(this.position)
    }
}
