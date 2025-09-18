import { DEFAULTS } from 'src/constants'
import type NeuralNetwork from './neural-network'

export default class SimulationData {
    private totalSimulations: number = 0
    private successfulSimulations: number = 0
    private carsQuantity: number = DEFAULTS.carsQuantity
    private mutationRate: number = DEFAULTS.mutationRate
    private networkConfiguration: number[] = DEFAULTS.networkArchitecture

    private bestNetwork: NeuralNetwork | undefined
    private backupNetwork: NeuralNetwork | undefined

    constructor() {}

    // Getters
    getTotalSimulations(): number {
        return this.totalSimulations
    }

    getSuccessfulSimulations(): number {
        return this.successfulSimulations
    }

    getCarsQuantity(): number {
        return this.carsQuantity
    }

    getMutationRate(): number {
        return this.mutationRate
    }

    getNetworkConfiguration(): number[] {
        return [...this.networkConfiguration]
    }

    getBestNetwork(): NeuralNetwork | undefined {
        return this.bestNetwork
    }

    getBackupNetwork(): NeuralNetwork | undefined {
        return this.backupNetwork
    }

    // Setters
    setTotalSimulations(value: number): void {
        this.totalSimulations = Math.max(0, value)
    }

    setSuccessfulSimulations(value: number): void {
        this.successfulSimulations = Math.max(0, value)
    }

    setCarsQuantity(value: number): void {
        this.carsQuantity = Math.max(1, value)
    }

    setMutationRate(value: number): void {
        this.mutationRate = Math.max(0, Math.min(1, value)) // Clamp tra 0 e 1
    }

    setNetworkConfiguration(configuration: number[]): void {
        this.networkConfiguration = [...configuration]
    }

    setBestNetwork(network: NeuralNetwork | undefined): void {
        this.bestNetwork = network
    }

    setBackupNetwork(network: NeuralNetwork | undefined): void {
        this.backupNetwork = network
    }

    // Utility methods
    incrementTotalSimulations(): void {
        this.totalSimulations++
    }

    incrementSuccessfulSimulations(): void {
        this.successfulSimulations++
    }

    getSuccessRate(): number {
        return this.totalSimulations > 0 ? this.successfulSimulations / this.totalSimulations : 0
    }

    reset(): void {
        this.totalSimulations = 0
        this.successfulSimulations = 0
        this.bestNetwork = undefined
        this.backupNetwork = undefined
    }
}
