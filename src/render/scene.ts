import { SIMULATION } from '@core/config'
import { PLAYER_COLOR, type RacingCar } from '@core/population'
import type { SimulationState } from '@core/simulation'
import type { CanvasLayer } from './canvas'
import { cameraTranslation } from './camera'
import { drawGround, drawRoad } from './world'
import { drawCar, drawSensors } from './car'

/** Options that affect only what is painted in the current frame. */
export type SceneOptions = {
    /** Whether black traffic cars are drawn. Simulation state is always unchanged. */
    readonly trafficVisible?: boolean
    /** Whether the followed car's radar is drawn. Perception remains active. */
    readonly radarVisible?: boolean
}

/**
 * Draws one full frame of the race. Racing cars have an explicit paint priority:
 * ordinary population, previous champion, current winner, then manually driven player.
 * A car that belongs to multiple categories is painted once at its highest-priority layer.
 *
 * Pure with respect to the simulation: reads `state`, draws onto `layer`,
 * mutates neither.
 */
export const drawScene = (
    layer: CanvasLayer,
    state: SimulationState,
    options: SceneOptions = {},
): void => {
    const ctx = layer.context
    const trafficVisible: boolean = options.trafficVisible ?? true
    const radarVisible: boolean = options.radarVisible ?? true
    layer.clear()

    // Fall back to the first traffic car when nothing is being followed (an
    // empty population), so the camera still lands somewhere on the course
    // instead of at the world origin.
    const followY = state.activeCar?.car.position.y ?? state.traffic[0]?.position.y ?? 0
    const translation = cameraTranslation(layer, followY)

    ctx.save()
    ctx.translate(translation.x, translation.y)

    drawGround(ctx, state.road)
    drawRoad(ctx, state.road)

    const championCar: RacingCar | undefined = state.champion
        ? state.cars.find((racingCar) => racingCar.network === state.champion)
        : undefined
    const currentWinner: RacingCar | undefined = state.bestCar
    const manualPlayerCar: RacingCar | undefined = state.manualDriving
        ? state.playerCar
        : undefined

    // Perception belongs below every car body, so it never paints sensor colour across
    // either the followed racer or the traffic obstacles.
    if (radarVisible && state.activeCar) {
        drawSensors(ctx, state.activeCar.sensorState)
    }

    // 1. Ordinary evolved cars: always the lowest racing-car layer. A network-driven
    // player belongs here too. The camera target remains opaque so the followed car
    // never disappears into the translucent population.
    for (const racingCar of state.cars) {
        if (
            racingCar === championCar ||
            racingCar === currentWinner ||
            racingCar === manualPlayerCar
        ) {
            continue
        }
        drawCar(ctx, racingCar.car, {
            ghost: racingCar !== state.activeCar,
            winner: racingCar.winner,
        })
    }

    // 2. Previous champion. No display offset: every car starts from the exact same
    // physical and visual point.
    if (championCar && championCar !== currentWinner && championCar !== manualPlayerCar) {
        drawCar(ctx, championCar.car, { winner: championCar.winner })
    }

    // 3. Current winner.
    if (currentWinner && currentWinner !== manualPlayerCar) {
        drawCar(ctx, currentWinner.car, { winner: currentWinner.winner })
    }

    // 4. Only a manually driven player gets the dedicated blue, topmost layer.
    if (manualPlayerCar) {
        drawCar(ctx, manualPlayerCar.car, {
            color: PLAYER_COLOR,
            winner: manualPlayerCar.winner,
        })
    }

    // 5. Traffic obstacles are deliberately last: their physical bodies must remain
    // visually solid even when sensor areas or racing cars overlap them.
    if (trafficVisible) {
        for (const trafficCar of state.traffic) {
            drawCar(ctx, trafficCar)
        }
    }

    ctx.restore()

    if (state.courseCleared && !state.gameOver) {
        drawVictory(layer, state)
    } else if (state.gameOver) {
        drawGameOver(layer, state)
    }
}

/** Draws the five-second green celebration without stopping the simulation underneath. */
export const drawVictory = (layer: CanvasLayer, state: SimulationState): void => {
    const ctx = layer.context
    const centerX = layer.width / 2
    const centerY = layer.height / 2
    const secondsLeft = Math.max(
        0,
        Math.ceil(SIMULATION.victoryCelebrationSeconds - state.victorySeconds),
    )

    ctx.save()
    ctx.font = 'bold 36px monospace'
    ctx.fillStyle = '#22c55e'
    ctx.strokeStyle = '#052e16'
    ctx.lineWidth = 5
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeText('VICTORY!', centerX, centerY - 40)
    ctx.fillText('VICTORY!', centerX, centerY - 40)

    ctx.font = 'bold 20px monospace'
    const detail = `Course cleared — closing in ${secondsLeft}s`
    ctx.strokeText(detail, centerX, centerY)
    ctx.fillText(detail, centerX, centerY)
    ctx.restore()
}

/**
 * Draws the end-of-round overlay: the winning network's id and fitness, or a
 * fallback message for the (rare, empty-population) case where nobody was
 * ever scored.
 */
export const drawGameOver = (layer: CanvasLayer, state: SimulationState): void => {
    const ctx = layer.context
    const centerX = layer.width / 2
    const centerY = layer.height / 2

    ctx.save()
    ctx.font = '32px monospace'
    ctx.lineWidth = 3
    ctx.setLineDash([])
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (state.bestCar) {
        ctx.fillStyle = state.courseCleared ? '#22c55e' : '#fff'
        ctx.strokeStyle = 'black'

        const idLine = state.bestCar.network.id
        const winsLine = state.courseCleared ? 'CLEARS THE COURSE' : 'WINS'
        const fitnessLine = `with ${Math.round(state.bestCar.stats.fitness)} points`

        ctx.strokeText(idLine, centerX, centerY - 80)
        ctx.fillText(idLine, centerX, centerY - 80)
        ctx.strokeText(winsLine, centerX, centerY - 40)
        ctx.fillText(winsLine, centerX, centerY - 40)
        ctx.strokeText(fitnessLine, centerX, centerY)
        ctx.fillText(fitnessLine, centerX, centerY)
    } else {
        // The population was empty: nobody ran, so nobody could be scored.
        // With the current fitness system this is the only way a generation
        // can end without a winner.
        ctx.fillStyle = '#ff6b6b'
        ctx.strokeStyle = 'darkred'

        const titleLine = 'NO WINNER'
        const detailLine = 'The generation ended with no scored car'

        ctx.strokeText(titleLine, centerX, centerY - 80)
        ctx.fillText(titleLine, centerX, centerY - 80)

        ctx.font = '20px monospace'
        ctx.strokeText(detailLine, centerX, centerY - 40)
        ctx.fillText(detailLine, centerX, centerY - 40)
    }

    ctx.restore()
}
