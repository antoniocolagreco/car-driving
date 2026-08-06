import { type Segment, type Vec2, vec } from '@core/geometry'
import { clamp } from '@core/math'
import { WORLD } from '@core/config'

export type Road = {
    readonly width: number
    readonly height: number
    readonly laneCount: number
    readonly laneWidth: number
    /** Guard rails. */
    readonly borders: readonly Segment[]
    readonly left: number
}

/** Distance from world center to the start line. */
const START_LINE_OFFSET = 5000

export const createRoad = (): Road => {
    const width = WORLD.roadWidth
    const height = WORLD.height
    const laneCount = WORLD.laneCount
    const laneWidth = width / laneCount
    const left = -width / 2
    const right = width / 2

    // Extend borders past all reachable positions to avoid endpoint cases.
    const borders: Segment[] = [
        { a: vec(left, -height / 2), b: vec(left, height) },
        { a: vec(right, -height / 2), b: vec(right, height) },
    ]

    return { width, height, laneCount, laneWidth, borders, left }
}

/** Lane center at a road offset; clamps the index. */
export const lanePosition = (road: Road, laneIndex: number, offset = 0): Vec2 => {
    const index = clamp(laneIndex, 0, road.laneCount - 1)
    const x = -(road.width / 2) + (road.laneWidth * (index + 1) - road.laneWidth / 2)
    const y = Math.floor(road.height / 2) - START_LINE_OFFSET + offset

    return vec(x, y)
}
