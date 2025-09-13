import Features from './features'
import Size from './size'
import Vehicle, { type VehicleProps } from './vehicle'

export type CarProps = Omit<VehicleProps, 'features'> & {
    features?: Features
}

export class Car extends Vehicle {
    constructor(props: CarProps) {
        const { features, size, ...otherProps } = props
        super({
            ...otherProps,
            size: size ?? new Size(40, 70),
            features:
                features ??
                new Features({ maxSpeed: 5, acceleration: 0.02, maxReverse: 1, breakPower: 0.05 }),
        })
    }
}
