import type Vehicle from '@models/vehicle'
import type Road from '@models/road'
import { getTrafficRow } from './traffic'

export const generateTraffic = (rowsOfCar: number, road: Road): Array<Vehicle> => {
    const traffic: Array<Vehicle> = []
    const offset = -400
    for (let i = 0; i < rowsOfCar; i++) {
        const carsRow = getTrafficRow(road, offset * i + offset)
        traffic.push(...carsRow)
    }
    for (const vehicle of traffic) vehicle.controls.forward = true
    return traffic
}
