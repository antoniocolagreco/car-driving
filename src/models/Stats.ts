export type StatsProps = {
    maxSpeed: number
    acceleration: number
    maxReverse: number
    breakPower: number
}

export default class Stats {
    maxSpeed: number
    acceleration: number
    maxReverse: number
    breakPower: number

    constructor(props: StatsProps) {
        this.maxSpeed = props.maxSpeed
        this.acceleration = props.acceleration
        this.maxReverse = props.maxReverse
        this.breakPower = props.breakPower
    }
}
