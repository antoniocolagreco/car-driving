import { DEFAULTS } from 'src/constants'

type ConfigurationOptions = {
    mutationRate?: number
    carsQuantity?: number
    networkArchitecture?: ReadonlyArray<number>
}

export default class Configuration {
    private mutationRate: number
    private carsQuantity: number
    private readonly networkArchitecture: ReadonlyArray<number>

    getMutationRate(): number {
        return this.mutationRate
    }

    setMutationRate(value: number): void {
        this.mutationRate = value
    }

    getCarsQuantity(): number {
        return this.carsQuantity
    }
    setCarsQuantity(value: number): void {
        this.carsQuantity = value
    }

    getNetworkArchitecture(): ReadonlyArray<number> {
        return this.networkArchitecture
    }

    constructor({ carsQuantity, mutationRate, networkArchitecture }: ConfigurationOptions) {
        this.mutationRate = mutationRate ?? DEFAULTS.mutationRate
        this.carsQuantity = carsQuantity ?? DEFAULTS.carsQuantity
        this.networkArchitecture = networkArchitecture ?? [...DEFAULTS.networkArchitecture]
    }
}
