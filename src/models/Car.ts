import Size from './Size'
import Stats from './Stats'
import Vehicle, { type VehicleProps } from './Vehicle'

export type CarProps = Omit<VehicleProps, 'stats'> & {
    stats?: Stats
}

export class Car extends Vehicle {
    constructor(props: CarProps) {
        const { stats, size, ...otherProps } = props
        super({
            ...otherProps,
            size: size ?? new Size(40, 70),
            stats: stats ?? new Stats({ maxSpeed: 5, acceleration: 0.02, maxReverse: 1, breakPower: 0.05 }),
        })
    }
}
