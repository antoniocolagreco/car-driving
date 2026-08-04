import { SIMULATION } from '@core/config'
import { type Network } from '@core/neural-network'
import { isCompatibleNetwork } from '@core/population'
import {
    type CourseResult,
    type Simulation,
    type SimulationSettings,
    createSimulation,
} from '@core/simulation'
import { createCanvasLayer } from '@render/canvas'
import { type RadarMode } from '@render/car'
import { createFrameLoop } from '@render/frame-loop'
import { drawNetwork } from '@render/network'
import { drawScene } from '@render/scene'
import { type ControlPanel, createControlPanel } from '@ui/controls'
import { createHud } from '@ui/hud'
import { type ManualControlInput, createManualControls } from '@ui/keyboard'
import {
    type ChampionRecord,
    clearChampion,
    clearWinner,
    loadChampion,
    loadSettings,
    loadWinner,
    saveChampion,
    saveSettings,
    saveWinner,
} from '@ui/persistence'
import victoryAudioUrl from '../audio/win.mp3?url'

/**
 * The only module allowed to know about `core/`, `render/` and `ui/` at once.
 * It owns the two canvases, the
 * fixed-timestep loop that drives the core simulation, the HUD, the control
 * panel and the localStorage wiring. `core/` never touches localStorage directly: it
 * reports a winner out through `onGenerationEnd` and a finished course through
 * `onCourseFinished`, and this module decides what is worth keeping.
 */

export type SimulationApp = {
    start(): void
    stop(): void
    destroy(): void
}

/** How often the (expensive) network visualization redraws, independent of the 60fps simulation. */
const NETWORK_DRAW_INTERVAL_MS = 1000 / 8

/** Builds the app: two canvas layers inside `container`, the simulation loop, the HUD and the controls. */
export const createSimulationApp = (container: HTMLElement): SimulationApp => {
    const stored = loadSettings()
    // Reassigned wholesale on every change, never mutated field-by-field —
    // `SimulationSettings`'s fields are readonly, matching the immutability
    // convention the rest of the codebase follows for value types.
    let settings: SimulationSettings = {
        carsQuantity: stored.carsQuantity,
        mutationRate: stored.mutationRate,
        hiddenLayers: stored.hiddenLayers,
    }
    let lastNetworkDrawMs = 0
    // A paint-only preference: changing it must never alter or restart the simulation.
    let trafficVisible: boolean = true
    let radarMode: RadarMode = 'hull'
    const victoryAudio: HTMLAudioElement = new Audio(victoryAudioUrl)
    victoryAudio.preload = 'auto'
    victoryAudio.volume = 1
    victoryAudio.load()
    let victoryWasActive: boolean = false
    let victoryAudioUnlocked: boolean = false
    const abortController: AbortController = new AbortController()

    // Safari and other browsers require an audio element to begin playback from a
    // user gesture at least once. Prime this exact element silently on the first
    // interaction, then reuse it at full volume when the course is cleared.
    const unlockVictoryAudio = (): void => {
        if (victoryAudioUnlocked) {
            return
        }

        victoryAudio.muted = true
        victoryAudio.currentTime = 0
        void victoryAudio
            .play()
            .then(() => {
                victoryAudio.pause()
                victoryAudio.currentTime = 0
                victoryAudio.muted = false
                victoryAudioUnlocked = true
            })
            .catch(() => {
                victoryAudio.muted = false
            })
    }

    document.addEventListener('pointerdown', unlockVictoryAudio, {
        capture: true,
        signal: abortController.signal,
    })
    document.addEventListener('keydown', unlockVictoryAudio, {
        capture: true,
        signal: abortController.signal,
    })

    const onGenerationEnd = (winner: Network | undefined): void => {
        if (winner) {
            saveWinner(winner)
        }
    }

    /**
     * The record holder. Loaded once, replaced only by a strictly faster finish, and
     * dropped when its architecture stops matching the settings, because a record nobody
     * can load or race against is not a record.
     */
    let champion: ChampionRecord | undefined = loadChampion()
    if (champion && !isCompatibleNetwork(champion.network, settings.hiddenLayers)) {
        clearChampion()
        champion = undefined
    }

    const onCourseFinished = (result: CourseResult): void => {
        // Strictly faster: an equal time leaves the incumbent in place, so the record
        // belongs to whoever set it first. The score is recorded, never compared.
        if (champion && result.seconds >= champion.seconds) {
            return
        }
        champion = {
            network: result.network,
            seconds: result.seconds,
            overtakes: result.overtakes,
        }
        saveChampion(champion)
        hud.showChampion(champion)
        controlPanel.setChampionAvailable(true)
    }

    // `simulation` is reassigned wholesale (never mutated) on 'reset', the one
    // action that needs to drop the current winner entirely: `restart()`
    // always keeps the in-memory winner unless a new one is given, so
    // "start from random networks" can only be achieved by building a fresh
    // `Simulation` with no winner at all.
    const loadedWinner = loadWinner()
    const winner =
        loadedWinner && isCompatibleNetwork(loadedWinner, settings.hiddenLayers)
            ? loadedWinner
            : undefined
    if (loadedWinner && !winner) {
        clearWinner()
    }
    let simulation: Simulation = createSimulation(settings, {
        winner,
        onGenerationEnd,
        onCourseFinished,
    })

    const simulationLayer = createCanvasLayer(container, 'Simulation')
    const networkLayer = createCanvasLayer(container, 'Network')

    const hud = createHud()

    const accumulator = { seconds: 0 }

    const drawNetworkThrottled = (nowMs: number): void => {
        if (nowMs - lastNetworkDrawMs < NETWORK_DRAW_INTERVAL_MS) {
            return
        }
        lastNetworkDrawMs = nowMs
        networkLayer.clear()
        const network = simulation.state.activeCar?.network
        if (network) {
            drawNetwork(networkLayer.context, network)
        }
    }

    const onFrame = (deltaSeconds: number, fps: number): void => {
        accumulator.seconds += deltaSeconds

        let steps = 0
        while (
            accumulator.seconds >= SIMULATION.stepSeconds &&
            steps < SIMULATION.maxStepsPerFrame
        ) {
            simulation.step(SIMULATION.stepSeconds)
            accumulator.seconds -= SIMULATION.stepSeconds
            steps += 1
        }
        // A stalled tab cannot be allowed to keep maxing out steps every frame forever
        // trying to "catch up": once the cap is hit the remaining time is dropped rather
        // than banked for the next frame.
        if (steps >= SIMULATION.maxStepsPerFrame) {
            accumulator.seconds = 0
        }

        const victoryIsActive: boolean = simulation.state.courseCleared
        if (victoryIsActive && !victoryWasActive) {
            victoryAudio.muted = false
            victoryAudio.currentTime = 0
            // Audio is celebratory only: a remaining browser-policy rejection must not
            // interrupt the simulation, but is reported instead of being hidden.
            void victoryAudio.play().catch((error: unknown) => {
                console.warn('Victory audio playback was blocked by the browser', error)
            })
        }
        victoryWasActive = victoryIsActive

        drawScene(simulationLayer, simulation.state, { trafficVisible, radarMode })
        drawNetworkThrottled(performance.now())
        hud.update(simulation.state, fps)
    }

    const frameLoop = createFrameLoop(onFrame)

    // One live `Controls` record the keyboard writes into for the whole session. The
    // first real driving intent releases a newly armed manual round; key repeat does not.
    const manualInput: ManualControlInput = createManualControls(abortController.signal, {
        onIntentStart: () => simulation.beginManualDriving(),
    })

    const controlPanel: ControlPanel = createControlPanel(
        settings,
        {
            onSettingsChange: (nextSettings) => {
                settings = nextSettings
                saveSettings(settings)
                simulation.updateSettings(settings)
                // A different architecture cannot race the stored record, so the record
                // goes: keeping an unloadable one would leave Restore enabled and inert.
                if (champion && !isCompatibleNetwork(champion.network, settings.hiddenLayers)) {
                    clearChampion()
                    champion = undefined
                    hud.showChampion(undefined)
                    controlPanel.setChampionAvailable(false)
                }
            },
            onAction: (action) => {
                switch (action) {
                    case 'restart': {
                        simulation.restart()
                        break
                    }
                    case 'loadChampion': {
                        // Re-read from storage rather than reusing the in-memory record:
                        // whatever goes into the simulation gets trained and counted on,
                        // and the record must not drift with it.
                        const record = loadChampion()
                        if (record && isCompatibleNetwork(record.network, settings.hiddenLayers)) {
                            saveWinner(record.network)
                            simulation.restart(record.network)
                        }
                        break
                    }
                    case 'reset': {
                        // Only the Winner is forgotten. The record holder survives a reset
                        // by design, so the fresh population still has a time to beat, and
                        // `onCourseFinished` has to be rewired or it would stop watching.
                        clearWinner()
                        simulation = createSimulation(settings, {
                            onGenerationEnd,
                            onCourseFinished,
                        })
                        break
                    }
                    case 'evolve': {
                        const network = simulation.promoteBest()
                        if (network) {
                            saveWinner(network)
                            simulation.restart()
                        }
                        break
                    }
                }
            },
            onDriveToggle: (driving) => {
                manualInput.reset()
                if (driving) {
                    // Manual mode always begins with a clean round. `startManualDriving`
                    // arms it without advancing time; the first Arrow/WASD/Space keydown
                    // calls `beginManualDriving` through the keyboard handler above.
                    simulation.startManualDriving(manualInput.controls)
                } else {
                    // No restart here: the same player car continues immediately, driven
                    // by the network that was trained during the manual part of the run.
                    simulation.stopManualDriving()
                }
            },
            onTrafficVisibilityToggle: (visible) => {
                trafficVisible = visible
            },
            onRadarModeChange: (mode) => {
                radarMode = mode
            },
        },
        abortController.signal,
    )

    // The panel and the champion panel start empty, so both are filled once here rather
    // than waiting for the first finish to reveal a record that already exists.
    hud.showChampion(champion)
    controlPanel.setChampionAvailable(champion !== undefined)

    return {
        start(): void {
            frameLoop.start()
        },
        stop(): void {
            frameLoop.stop()
        },
        destroy(): void {
            abortController.abort()
            frameLoop.destroy()
            victoryAudio.pause()
            victoryAudio.currentTime = 0
            simulationLayer.destroy()
            networkLayer.destroy()
        },
    }
}
