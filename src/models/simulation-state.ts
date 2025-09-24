import type { Car } from './car'
import type { RacingCar } from './racing-car'

export class SimulationState {
    private allCars: RacingCar[]
    private traffic: Car[]
    private remainingCars: RacingCar[]
    private activeCar?: RacingCar
    private bestCar?: RacingCar
    private gameover: boolean
    private gameoverAt: number | null
    private trafficCounter: number

    constructor(allCars: RacingCar[] = [], traffic: Car[] = [], remainingCars: RacingCar[] = []) {
        this.allCars = allCars
        this.traffic = traffic
        this.remainingCars = remainingCars
        this.gameover = false
        this.gameoverAt = null
        this.trafficCounter = 0
    }

    getAllCars(): RacingCar[] {
        return this.allCars
    }

    setAllCars(allCars: RacingCar[]): void {
        this.allCars = allCars
    }

    getTraffic(): Car[] {
        return this.traffic
    }

    setTraffic(traffic: Car[]): void {
        this.traffic = traffic
    }

    getRemainingCars(): RacingCar[] {
        return this.remainingCars
    }

    setRemainingCars(remainingCars: RacingCar[]): void {
        this.remainingCars = remainingCars
    }

    getActiveCar(): RacingCar | undefined {
        return this.activeCar
    }

    setActiveCar(activeCar: RacingCar | undefined): void {
        this.activeCar = activeCar
    }

    getBestCar(): RacingCar | undefined {
        return this.bestCar
    }

    setBestCar(bestCar: RacingCar | undefined): void {
        this.bestCar = bestCar
    }

    isGameover(): boolean {
        return this.gameover
    }

    setGameover(gameover: boolean): void {
        this.gameover = gameover
    }

    getGameoverAt(): number | null {
        return this.gameoverAt
    }

    setGameoverAt(gameoverAt: number | null): void {
        this.gameoverAt = gameoverAt
    }

    getTrafficCounter(): number {
        return this.trafficCounter
    }

    setTrafficCounter(trafficCounter: number): void {
        this.trafficCounter = trafficCounter
    }
}
