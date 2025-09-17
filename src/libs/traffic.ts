import type Vehicle from '@models/vehicle'
import { Car } from '../models/car'
import type Road from '../models/road'

// Easy Mode
const singleCenter = (road: Road, offset: number) => {
    return [new Car({ color: 'black', position: road.getLanePosition(1, offset) })]
}

const singleLeft = (road: Road, offset: number) => {
    return [new Car({ color: 'black', position: road.getLanePosition(0, offset) })]
}

const singleRight = (road: Road, offset: number) => {
    return [new Car({ color: 'black', position: road.getLanePosition(2, offset) })]
}

const bothSide = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(0, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(2, offset) }),
    ]
}

// Medium Mode
const doubleLeft = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(0, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(1, offset) }),
    ]
}

const doubleRight = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(1, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(2, offset) }),
    ]
}

const doubleMiddle = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(0, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(2, offset) }),
    ]
}

const doubleBothSides = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(0, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(0, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(2, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(2, offset) }),
    ]
}

// Hard Mode
const leftStairs = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(0, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(1, offset - 80) }),
    ]
}

const rightStairs = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(1, offset - 80) }),
        new Car({ color: 'black', position: road.getLanePosition(2, offset) }),
    ]
}

// VeryHard Mode
const rightL = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(2, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(1, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(1, offset - 100) }),
    ]
}

const leftL = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(0, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(1, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(1, offset - 100) }),
    ]
}

export const generateTraffic = (numberOfRows: number, road: Road): Array<Vehicle> => {
    const traffic: Array<Vehicle> = []
    const offset = -400
    const sectionSize = Math.floor(numberOfRows / 4)
    const easySection = { start: 0, end: sectionSize - 1 }
    const mediumSection = { start: sectionSize, end: sectionSize * 2 - 1 }
    const hardSection = { start: sectionSize * 2, end: sectionSize * 3 - 1 }
    const veryHardSection = { start: sectionSize * 3, end: numberOfRows - 1 }

    for (let i = 0; i < numberOfRows; i++) {
        let randomValue = 0

        if (i >= easySection.start && i <= easySection.end) {
            randomValue = Math.floor(Math.random() * 4)
        } else if (i >= mediumSection.start && i <= mediumSection.end) {
            randomValue = Math.floor(Math.random() * 8)
        } else if (i >= hardSection.start && i <= hardSection.end) {
            randomValue = Math.floor(Math.random() * 10)
        } else if (i >= veryHardSection.start && i <= veryHardSection.end) {
            randomValue = Math.floor(Math.random() * 12)
        }

        switch (randomValue) {
            case 0:
                traffic.push(...singleCenter(road, offset * i + offset))
                break
            case 1:
                traffic.push(...singleLeft(road, offset * i + offset))
                break
            case 2:
                traffic.push(...singleRight(road, offset * i + offset))
                break
            case 3:
                traffic.push(...bothSide(road, offset * i + offset))
                break
            case 4:
                traffic.push(...doubleLeft(road, offset * i + offset))
                break
            case 5:
                traffic.push(...doubleRight(road, offset * i + offset))
                break
            case 6:
                traffic.push(...doubleMiddle(road, offset * i + offset))
                break
            case 7:
                traffic.push(...doubleBothSides(road, offset * i + offset))
                break
            case 8:
                traffic.push(...leftStairs(road, offset * i + offset))
                break
            case 9:
                traffic.push(...rightStairs(road, offset * i + offset))
                break
            case 10:
                traffic.push(...leftL(road, offset * i + offset))
                break
            case 11:
                traffic.push(...rightL(road, offset * i + offset))
                break
            default:
                break
        }
    }
    for (const vehicle of traffic) {
        vehicle.getControls().setForward(true)
    }
    return traffic
}
