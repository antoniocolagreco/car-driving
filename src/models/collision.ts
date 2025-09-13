import type Point from './point'

export default class Collision {
    position: Point
    offset: number

    constructor(position: Point, offest: number) {
        this.position = position
        this.offset = offest
    }
}
