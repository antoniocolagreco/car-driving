import NeuralNetwork from '@models/neural-network'
import { DEFAULTS, STORAGE_KEYS } from './config'
import { storage } from './storage'

export const persistence = {
    saveBestNetwork: (network: NeuralNetwork) => {
        network.survivedRounds += 1
        storage.set(STORAGE_KEYS.bestNetwork, network.toJSON())
    },

    saveNetworkBackup: (network: NeuralNetwork) => {
        storage.set(STORAGE_KEYS.backupNetwork, network.toJSON())
    },

    loadNetworkBackup: (): NeuralNetwork | undefined => {
        const json = storage.get<ReturnType<NeuralNetwork['toJSON']>>(STORAGE_KEYS.backupNetwork)
        return json ? NeuralNetwork.fromJSON(json) : undefined
    },

    clearBestNetwork: () => {
        storage.remove(STORAGE_KEYS.bestNetwork)
    },

    loadBestNetwork: (): NeuralNetwork | undefined => {
        const json = storage.get<ReturnType<NeuralNetwork['toJSON']>>(STORAGE_KEYS.bestNetwork)
        return json ? NeuralNetwork.fromJSON(json) : undefined
    },

    loadMutationRate: (): number =>
        storage.get<number>(STORAGE_KEYS.mutationRate) ?? DEFAULTS.mutationRate,

    saveMutationRate: (rate: number) => storage.set(STORAGE_KEYS.mutationRate, rate),

    loadCarsQuantity: (): number =>
        storage.get<number>(STORAGE_KEYS.carsQuantity) ?? DEFAULTS.carsQuantity,

    saveCarsQuantity: (n: number) => storage.set(STORAGE_KEYS.carsQuantity, n),

    loadNeurons: (): Array<number> => {
        const str = storage.get<string>(STORAGE_KEYS.neurons) ?? DEFAULTS.neurons
        return str.split(',').map((v) => Number(v))
    },

    saveNeurons: (neurons: string) => storage.set(STORAGE_KEYS.neurons, neurons),
}
