import { DEFAULTS } from 'src/constants'

type ConfigurationOptions = {
    mutationRate?: number
    carsQuantity?: number
    neurons?: Array<number>
}

export default class Configuration {
    private mutationRate: number
    private carsQuantity: number
    private readonly neurons: ReadonlyArray<number>

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

    getNeurons(): ReadonlyArray<number> {
        return this.neurons
    }

    constructor({ carsQuantity, mutationRate, neurons }: ConfigurationOptions) {
        this.mutationRate = mutationRate ?? DEFAULTS.mutationRate
        this.carsQuantity = carsQuantity ?? DEFAULTS.carsQuantity
        this.neurons = neurons ?? [...DEFAULTS.neurons]
    }
}
