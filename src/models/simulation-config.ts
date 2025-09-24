export class SimulationConfig {
    private mutationRate: number
    private carsQuantity: number
    private networkArchitecture: number[]

    constructor(mutationRate: number, carsQuantity: number, networkArchitecture: number[]) {
        this.mutationRate = mutationRate
        this.carsQuantity = carsQuantity
        this.networkArchitecture = networkArchitecture
    }

    getMutationRate() {
        return this.mutationRate
    }

    getCarsQuantity() {
        return this.carsQuantity
    }

    getNetworkArchitecture() {
        return this.networkArchitecture
    }

    setMutationRate(value: number) {
        this.mutationRate = value
    }

    setCarsQuantity(value: number) {
        this.carsQuantity = value
    }

    setNetworkArchitecture(value: number[]) {
        this.networkArchitecture = value
    }
}
