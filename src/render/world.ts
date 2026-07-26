import { WORLD } from '@core/config'
import type { Road } from '@core/road'

/**
 * The static parts of the scenery: the green ground the road sits on, and the
 * road itself (its gray surface, its guard-rail edges and its dashed lane
 * separators). Neither reads anything from the simulation state beyond the
 * `Road` it is given — they never change once the road is built.
 */

/** How far past the road's own edges the gray tarmac extends on each side, in px. */
const ROAD_MARGIN = 10

/** Width of the white lines that mark the road's outer edges, in px. */
const BORDER_LINE_WIDTH = 5

/** Draws the green ground the road sits on, centred on the world's x = 0 axis. */
export const drawGround = (ctx: CanvasRenderingContext2D, road: Road): void => {
    ctx.fillStyle = 'green'
    ctx.fillRect(-WORLD.width / 2, -road.height / 2, WORLD.width, road.height)
}

/**
 * Draws the road: gray tarmac, solid white borders at the outer edges, and a
 * dashed white line between every pair of lanes.
 */
export const drawRoad = (ctx: CanvasRenderingContext2D, road: Road): void => {
    const x = road.left
    const y = -road.height / 2

    ctx.fillStyle = 'gray'
    ctx.fillRect(x - ROAD_MARGIN, y, road.width + ROAD_MARGIN * 2, road.height)

    ctx.strokeStyle = 'white'
    ctx.lineWidth = BORDER_LINE_WIDTH
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, road.height)
    ctx.moveTo(x + road.width, y)
    ctx.lineTo(x + road.width, road.height)
    ctx.stroke()

    ctx.setLineDash([20, 10])
    ctx.beginPath()
    for (let index = 1; index < road.laneCount; index++) {
        ctx.moveTo(x + road.laneWidth * index, y)
        ctx.lineTo(x + road.laneWidth * index, road.height)
    }
    ctx.stroke()
}
