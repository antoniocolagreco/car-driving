import NeuralNetwork from '@models/neural-network'
import { DEFAULTS, STORAGE_KEYS } from './config'

export const persistence = {
    saveBestNetwork: (network: NeuralNetwork) => {
        network.survivedRounds += 1
        localStorage.setItem(STORAGE_KEYS.bestNetwork, JSON.stringify(network))
    },

    saveNetworkBackup: (network: NeuralNetwork) => {
        localStorage.setItem(STORAGE_KEYS.backupNetwork, JSON.stringify(network))
    },

    loadNetworkBackup: (): NeuralNetwork | undefined => {
        const networkString = localStorage.getItem(STORAGE_KEYS.backupNetwork)
        const network = networkString ? JSON.parse(networkString) : undefined
        return network
    },

    clearBestNetwork: () => {
        localStorage.removeItem(STORAGE_KEYS.bestNetwork)
    },

    loadBestNetwork: (): NeuralNetwork | undefined => {
        const networkString = localStorage.getItem(STORAGE_KEYS.bestNetwork)
        const network = networkString ? JSON.parse(networkString) : undefined
        return network
    },

    loadMutationRate: (): number => {
        const mutationString = localStorage.getItem(STORAGE_KEYS.mutationRate)
        return mutationString ? Number(mutationString) : DEFAULTS.mutationRate
    },

    saveMutationRate: (rate: number) =>
        localStorage.setItem(STORAGE_KEYS.mutationRate, String(rate)),

    loadCarsQuantity: (): number => {
        const carsString = localStorage.getItem(STORAGE_KEYS.carsQuantity)
        return carsString ? Number(carsString) : DEFAULTS.carsQuantity
    },

    saveCarsQuantity: (quantity: number) =>
        localStorage.setItem(STORAGE_KEYS.carsQuantity, String(quantity)),

    loadNeurons: (): Array<number> => {
        const neuronString = localStorage.getItem(STORAGE_KEYS.neurons) ?? DEFAULTS.neurons
        const neuronsArray = neuronString.split(',').map((n) => Number(n))
        return neuronsArray
    },

    saveNeurons: (neurons: string) => localStorage.setItem(STORAGE_KEYS.neurons, neurons),
}
