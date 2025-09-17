import Features from './features'
import Size from './size'
import Vehicle, { type VehicleProps } from './vehicle'

export type CarProps = Omit<VehicleProps, 'features'> & {
    features?: Features
}

export class Car extends Vehicle {
    constructor({ features, ...rest }: CarProps) {
        super({
            ...rest,
            features:
                features ||
                new Features({
                    maxSpeed: 5,
                    acceleration: 0.02,
                    maxReverse: 1,
                    breakPower: 0.05,
                }),
        })
        this.size = new Size(40, 70)
    }
}
