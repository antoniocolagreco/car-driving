import { WORLD } from '@core/config'
import type { Road } from '@core/road'

const ROAD_MARGIN = 10

const BORDER_LINE_WIDTH = 5

export const drawGround = (ctx: CanvasRenderingContext2D, road: Road): void => {
    ctx.fillStyle = 'green'
    ctx.fillRect(-WORLD.width / 2, -road.height / 2, WORLD.width, road.height)
}

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
