import { clamp } from '@libs/utils'

export class SimulationConfig {
    private mutationRate: number
    private carsQuantity: number
    private networkArchitecture: number[]
    private sensorCount: number
    private sensorSpread: number

    constructor(
        mutationRate: number,
        carsQuantity: number,
        networkArchitecture: number[],
        sensorCount: number,
        sensorSpread: number,
    ) {
        this.mutationRate = mutationRate
        this.carsQuantity = carsQuantity
        this.networkArchitecture = networkArchitecture
        this.sensorCount = Math.min(36, Math.max(3, Math.round(sensorCount)))
        const twoPi = Math.PI * 2
        this.sensorSpread = clamp(0, twoPi, sensorSpread)
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

    getSensorCount() {
        return this.sensorCount
    }

    getSensorSpread() {
        return this.sensorSpread
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

    setSensorCount(value: number) {
        this.sensorCount = Math.min(36, Math.max(3, Math.round(value)))
    }

    setSensorSpread(value: number) {
        const twoPi = Math.PI * 2
        this.sensorSpread = clamp(0, twoPi, value)
    }
}
