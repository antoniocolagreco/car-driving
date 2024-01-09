import type Controls from './Controls'
import type Sensor from './Sensor'

export type DriverProps = {
    controls: Controls
    sensor: Sensor
}

export default class Driver {
    controls: Controls
    sensor: Sensor

    constructor(props: DriverProps) {
        const { controls, sensor } = props
        this.controls = controls
        this.sensor = sensor
    }

    drive() {}
}
