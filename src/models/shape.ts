import type Point from './point'

export default class Shape {
    protected points: Array<Point>

    constructor(...points: Array<Point>) {
        this.points = points
    }

    toArrayOfLines(): Array<Shape> {
        if (!this.isLine()) {
            const lines: Array<Shape> = []
            for (let index = 0; index < this.points.length; index++) {
                const line = new Shape(
                    this.points[index],
                    this.points[(index + 1) % this.points.length],
                )
                lines.push(line)
            }
            return lines
        }
        return [this]
    }

    getPoints() {
        return this.points
    }

    getPointAt(index: number) {
        return this.points[index]
    }

    setPoints(points: Array<Point>) {
        this.points = points
    }

    setPointAt(index: number, point: Point) {
        this.points[index] = point
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
