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
    const manualPlayerCar: RacingCar | undefined = state.manualDriving ? state.playerCar : undefined

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

    // 2. Previous champion, painted at its real world position with no display offset.
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

type FireworkBurst = {
    readonly xRatio: number
    readonly yRatio: number
    readonly delaySeconds: number
    readonly phase: number
    readonly color: string
}

const FIREWORK_BURSTS: readonly FireworkBurst[] = [
    { xRatio: 0.18, yRatio: 0.25, delaySeconds: 0, phase: 0, color: '#f97316' },
    { xRatio: 0.82, yRatio: 0.2, delaySeconds: 0.35, phase: 0.12, color: '#22d3ee' },
    { xRatio: 0.5, yRatio: 0.34, delaySeconds: 0.7, phase: 0.24, color: '#e879f9' },
    { xRatio: 0.3, yRatio: 0.5, delaySeconds: 1.05, phase: 0.36, color: '#4ade80' },
    { xRatio: 0.7, yRatio: 0.46, delaySeconds: 1.4, phase: 0.48, color: '#fde047' },
] as const

const FIREWORK_CYCLE_SECONDS = 2
const FIREWORK_EXPLOSION_SECONDS = 1.6
const FIREWORK_PARTICLES = 20

/** Deterministic screen-space fireworks: smooth animation without mutable particle state. */
const drawFireworks = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    elapsedSeconds: number,
): void => {
    const scale: number = Math.min(width, height)

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'

    for (const burst of FIREWORK_BURSTS) {
        const sinceFirstLaunch: number = elapsedSeconds - burst.delaySeconds
        if (sinceFirstLaunch < 0) {
            continue
        }

        const age: number = sinceFirstLaunch % FIREWORK_CYCLE_SECONDS
        const centerX: number = width * burst.xRatio
        const centerY: number = height * burst.yRatio
        ctx.strokeStyle = burst.color
        ctx.shadowColor = burst.color
        ctx.shadowBlur = 8

        const explosionProgress: number = age / FIREWORK_EXPLOSION_SECONDS
        if (explosionProgress >= 1) {
            continue
        }

        const fade: number = (1 - explosionProgress) ** 1.4
        const radius: number = scale * (0.05 + explosionProgress * 0.24)
        const gravity: number = scale * 0.08 * explosionProgress ** 2
        ctx.globalAlpha = fade
        ctx.lineWidth = Math.max(1, 2.5 * fade)

        for (let particle = 0; particle < FIREWORK_PARTICLES; particle++) {
            const angle: number = (Math.PI * 2 * particle) / FIREWORK_PARTICLES + burst.phase
            const lengthVariation: number = 0.72 + ((particle * 7) % 5) * 0.07
            const distance: number = radius * lengthVariation
            const tipX: number = centerX + Math.cos(angle) * distance
            const tipY: number = centerY + Math.sin(angle) * distance + gravity
            const tailDistance: number = Math.max(0, distance - scale * 0.025)
            const tailX: number = centerX + Math.cos(angle) * tailDistance
            const tailY: number = centerY + Math.sin(angle) * tailDistance + gravity * 0.8

            ctx.beginPath()
            ctx.moveTo(tailX, tailY)
            ctx.lineTo(tipX, tipY)
            ctx.stroke()
        }
    }

    ctx.restore()
}

/** Draws fireworks and the green banner over the live five-second victory parade. */
export const drawVictory = (layer: CanvasLayer, state: SimulationState): void => {
    const ctx = layer.context
    const centerX = layer.width / 2
    const centerY = layer.height / 2
    const secondsLeft = Math.max(
        0,
        Math.ceil(SIMULATION.victoryCelebrationSeconds - state.victorySeconds),
    )

    drawFireworks(ctx, layer.width, layer.height, state.victorySeconds)

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
