import type Position from './Position'
import Size from './Size'
import Vehicle from './Vehicle'
import VehicleStats from './VehicleStats'

export class Car extends Vehicle {
    constructor(context: CanvasRenderingContext2D, position: Position) {
        super(context, position, new Size(30, 50), new VehicleStats(5, 0.02, 0.5, 0.05))
    }
}
