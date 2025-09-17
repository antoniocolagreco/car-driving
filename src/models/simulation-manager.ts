import { CONSTANTS } from '../constants'
import Persistence from '../libs/persistence'
import { generateCars, getActiveCar, getBestCar, getRemainingCars } from '../libs/simulation'
import { generateTraffic } from '../libs/traffic'
import NeuralNetwork from './neural-network'
import Road from './road'
import type Vehicle from './vehicle'
import Visualizer from './visualizer'

export interface SimulationState {
    allCars: Vehicle[]
    traffic: Vehicle[]
    aliveCars: Vehicle[]
    activeCar?: Vehicle
    bestCar?: Vehicle
    gameover: boolean
    gameoverAt: number | null
    trafficCounter: number
}

export interface SimulationConfig {
    mutationRate: number
    carsQuantity: number
    neurons: number[]
}

export class SimulationManager {
    private state: SimulationState
    private config: SimulationConfig
    private deathCheckInterval?: ReturnType<typeof setInterval>
    private demeritCheckInterval?: ReturnType<typeof setInterval>

    constructor(
        private road: Road,
        config: SimulationConfig,
        private networkContext?: CanvasRenderingContext2D | null,
    ) {
        this.config = config
        this.state = {
            allCars: [],
            traffic: [],
            aliveCars: [],
            activeCar: undefined,
            bestCar: undefined,
            gameover: false,
            gameoverAt: null,
            trafficCounter: 0,
        }
    }

    getState(): SimulationState {
        return { ...this.state }
    }

    updateConfig(config: Partial<SimulationConfig>): void {
        this.config = { ...this.config, ...config }
    }

    restart(): void {
        this.state.gameover = false
        this.state.gameoverAt = null
        let bestNetwork = Persistence.loadBestNetwork()

        if (this.state.activeCar?.getNetwork() && bestNetwork) {
            const activeCarPoints = this.state.activeCar.getNetwork()!.getPointsRecord()
            const bestNetworkPoints = bestNetwork.getPointsRecord()

            /**
             * Adaptive network merging strategy.
             * If the winning network's score is lower than the parent,
             * the model for successive networks will be an average
             * between the winner's network and the parent's network.
             */
            if (bestNetworkPoints > activeCarPoints) {
                bestNetwork = NeuralNetwork.mergeNetworks(
                    bestNetwork,
                    this.state.activeCar.getNetwork()!,
                    Math.max(0.5, activeCarPoints / bestNetworkPoints),
                )
            }
        }

        this.stopTimers()

        this.state.allCars = generateCars(this.config.carsQuantity, this.config.neurons, this.road)
        this.state.aliveCars = this.state.allCars
        // Ensure all start inactive (ghost)
        this.state.aliveCars.forEach((c) => c.setActive(false))
        // Mark the first alive car as active
        this.state.activeCar = this.state.aliveCars[0]
        this.state.trafficCounter = 0

        if (this.state.activeCar) {
            this.state.activeCar.setFillStyle('white')
            this.state.activeCar.setActive(true)
        }

        if (bestNetwork && this.state.activeCar) {
            this.state.activeCar.setNetwork(bestNetwork)
            if (this.state.activeCar.getNetwork()) {
                for (let index = 1; index < this.state.allCars.length; index++) {
                    this.state.aliveCars[index].setNetwork(
                        NeuralNetwork.getMutatedNetwork(bestNetwork, this.config.mutationRate),
                    )
                }
            }
        }

        this.state.traffic = generateTraffic(CONSTANTS.initialTrafficRows, this.road)
        this.startTimers()

        if (this.networkContext && this.state.activeCar?.getNetwork()) {
            Visualizer.drawNetworkIn(this.networkContext, this.state.activeCar.getNetwork()!)
        }
    }

    endRound(): void {
        this.state.gameover = true
        this.state.gameoverAt = performance.now()
    }

    update(): void {
        this.state.aliveCars = getRemainingCars(this.state.allCars)
        this.state.bestCar = getBestCar(this.state.allCars)
        this.state.activeCar = this.state.gameover
            ? this.state.bestCar
            : getActiveCar(this.state.aliveCars)
    }

    checkGameOver(timestamp: number): boolean {
        if (
            this.state.gameover &&
            this.state.gameoverAt !== null &&
            timestamp - this.state.gameoverAt >= CONSTANTS.gameoverDuration
        ) {
            this.restart()
            this.state.gameoverAt = null
            return true
        }

        if (this.state.aliveCars.length === 0 && !this.state.gameover) {
            if (this.state.bestCar?.getNetwork()) {
                const network = this.state.bestCar.getNetwork()
                if (network) {
                    network.setSurvivedRounds(network.getSurvivedRounds() + 1)
                    Persistence.saveBestNetwork(network)
                }
            }
            this.endRound()
            return true
        }

        return false
    }

    updateVehicles(): void {
        // Update AI-controlled cars
        for (const car of this.state.allCars) {
            car.updateStatus(this.state.traffic, this.road.getBorders())
        }

        // Update traffic vehicles
        for (const vehicle of this.state.traffic) {
            vehicle.updateStatus(this.state.traffic, this.road.getBorders())
        }
    }

    private startTimers(): void {
        // Death check interval
        this.deathCheckInterval = setInterval(() => {
            const firstCar = getActiveCar(this.state.aliveCars)
            for (const car of this.state.aliveCars) {
                const t = this.state.traffic[this.state.trafficCounter]
                if (t && car.getPosition().getY() > t.getPosition().getY()) {
                    car.crash()
                }
                if (
                    firstCar &&
                    car.getPosition().getY() - CONSTANTS.maximumDistanceFromFirstCar >
                        firstCar.getPosition().getY()
                ) {
                    car.crash()
                }
                if (car.getMeritPoints() === car.getCheckPoints()) {
                    car.addDemeritPoints(1)
                } else {
                    car.setDemeritPoints(0)
                }
                car.setCheckPoints(car.getMeritPoints())
            }
            this.state.trafficCounter += 1
        }, CONSTANTS.deathTimeout)

        // Demerit check interval
        this.demeritCheckInterval = setInterval(() => {
            for (const car of this.state.aliveCars) {
                if (car.getMeritPoints() <= car.getCheckPoints()) {
                    car.addDemeritPoints(1)
                } else {
                    car.setDemeritPoints(0)
                }
                car.setCheckPoints(car.getMeritPoints())
            }
        }, CONSTANTS.demeritTimeout)
    }

    private stopTimers(): void {
        if (this.deathCheckInterval) {
            clearInterval(this.deathCheckInterval)
            this.deathCheckInterval = undefined
        }
        if (this.demeritCheckInterval) {
            clearInterval(this.demeritCheckInterval)
            this.demeritCheckInterval = undefined
        }
    }

    stop(): void {
        this.stopTimers()
    }

    saveNetwork(): boolean {
        if (this.state.activeCar?.getNetwork()) {
            Persistence.saveNetworkBackup(this.state.activeCar.getNetwork()!)
            return true
        }
        return false
    }

    restoreNetwork(): boolean {
        const restored = Persistence.loadNetworkBackup()
        if (restored) {
            Persistence.saveBestNetwork(restored)
            return true
        }
        return false
    }

    resetNetwork(): void {
        Persistence.clearBestNetwork()
    }

    evolveNetwork(): boolean {
        if (this.state.bestCar?.getNetwork()) {
            Persistence.saveBestNetwork(this.state.bestCar.getNetwork()!)
            return true
        }
        return false
    }
}
