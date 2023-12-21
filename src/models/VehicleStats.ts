export default class VehicleStats {
    maxSpeed: number
    acceleration: number
    maxReverse: number
    breakPower: number

    constructor(maxSpeed: number, acceleration: number, maxReverse: number, breakPower: number) {
        this.maxSpeed = maxSpeed
        this.acceleration = acceleration
        this.maxReverse = maxReverse
        this.breakPower = breakPower
    }
}
