import type Vehicle from '@models/vehicle'
import { Car } from '../models/car'
import type Road from '../models/road'

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

const leftCurve = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(0, offset) }),
        new Car({ color: 'black', position: road.getLanePosition(1, offset - 80) }),
    ]
}

const rightCurve = (road: Road, offset: number) => {
    return [
        new Car({ color: 'black', position: road.getLanePosition(1, offset - 80) }),
        new Car({ color: 'black', position: road.getLanePosition(2, offset) }),
    ]
}

export const generateTraffic = (numberOfRows: number, road: Road): Array<Vehicle> => {
    const traffic: Array<Vehicle> = []
    const offset = -400
    for (let i = 0; i < numberOfRows; i++) {
        const randomValue = Math.floor(Math.random() * 8)

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
                traffic.push(...leftCurve(road, offset * i + offset))
                break
            case 7:
                traffic.push(...rightCurve(road, offset * i + offset))
                break
        }
    }
    for (const vehicle of traffic) {
        vehicle.getControls().setForward(true)
    }
    return traffic
}
