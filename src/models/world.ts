import Map from './map'
import Point from './point'
import Road from './road'
import Size from './size'

export interface WorldConfig {
    canvas: {
        width: number
        height: number
    }
    map: {
        width: number
        height: number
    }
    road: {
        width: number
        laneCount: number
    }
}

export default class World {
    private map: Map
    private road: Road

    constructor(config: WorldConfig) {
        const mapPosition = new Point(config.canvas.width / 2, config.canvas.height / 2)

        // Create a much larger world for simulation
        const worldWidth = config.map.width
        const worldHeight = config.map.height

        this.map = new Map({
            position: mapPosition,
            size: new Size(worldWidth, worldHeight),
        })

        this.road = new Road({
            position: new Point(config.road.width / 2, worldHeight / 2),
            size: new Size(config.road.width, worldHeight), // Road width 240px, same height as world
            laneCount: config.road.laneCount,
        })
    }

    getMap(): Map {
        return this.map
    }

    getRoad(): Road {
        return this.road
    }
}
