import { SIMULATION } from '@core/config'
import type { SimulationState } from '@core/simulation'
import { ELEMENT_IDS, findElement } from './dom'

/**
 * The didactic centrepiece: shows which car the camera follows, how the
 * generation is going and, most importantly, the full fitness breakdown so the
 * reward system (`@core/fitness`) is actually visible while it runs.
 *
 * Every element reference is resolved ONCE, in `createHud`, and every update
 * writes `textContent` only (never `innerHTML`) — the original HUD re-ran
 * ~15 `querySelector` calls and rebuilt markup with `innerHTML` every single
 * frame. Numeric fields are throttled to ~10 Hz; nobody can read digits changing
 * faster than that anyway, and it is one less thing competing with the frame loop.
 */

export type Hud = {
    /** Call once per rendered frame; internally throttled. */
    update(state: SimulationState, fps: number): void
}

/** Numeric fields refresh at most this often. */
const UPDATE_INTERVAL_MS = 100

type BreakdownElements = {
    overtakes: HTMLElement
    progress: HTMLElement
    pace: HTMLElement
    survival: HTMLElement
    crash: HTMLElement
    stall: HTMLElement
    hazard: HTMLElement
    reverse: HTMLElement
}

type HudElements = {
    networkId: HTMLElement
    generation: HTMLElement
    completedGenerations: HTMLElement
    aliveCars: HTMLElement
    bestFitness: HTMLElement
    currentFitness: HTMLElement
    idleTimeout: HTMLElement
    overtakeTimeout: HTMLElement
    speed: HTMLElement
    headingDeviation: HTMLElement
    fps: HTMLElement
    breakdown: BreakdownElements
    statusRegion: HTMLElement | undefined
}

/** Resolves every HUD element once; `undefined` when a required one is missing from the page. */
const resolveElements = (): HudElements | undefined => {
    const ids = ELEMENT_IDS.hud
    const networkId = findElement(ids.networkId)
    const generation = findElement(ids.generation)
    const completedGenerations = findElement(ids.completedGenerations)
    const aliveCars = findElement(ids.aliveCars)
    const bestFitness = findElement(ids.bestFitness)
    const currentFitness = findElement(ids.currentFitness)
    const idleTimeout = findElement(ids.idleTimeout)
    const overtakeTimeout = findElement(ids.overtakeTimeout)
    const speed = findElement(ids.speed)
    const headingDeviation = findElement(ids.headingDeviation)
    const fps = findElement(ids.fps)
    const overtakes = findElement(ids.breakdown.overtakes)
    const progress = findElement(ids.breakdown.progress)
    const pace = findElement(ids.breakdown.pace)
    const survival = findElement(ids.breakdown.survival)
    const crash = findElement(ids.breakdown.crash)
    const stall = findElement(ids.breakdown.stall)
    const hazard = findElement(ids.breakdown.hazard)
    const reverse = findElement(ids.breakdown.reverse)

    if (
        !networkId ||
        !generation ||
        !completedGenerations ||
        !aliveCars ||
        !bestFitness ||
        !currentFitness ||
        !idleTimeout ||
        !overtakeTimeout ||
        !speed ||
        !headingDeviation ||
        !fps ||
        !overtakes ||
        !progress ||
        !pace ||
        !survival ||
        !crash ||
        !stall ||
        !hazard ||
        !reverse
    ) {
        return undefined
    }

    return {
        networkId,
        generation,
        completedGenerations,
        aliveCars,
        bestFitness,
        currentFitness,
        idleTimeout,
        overtakeTimeout,
        speed,
        headingDeviation,
        fps,
        breakdown: {
            overtakes,
            progress,
            pace,
            survival,
            crash,
            stall,
            hazard,
            reverse,
        },
        statusRegion: findElement(ELEMENT_IDS.statusRegion),
    }
}

/** Writes `text` only when it actually changed, so the DOM is not touched needlessly. */
const setText = (element: HTMLElement, text: string): void => {
    if (element.textContent !== text) {
        element.textContent = text
    }
}

const formatNumber = (value: number | undefined, decimals = 1): string =>
    value === undefined ? '–' : value.toFixed(decimals)

const formatCountdown = (value: number | undefined): string =>
    value === undefined ? '–' : `${value.toFixed(1)} s`

/** Builds the HUD, resolving its DOM elements once. Missing elements make `update` a no-op. */
export const createHud = (): Hud => {
    const elements = resolveElements()
    let lastUpdateMs = 0
    let lastGeneration: number | undefined
    let lastGameOver: boolean | undefined

    const announce = (state: SimulationState): void => {
        if (!elements?.statusRegion) {
            return
        }
        if (state.generation !== lastGeneration) {
            lastGeneration = state.generation
            lastGameOver = state.gameOver
            setText(elements.statusRegion, `Generation ${state.generation} started`)
            return
        }
        if (state.gameOver !== lastGameOver) {
            lastGameOver = state.gameOver
            if (state.gameOver) {
                setText(elements.statusRegion, `Generation ${state.generation} ended`)
            }
        }
    }

    const update = (state: SimulationState, fps: number): void => {
        if (!elements) {
            return
        }

        // Generation/game-over transitions are rare, so they are announced on
        // every call regardless of the throttle below.
        announce(state)

        const now = performance.now()
        if (now - lastUpdateMs < UPDATE_INTERVAL_MS) {
            return
        }
        lastUpdateMs = now

        const activeCar = state.activeCar
        const stats = activeCar?.stats
        const breakdown = stats?.breakdown

        setText(elements.networkId, activeCar?.network.id ?? '–')
        setText(elements.generation, String(state.generation))
        setText(elements.completedGenerations, String(state.completedGenerations))
        setText(elements.aliveCars, `${state.aliveCars.length} / ${state.cars.length}`)
        setText(elements.bestFitness, formatNumber(state.champion?.bestFitness))
        setText(elements.currentFitness, formatNumber(stats?.fitness))
        setText(
            elements.idleTimeout,
            formatCountdown(
                stats ? Math.max(0, SIMULATION.idleTimeoutSeconds - stats.idleSeconds) : undefined,
            ),
        )
        setText(
            elements.overtakeTimeout,
            formatCountdown(
                stats
                    ? Math.max(
                          0,
                          SIMULATION.overtakeTimeoutSeconds - stats.secondsSinceLastOvertake,
                      )
                    : undefined,
            ),
        )
        setText(
            elements.speed,
            formatNumber(activeCar ? activeCar.car.speed / SIMULATION.stepSeconds : undefined, 0),
        )
        setText(elements.headingDeviation, formatNumber(activeCar?.car.headingDegrees))
        setText(elements.fps, formatNumber(fps, 0))

        setText(elements.breakdown.overtakes, formatNumber(breakdown?.overtakes))
        setText(elements.breakdown.progress, formatNumber(breakdown?.progress))
        setText(elements.breakdown.pace, formatNumber(breakdown?.pace))
        setText(elements.breakdown.survival, formatNumber(breakdown?.survival))
        setText(elements.breakdown.crash, formatNumber(breakdown?.crash))
        setText(elements.breakdown.stall, formatNumber(breakdown?.stall))
        setText(elements.breakdown.hazard, formatNumber(breakdown?.hazard))
        setText(elements.breakdown.reverse, formatNumber(breakdown?.reverse))
    }

    return { update }
}
