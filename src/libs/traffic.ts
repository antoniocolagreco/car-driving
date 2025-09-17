import { Car } from '../models/car'
import type Road from '../models/road'

// Easy Mode 0 - 3
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

// Medium Mode 4 - 7
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

// Hard Mode 8 - 9
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

// VeryHard Mode 10 - 11
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

const getRandomInteger = (min: number, max: number): number => {
    return Math.floor(Math.random() * (max - min)) + min
}

const generateRoadConfiguration = (numberOfRows: number): Array<number> => {
    if (numberOfRows < 12) {
        numberOfRows = 12
    }

    const sectionSize = Math.floor(numberOfRows / 4)
    const easySection = { start: 0, end: sectionSize - 1 }
    const mediumSection = { start: sectionSize, end: sectionSize * 2 - 1 }
    const hardSection = { start: sectionSize * 2, end: sectionSize * 3 - 1 }
    const veryHardSection = { start: sectionSize * 3, end: numberOfRows - 1 }

    // Calculate actual section lengths
    const easySectionLength = easySection.end - easySection.start + 1
    const mediumSectionLength = mediumSection.end - mediumSection.start + 1
    const hardSectionLength = hardSection.end - hardSection.start + 1
    const veryHardSectionLength = veryHardSection.end - veryHardSection.start + 1

    // Easy section: guarantee all types (0-3), then fill with random
    const easySectionArray = [0, 1, 2, 3]
    while (easySectionArray.length < easySectionLength) {
        easySectionArray.push(getRandomInteger(0, 4))
    }
    easySectionArray.sort(() => Math.random() - 0.5)

    // Medium section: guarantee all types (4-7), then fill with random
    const mediumSectionArray = [4, 5, 6, 7]
    while (mediumSectionArray.length < mediumSectionLength) {
        mediumSectionArray.push(getRandomInteger(0, 8))
    }
    mediumSectionArray.sort(() => Math.random() - 0.5)

    // Hard section: guarantee all types (8-9), then fill with random
    const hardSectionArray = [8, 9]
    while (hardSectionArray.length < hardSectionLength) {
        hardSectionArray.push(getRandomInteger(0, 10))
    }
    hardSectionArray.sort(() => Math.random() - 0.5)

    // Very Hard section: guarantee all types (10-11), then fill with random
    const veryHardSectionArray = [10, 11]
    while (veryHardSectionArray.length < veryHardSectionLength) {
        veryHardSectionArray.push(getRandomInteger(0, 12))
    }
    veryHardSectionArray.sort(() => Math.random() - 0.5)

    const configuration = [
        ...easySectionArray,
        ...mediumSectionArray,
        ...hardSectionArray,
        ...veryHardSectionArray,
    ]

    console.log(configuration)

    return configuration
}

export const generateTraffic = (numberOfRows: number, road: Road): Array<Car> => {
    const traffic: Array<Car> = []
    const offset = -400

    const roadConfiguration = generateRoadConfiguration(numberOfRows)

    roadConfiguration.forEach((value, i) => {
        switch (value) {
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
    })

    traffic.forEach((vehicle) => vehicle.getControls().setForward(true))

    return traffic
}
