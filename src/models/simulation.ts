import { CONSTANTS } from '../constants'
import Persistence from '../libs/persistence'
import { generateCars, getActiveCar, getBestCar, getRemainingCars } from '../libs/simulation'
import { generateTraffic } from '../libs/traffic'
import type { Car } from './car'
import NeuralNetwork from './neural-network'
import type { RacingCar } from './racing-car'
import type World from './world'

export interface SimulationState {
    allCars: RacingCar[]
    traffic: Car[]
    remainingCars: RacingCar[]
    activeCar?: RacingCar
    bestCar?: RacingCar
    gameover: boolean
    gameoverAt: number | null
    trafficCounter: number
}

export interface SimulationConfig {
    mutationRate: number
    carsQuantity: number
    networkArchitecture: number[]
}

export class Simulation {
    private state: SimulationState
    private config: SimulationConfig
    private deathCheckInterval?: ReturnType<typeof setInterval>
    private demeritCheckInterval?: ReturnType<typeof setInterval>

    constructor(
        private world: World,
        config: SimulationConfig,
    ) {
        this.config = config
        this.state = {
            allCars: [],
            traffic: [],
            remainingCars: [],
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

        const activeNetwork = this.state.activeCar?.getNetwork()

        if (activeNetwork && bestNetwork) {
            const activeNetworkPoints = activeNetwork.getPointsRecord()
            const bestNetworkPoints = bestNetwork.getPointsRecord()

            if (activeNetworkPoints > bestNetworkPoints) {
                bestNetwork = activeNetwork
            }
        }

        this.stopTimers()

        this.state.allCars = generateCars(
            this.config.carsQuantity,
            this.config.networkArchitecture,
            this.world.getRoad(),
            bestNetwork,
            this.config.mutationRate,
        )
        this.state.remainingCars = this.state.allCars
        // Ensure all start inactive (ghost)
        this.state.remainingCars.forEach((c) => c.setActive(false))
        // Mark the first alive car as active
        this.state.activeCar = this.state.remainingCars[0]
        this.state.trafficCounter = 0

        if (this.state.activeCar) {
            this.state.activeCar.setFillStyle('white')
            this.state.activeCar.setActive(true)
        }

        if (bestNetwork && this.state.activeCar) {
            this.state.activeCar.setNetwork(bestNetwork)
            if (this.state.activeCar.getNetwork()) {
                for (let index = 1; index < this.state.allCars.length; index++) {
                    this.state.remainingCars[index].setNetwork(
                        NeuralNetwork.getMutatedNetwork(bestNetwork, this.config.mutationRate),
                    )
                }
            }
        }

        this.state.traffic = generateTraffic(CONSTANTS.initialTrafficRows, this.world.getRoad())
        this.startTimers()

        // if (this.networkContext && this.state.activeCar?.getNetwork()) {
        //     Visualizer.drawNetworkIn(this.networkContext, this.state.activeCar.getNetwork()!)
        // }
    }

    endRound(): void {
        this.state.gameover = true
        this.state.gameoverAt = performance.now()
    }

    update(): void {
        this.state.remainingCars = getRemainingCars(this.state.allCars)
        this.state.bestCar = getBestCar(this.state.allCars)
        this.state.activeCar = this.state.gameover
            ? this.state.bestCar
            : getActiveCar(this.state.remainingCars)

        // Aggiorna continuamente il record di punti della rete attiva
        if (this.state.activeCar?.getNetwork()) {
            const network = this.state.activeCar.getNetwork()!
            const currentPoints = this.state.activeCar.getPoints()
            if (currentPoints > network.getPointsRecord()) {
                network.setPointsRecord(currentPoints)
            }
        }
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

        if (this.state.remainingCars.length === 0 && !this.state.gameover) {
            if (this.state.bestCar?.getNetwork()) {
                const network = this.state.bestCar.getNetwork()
                if (network) {
                    network.setSurvivedRounds(network.getSurvivedRounds() + 1)
                    // Aggiorna il record di punti solo se è maggiore del precedente
                    const currentPoints = this.state.bestCar.getPoints()
                    if (currentPoints > network.getPointsRecord()) {
                        network.setPointsRecord(currentPoints)
                    }
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
            car.updateStatus(this.state.traffic, this.world.getRoad().getBorders())
        }

        // Update traffic vehicles
        for (const vehicle of this.state.traffic) {
            vehicle.updateStatus(this.state.traffic, this.world.getRoad().getBorders())
        }
    }

    private startTimers(): void {
        // Death check interval
        this.deathCheckInterval = setInterval(() => {
            const firstCar = getActiveCar(this.state.remainingCars)
            for (const car of this.state.remainingCars) {
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
            for (const car of this.state.remainingCars) {
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
            const network = this.state.bestCar.getNetwork()!
            const currentPoints = this.state.bestCar.getPoints()

            // Incrementa i survived rounds quando si evolve manualmente
            network.setSurvivedRounds(network.getSurvivedRounds() + 1)

            // Aggiorna il record di punti se è maggiore
            if (currentPoints > network.getPointsRecord()) {
                network.setPointsRecord(currentPoints)
            }

            Persistence.saveBestNetwork(network)
            return true
        }
        return false
    }
}
