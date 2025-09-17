/**@class Default to 0,0 */
export default class Point {
    private x: number
    private y: number

    constructor(x: number = 0, y: number = 0) {
        this.x = x
        this.y = y
    }

    set(x: number, y: number) {
        this.x = x
        this.y = y
    }

    getX(): number {
        return this.x
    }

    setX(value: number) {
        this.x = value
    }

    getY(): number {
        return this.y
    }

    setY(value: number) {
        this.y = value
    }
}
