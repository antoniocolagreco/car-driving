export type FeaturesProps = {
    maxSpeed: number
    acceleration: number
    maxReverse: number
    breakPower: number
}

export default class Features {
    maxSpeed: number
    acceleration: number
    maxReverse: number
    breakPower: number

    constructor(props: FeaturesProps) {
        this.maxSpeed = props.maxSpeed
        this.acceleration = props.acceleration
        this.maxReverse = props.maxReverse
        this.breakPower = props.breakPower
    }
}
