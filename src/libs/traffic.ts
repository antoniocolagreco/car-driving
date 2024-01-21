import { Car } from '../models/Car'
import type Road from '../models/Road'

export const getTrafficRow = (road: Road, offset: number) => {
    return rowType[Math.floor(Math.random() * rowType.length)](road, offset)
}

export const singleCenter = (road: Road, offset: number) => {
    return [new Car({ color: 'black', position: road.getLanePosition(1, offset) })]
}

export const singleLeft = (road: Road, offset: number) => {
    return [new Car({ color: 'black', position: road.getLanePosition(0, offset) })]
}

export const singleRight = (road: Road, offset: number) => {
    return [new Car({ color: 'black', position: road.getLanePosition(2, offset) })]
}

export const bothSide = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(0, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(2, offset) }),
    ]
}

export const doubleLeft = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(0, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(1, offset) }),
    ]
}

export const doubleRight = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(1, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(2, offset) }),
    ]
}

export const leftCurve = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(0, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(1, offset - 80) }),
    ]
}

export const rightCurve = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(1, offset - 80) }),
        new Car({ color: 'black', position: road.getLanePosition(2, offset) }),
    ]
}

const rowType = [singleCenter, singleLeft, singleRight, bothSide, doubleLeft, doubleRight, leftCurve, rightCurve]
