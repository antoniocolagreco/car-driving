import NeuralNetwork from '@models/neural-network'
import { DEFAULTS, STORAGE_KEYS } from 'src/constants'

export default class Persistence {
    static saveBestNetwork(network: NeuralNetwork): void {
        localStorage.setItem(STORAGE_KEYS.bestNetwork, JSON.stringify(network.toJSON()))
    }

    static saveNetworkBackup(network: NeuralNetwork): void {
        localStorage.setItem(STORAGE_KEYS.backupNetwork, JSON.stringify(network.toJSON()))
    }

    static loadNetworkBackup(): NeuralNetwork | undefined {
        const networkString = localStorage.getItem(STORAGE_KEYS.backupNetwork)
        if (!networkString) {
            return undefined
        }

        try {
            const jsonData = JSON.parse(networkString)
            console.log(jsonData)
            const res = NeuralNetwork.fromJSON(jsonData)
            console.log(res)
            return NeuralNetwork.fromJSON(jsonData)
        } catch (error) {
            console.error('Error loading network backup:', error)
            return undefined
        }
    }

    static clearBestNetwork(): void {
        localStorage.removeItem(STORAGE_KEYS.bestNetwork)
    }

    static loadBestNetwork(): NeuralNetwork | undefined {
        const networkString = localStorage.getItem(STORAGE_KEYS.bestNetwork)
        if (!networkString) {
            return undefined
        }

        try {
            const jsonData = JSON.parse(networkString)
            return NeuralNetwork.fromJSON(jsonData)
        } catch (error) {
            console.error('Error loading best network:', error)
            return undefined
        }
    }

    static loadMutationRate(): number {
        const mutationString = localStorage.getItem(STORAGE_KEYS.mutationRate)
        return mutationString ? Number(mutationString) : DEFAULTS.mutationRate
    }

    static saveMutationRate(rate: number): void {
        localStorage.setItem(STORAGE_KEYS.mutationRate, String(rate))
    }

    static loadCarsQuantity(): number {
        const carsString = localStorage.getItem(STORAGE_KEYS.carsQuantity)
        return carsString ? Number(carsString) : DEFAULTS.carsQuantity
    }

    static saveCarsQuantity(quantity: number): void {
        localStorage.setItem(STORAGE_KEYS.carsQuantity, String(quantity))
    }

    static loadNetworkArchitecture(): Array<number> {
        const networkArchitectureString = localStorage.getItem(STORAGE_KEYS.networkArchitecture)
        const networkArchitectureArray = networkArchitectureString
            ? networkArchitectureString.split(',').map((n) => Number(n))
            : [...DEFAULTS.networkArchitecture]
        return networkArchitectureArray
    }

    static saveNetworkArchitecture(networkArchitecture: string): void {
        localStorage.setItem(STORAGE_KEYS.networkArchitecture, networkArchitecture)
    }
}
