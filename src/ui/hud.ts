import { SIMULATION } from '@core/config'
import type { SimulationState } from '@core/simulation'
import { shortNetworkId } from '@core/neural-network'
import { ELEMENT_IDS, findElement } from './dom'
import type { ChampionRecord } from './persistence'

/**
 * The didactic centrepiece: shows which car the camera follows, how the
 * generation is going and the sparse overtake reward while it runs.
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
    /**
     * Fills the record holder's panel. Called only when the record changes, not per
     * frame: the champion lives in localStorage, not in `SimulationState`.
     */
    showChampion(record: ChampionRecord | undefined): void
}

/** Numeric fields refresh at most this often. */
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

/** Resolves every HUD element once; `undefined` when a required one is missing from the page. */
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

/**
 * Heading as an explicitly signed angle, so the panel says which way the car is pointing
 * rather than only how far off it is. Rounded before the sign is read, so a hair to the
 * left of straight reads `0.0°` instead of `-0.0°`.
 */
/** An absent network reads as a dash, like every other empty field in the panel. */
const formatNetworkId = (id: string | undefined): string =>
    id === undefined ? '–' : shortNetworkId(id)

const formatDegrees = (value: number | undefined): string => {
    if (value === undefined) {
        return '–'
    }
    const rounded: number = Number(value.toFixed(1))
    return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}°`
}

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

        setText(elements.networkId, formatNetworkId(activeCar?.network.id))
        setText(elements.generation, String(state.generation))
        setText(elements.aliveCars, `${state.aliveCars.length} / ${state.cars.length}`)
        setText(elements.overtakes, stats ? String(stats.overtakes) : '–')
        // The round clock, not the followed car's own: it is what the champion's time is
        // measured on, so the two numbers can be read against each other while racing.
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

    // Resolved separately from `resolveElements`: the champion panel is optional, and a
    // page without it must still show the live stats rather than nothing at all.
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
