import { type Segment, type Vec2, vec } from '@core/geometry'
import { clamp } from '@core/math'
import { WORLD } from '@core/config'

/**
 * The road: a fixed-width corridor of `laneCount` lanes running the whole height
 * of the world, plus the two guard rails cars crash into if they drift off it.
 * The road is centered on x = 0, matching the coordinate convention the rest of
 * the simulation (car start position, traffic rows) already assumes.
 */

export type Road = {
    readonly width: number
    readonly height: number
    readonly laneCount: number
    readonly laneWidth: number
    /** The two guard rails, as segments; cars crash into them. */
    readonly borders: readonly Segment[]
    /** Left edge x of the road in world coordinates. */
    readonly left: number
}

/**
 * Distance, in px, from the world's vertical centre up to the start line. The
 * world is much taller than the driving course itself, so the start line sits
 * well above the centre rather than at y = 0.
 */
const START_LINE_OFFSET = 5000

/** Builds the road described by `WORLD` in config. */
export const createRoad = (): Road => {
    const width = WORLD.roadWidth
    const height = WORLD.height
    const laneCount = WORLD.laneCount
    const laneWidth = width / laneCount
    const left = -width / 2
    const right = width / 2

    // Borders run from just above the top of the world down to the bottom, well
    // past any position a car can ever reach, so they act as an effectively
    // infinite guard rail without needing special-casing at the ends.
    const borders: Segment[] = [
        { a: vec(left, -height / 2), b: vec(left, height) },
        { a: vec(right, -height / 2), b: vec(right, height) },
    ]

    return { width, height, laneCount, laneWidth, borders, left }
}

/** Center of `laneIndex` at `offset` px along the road; clamps the index into range. */
export const lanePosition = (road: Road, laneIndex: number, offset = 0): Vec2 => {
    const index = clamp(laneIndex, 0, road.laneCount - 1)
    const x = -(road.width / 2) + (road.laneWidth * (index + 1) - road.laneWidth / 2)
    const y = Math.floor(road.height / 2) - START_LINE_OFFSET + offset

    return vec(x, y)
}
