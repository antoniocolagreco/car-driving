import NeuralNetwork from '@models/neural-network'
import { DEFAULTS, STORAGE_KEYS } from './config'
import { storage } from './storage'

export class Persistence {
    static saveBestNetwork = (network: NeuralNetwork) => {
        network.survivedRounds += 1
        storage.set(STORAGE_KEYS.bestNetwork, network.toJSON())
    }

    static saveNetworkBackup = (network: NeuralNetwork) => {
        storage.set(STORAGE_KEYS.backupNetwork, network.toJSON())
    }

    static loadNetworkBackup = (): NeuralNetwork | undefined => {
        const json = storage.get<ReturnType<NeuralNetwork['toJSON']>>(STORAGE_KEYS.backupNetwork)
        return json ? NeuralNetwork.fromJSON(json) : undefined
    }

    static clearBestNetwork = () => {
        storage.remove(STORAGE_KEYS.bestNetwork)
    }

    static loadBestNetwork = (): NeuralNetwork | undefined => {
        const json = storage.get<ReturnType<NeuralNetwork['toJSON']>>(STORAGE_KEYS.bestNetwork)
        return json ? NeuralNetwork.fromJSON(json) : undefined
    }

    static loadMutationRate = (): number =>
        storage.get<number>(STORAGE_KEYS.mutationRate) ?? DEFAULTS.mutationRate

    static saveMutationRate = (rate: number) => storage.set(STORAGE_KEYS.mutationRate, rate)

    static loadCarsQuantity = (): number =>
        storage.get<number>(STORAGE_KEYS.carsQuantity) ?? DEFAULTS.carsQuantity

    static saveCarsQuantity = (n: number) => storage.set(STORAGE_KEYS.carsQuantity, n)

    static loadNeurons = (): Array<number> => {
        const str = storage.get<string>(STORAGE_KEYS.neurons) ?? DEFAULTS.neurons
        return str.split(',').map((v) => Number(v))
    }

    static saveNeurons = (neurons: string) => storage.set(STORAGE_KEYS.neurons, neurons)
}
