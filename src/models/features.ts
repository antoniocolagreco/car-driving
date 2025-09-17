export type FeaturesProps = {
    maxSpeed: number
    acceleration: number
    maxReverse: number
    breakPower: number
}

export default class Features {
    private maxSpeed: number
    private acceleration: number
    private maxReverse: number
    private breakPower: number

    constructor(props: FeaturesProps) {
        this.maxSpeed = props.maxSpeed
        this.acceleration = props.acceleration
        this.maxReverse = props.maxReverse
        this.breakPower = props.breakPower
    }

    // Getters
    getMaxSpeed(): number {
        return this.maxSpeed
    }

    getAcceleration(): number {
        return this.acceleration
    }

    getMaxReverse(): number {
        return this.maxReverse
    }

    getBreakPower(): number {
        return this.breakPower
    }

    // Setters
    setMaxSpeed(value: number): void {
        this.maxSpeed = value
    }

    setAcceleration(value: number): void {
        this.acceleration = value
    }

    setMaxReverse(value: number): void {
        this.maxReverse = value
    }

    setBreakPower(value: number): void {
        this.breakPower = value
    }
}
