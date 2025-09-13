import NeuralNetwork from '@models/neural-network'
import { STORAGE_KEYS } from './config'
import { storage } from './storage'

export const saveBestNetwork = (network: NeuralNetwork) => {
    network.survivedRounds += 1
    storage.set(STORAGE_KEYS.bestNetwork, network.toJSON())
}

export const backupNetwork = (network: NeuralNetwork) => {
    storage.set(STORAGE_KEYS.backupNetwork, network.toJSON())
}

export const restoreBackupNetwork = (): NeuralNetwork | undefined => {
    const json = storage.get<ReturnType<NeuralNetwork['toJSON']>>(STORAGE_KEYS.backupNetwork)
    return json ? NeuralNetwork.fromJSON(json) : undefined
}

export const resetBestNetwork = () => {
    storage.remove(STORAGE_KEYS.bestNetwork)
}

export const loadBestNetwork = (): NeuralNetwork | undefined => {
    const json = storage.get<ReturnType<NeuralNetwork['toJSON']>>(STORAGE_KEYS.bestNetwork)
    return json ? NeuralNetwork.fromJSON(json) : undefined
}

export const loadMutationRate = (): number | undefined =>
    storage.get<number>(STORAGE_KEYS.mutationRate)

export const saveMutationRate = (rate: number) => storage.set(STORAGE_KEYS.mutationRate, rate)

export const loadNumberOfCars = (): number | undefined =>
    storage.get<number>(STORAGE_KEYS.carsQuantity)

export const saveNumberOfCars = (n: number) => storage.set(STORAGE_KEYS.carsQuantity, n)

export const loadNeurons = (): Array<number> | undefined => {
    const str = storage.get<string>(STORAGE_KEYS.neurons)
    if (!str) return undefined
    return str.split(',').map((v) => Number(v))
}

export const saveNeurons = (neurons: string) => storage.set(STORAGE_KEYS.neurons, neurons)
