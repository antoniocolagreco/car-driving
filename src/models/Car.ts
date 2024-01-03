import type Position from './Position'
import Size from './Size'
import Vehicle from './Vehicle'
import VehicleStats from './VehicleStats'

export class Car extends Vehicle {
    constructor(position: Position) {
        super(position, new Size(30, 50), new VehicleStats(5, 0.02, 1, 0.05))
    }
}
