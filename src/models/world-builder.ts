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

export interface World {
    map: Map
    road: Road
}

export class WorldBuilder {
    static createWorld(config: WorldConfig): World {
        const mapPosition = new Point(config.canvas.width / 2, config.canvas.height / 2)

        const worldMap = new Map({
            position: mapPosition,
            size: new Size(config.map.width, config.map.height),
        })

        const road = new Road({
            position: new Point(config.canvas.width / 2, config.canvas.height / 2),
            size: new Size(config.road.width, config.map.height),
            laneCount: config.road.laneCount,
        })

        return {
            map: worldMap,
            road,
        }
    }

    static getDefaultConfig(canvasWidth: number, canvasHeight: number): WorldConfig {
        return {
            canvas: {
                width: canvasWidth,
                height: canvasHeight,
            },
            map: {
                width: 1000,
                height: 100000,
            },
            road: {
                width: 240,
                laneCount: 3,
            },
        }
    }
}
