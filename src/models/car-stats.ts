import { SCORE } from 'src/constants'
import Point from './point'

export class CarStats {
    private initialDrivingPosition: Readonly<Point>
    private overtakenCars: number
    private overtakesScore: number
    private breakingsCount: number
    private breakingsScore: number
    private lesserTurningCount: number
    private averageTurningCount: number
    private greaterTurningCount: number
    private turningScore: number
    private distanceTravelled: number

    private hasBreaked: boolean = false
    private hasTurnedLeft: boolean = false
    private hasTurnedRight: boolean = false
    private hasAccelerated: boolean = false

    private distanceScore: number
    private timeoutScore: number
    private totalScore: number

    constructor(initialDrivingPosition: Point) {
        this.overtakenCars = 0
        this.breakingsCount = 0
        this.lesserTurningCount = 0
        this.averageTurningCount = 0
        this.greaterTurningCount = 0
        this.initialDrivingPosition = new Point(
            initialDrivingPosition.getX(),
            initialDrivingPosition.getY(),
        )
        this.distanceTravelled = 0

        this.overtakesScore = 0
        this.breakingsScore = 0
        this.turningScore = 0
        this.distanceScore = 0
        this.timeoutScore = 0
        this.totalScore = 0
    }

    // Getters
    getOvertakenCars(): number {
        return this.overtakenCars
    }

    getBreakingsCount(): number {
        return this.breakingsCount
    }

    getTurningCount(): number {
        return this.lesserTurningCount + this.averageTurningCount + this.greaterTurningCount
    }

    getLesserTurningCount(): number {
        return this.lesserTurningCount
    }

    getAverageTurningCount(): number {
        return this.averageTurningCount
    }

    getGreaterTurningCount(): number {
        return this.greaterTurningCount
    }

    getFormattedScore(): string {
        return Math.floor(this.totalScore).toString()
    }

    getDistanceTravelled(): number {
        return this.distanceTravelled
    }

    // One-time achievement flags setters (idempotent)
    // These mark that the car has performed the corresponding action at least once.
    markHasBreaked(): void {
        this.hasBreaked = true
    }

    markHasTurnedLeft(): void {
        this.hasTurnedLeft = true
    }

    markHasTurnedRight(): void {
        this.hasTurnedRight = true
    }

    markHasAccelerated(): void {
        this.hasAccelerated = true
    }

    // One-time achievement flags getters
    hasEverBreaked(): boolean {
        return this.hasBreaked
    }

    hasEverTurnedLeft(): boolean {
        return this.hasTurnedLeft
    }

    hasEverTurnedRight(): boolean {
        return this.hasTurnedRight
    }

    hasEverAccelerated(): boolean {
        return this.hasAccelerated
    }

    setOvertakenCars(value: number): void {
        this.overtakenCars = value
    }

    incrementLesserTurningCount(delta: number = 1): void {
        this.lesserTurningCount += delta
    }

    incrementAverageTurningCount(delta: number = 1): void {
        this.averageTurningCount += delta
    }

    incrementGreaterTurningCount(delta: number = 1): void {
        this.greaterTurningCount += delta
    }

    increaseBreakingsCount(delta: number = 1): void {
        this.breakingsCount += delta
    }

    updateDistanceTravelled(currentPosition: Point): void {
        this.distanceTravelled = Math.hypot(
            currentPosition.getX() - this.initialDrivingPosition.getX(),
            currentPosition.getY() - this.initialDrivingPosition.getY(),
        )
    }

    getOvertakesScore(): number {
        return this.overtakesScore
    }

    getBreakingsScore(): number {
        return this.breakingsScore
    }

    getTurningScore(): number {
        return this.turningScore
    }

    getDistanceScore(): number {
        return this.distanceScore
    }

    getTimeoutScore(): number {
        return this.timeoutScore
    }

    getTotalScore(): number {
        return this.totalScore
    }

    getFormattedTotalScore(): string {
        return Math.floor(this.totalScore).toString()
    }

    calculateScore(): number {
        this.overtakesScore = this.overtakenCars * SCORE.overtake

        this.breakingsScore = this.breakingsCount * SCORE.breaking

        this.turningScore =
            this.lesserTurningCount * SCORE.lesserTurning +
            this.averageTurningCount * SCORE.averageTurning +
            this.greaterTurningCount * SCORE.greaterTurning

        this.distanceScore = this.distanceTravelled * SCORE.distanceTravelled

        this.totalScore =
            this.overtakesScore +
            this.breakingsScore +
            this.turningScore +
            this.distanceScore +
            this.timeoutScore

        return this.timeoutScore
    }
}
