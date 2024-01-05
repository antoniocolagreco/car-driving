import type Point from './Point'

export default class Collision {
    position: Point
    offset: number

    constructor(position: Point, offest: number) {
        this.position = position
        this.offset = offest
    }
}
