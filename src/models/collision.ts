import type Point from './point'

export default class Collision {
    private position: Point
    private offset: number

    constructor(position: Point, offset: number) {
        this.position = position
        this.offset = offset
    }

    getPosition(): Point {
        return this.position
    }

    getOffset(): number {
        return this.offset
    }
}
