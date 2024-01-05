import type Point from './Point'

export default class Shape {
    points: Array<Point>

    constructor(...points: Array<Point>) {
        this.points = points
    }

    toArrayOfLines(): Array<Shape> {
        if (!this.isLine()) {
            const lines: Array<Shape> = []
            for (let index = 0; index < this.points.length; index++) {
                const line = new Shape(this.points[index], this.points[(index + 1) % this.points.length])
                lines.push(line)
            }
            return lines
        }
        return [this]
    }

    get(index: number) {
        return this.points[index]
    }

    getFirst() {
        return this.points[0]
    }

    getLast() {
        return this.points[this.points.length - 1]
    }

    isValid() {
        return this.points.length > 1
    }

    isLine() {
        return this.points.length === 2
    }

    isPolygon() {
        return this.points.length > 2
    }
}
