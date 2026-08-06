import { SIMULATION } from '@core/config'
import type { SimulationState } from '@core/simulation'
import { shortNetworkId } from '@core/neural-network'
import { ELEMENT_IDS, findElement } from './dom'
import type { ChampionRecord } from './persistence'

/** Live stats HUD. Elements are resolved once and numeric updates are throttled to 10 Hz. */

export type Hud = {
    update(state: SimulationState, fps: number): void
    /** Updates the champion panel when its persisted record changes. */
    showChampion(record: ChampionRecord | undefined): void
}

const UPDATE_INTERVAL_MS = 100

type HudElements = {
    networkId: HTMLElement
    generation: HTMLElement
    aliveCars: HTMLElement
    overtakes: HTMLElement
    raceTime: HTMLElement
    idleTimeout: HTMLElement
    overtakeTimeout: HTMLElement
    speed: HTMLElement
    headingDeviation: HTMLElement
    fps: HTMLElement
    statusRegion: HTMLElement | undefined
}

/** Resolves required HUD elements once. */
const resolveElements = (): HudElements | undefined => {
    const ids = ELEMENT_IDS.hud
    const networkId = findElement(ids.networkId)
    const generation = findElement(ids.generation)
    const aliveCars = findElement(ids.aliveCars)
    const overtakes = findElement(ids.overtakes)
    const raceTime = findElement(ids.raceTime)
    const idleTimeout = findElement(ids.idleTimeout)
    const overtakeTimeout = findElement(ids.overtakeTimeout)
    const speed = findElement(ids.speed)
    const headingDeviation = findElement(ids.headingDeviation)
    const fps = findElement(ids.fps)

    if (
        !networkId ||
        !generation ||
        !aliveCars ||
        !overtakes ||
        !raceTime ||
        !idleTimeout ||
        !overtakeTimeout ||
        !speed ||
        !headingDeviation ||
        !fps
    ) {
        return undefined
    }

    return {
        networkId,
        generation,
        aliveCars,
        overtakes,
        raceTime,
        idleTimeout,
        overtakeTimeout,
        speed,
        headingDeviation,
        fps,
        statusRegion: findElement(ELEMENT_IDS.statusRegion),
    }
}

const setText = (element: HTMLElement, text: string): void => {
    if (element.textContent !== text) {
        element.textContent = text
    }
}

const formatNumber = (value: number | undefined, decimals = 1): string =>
    value === undefined ? '–' : value.toFixed(decimals)

const formatCountdown = (value: number | undefined): string =>
    value === undefined ? '–' : `${value.toFixed(1)} s`

/** Avoids displaying negative zero after rounding. */
/** Displays absent network ids consistently with other empty fields. */
const formatNetworkId = (id: string | undefined): string =>
    id === undefined ? '–' : shortNetworkId(id)

const formatDegrees = (value: number | undefined): string => {
    if (value === undefined) {
        return '–'
    }
    const rounded: number = Number(value.toFixed(1))
    return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}°`
}

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

        // Announcements are not subject to the numeric refresh throttle.
        announce(state)

        const now = performance.now()
        if (now - lastUpdateMs < UPDATE_INTERVAL_MS) {
            return
        }
        lastUpdateMs = now

        const activeCar = state.activeCar
        const stats = activeCar?.stats

        setText(elements.networkId, formatNetworkId(activeCar?.network.id))
        setText(elements.generation, String(state.generation))
        setText(elements.aliveCars, `${state.aliveCars.length} / ${state.cars.length}`)
        setText(elements.overtakes, stats ? String(stats.overtakes) : '–')
        // Champion records use this round clock too.
        setText(elements.raceTime, `${state.elapsedSeconds.toFixed(1)} s`)
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
        setText(elements.headingDeviation, formatDegrees(activeCar?.car.headingDegrees))
        setText(elements.fps, formatNumber(fps, 0))
    }

    // Champion elements are optional; live stats are not.
    const championElements = {
        networkId: findElement(ELEMENT_IDS.champion.networkId),
        seconds: findElement(ELEMENT_IDS.champion.seconds),
        overtakes: findElement(ELEMENT_IDS.champion.overtakes),
    }

    const showChampion = (record: ChampionRecord | undefined): void => {
        if (championElements.networkId) {
            setText(championElements.networkId, formatNetworkId(record?.network.id))
        }
        if (championElements.seconds) {
            setText(championElements.seconds, record ? `${record.seconds.toFixed(2)} s` : '–')
        }
        if (championElements.overtakes) {
            setText(championElements.overtakes, record ? String(record.overtakes) : '–')
        }
    }

    return { update, showChampion }
}
