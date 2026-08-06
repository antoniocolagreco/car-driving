import { SIMULATION } from '@core/config'
import type { Network } from '@core/neural-network'
import { isCompatibleNetwork } from '@core/population'
import {
    type CourseResult,
    type Simulation,
    type SimulationSettings,
    createSimulation,
} from '@core/simulation'
import { createCanvasLayer } from '@render/canvas'
import type { RadarMode } from '@render/car'
import { createFrameLoop } from '@render/frame-loop'
import { drawNetwork } from '@render/network'
import { drawScene } from '@render/scene'
import { type SidePanelView, createControlPanel } from '@ui/controls'
import { createHud } from '@ui/hud'
import { type ManualControlInput, createManualControls } from '@ui/keyboard'
import {
    type ChampionRecord,
    clearChampion,
    clearVeterans,
    clearWinner,
    loadChampion,
    loadSettings,
    loadVeterans,
    loadWinner,
    saveChampion,
    saveSettings,
    saveVeterans,
    saveWinner,
} from '@ui/persistence'
import { createSimulateModal } from '@ui/simulate-modal'
import { createVeteransPanel } from '@ui/veterans-panel'
import victoryAudioUrl from '../audio/win.mp3?url'

/** Composition root for core simulation, rendering, UI and persistence. */

export type SimulationApp = {
    start(): void
    stop(): void
    destroy(): void
}

/** Network visualization rate, independent of simulation steps. */
const NETWORK_DRAW_INTERVAL_MS = 1000 / 8

const sameLayers = (a: readonly number[], b: readonly number[]): boolean =>
    a.length === b.length && a.every((count, index) => count === b[index])

export const createSimulationApp = (container: HTMLElement): SimulationApp => {
    const stored = loadSettings()
    let settings: SimulationSettings = {
        carsQuantity: stored.carsQuantity,
        mutationRate: stored.mutationRate,
        hiddenLayers: stored.hiddenLayers,
        generationsPerCourse: stored.generationsPerCourse,
        brakeBonus: stored.brakeBonus,
    }
    let lastNetworkDrawMs = 0
    let standingsGeneration = 0
    // Paint-only; never restart or alter simulation state.
    let trafficVisible: boolean = true
    let radarMode: RadarMode = 'hull'
    const victoryAudio: HTMLAudioElement = new Audio(victoryAudioUrl)
    victoryAudio.preload = 'auto'
    victoryAudio.volume = 1
    victoryAudio.load()
    let victoryWasActive: boolean = false
    let victoryAudioUnlocked: boolean = false
    const abortController: AbortController = new AbortController()

    // Prime audio from a user gesture for browsers that block later autoplay.
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

    /** Background mode steps without rendering and updates the modal once per race. */
    let simulating = false
    let stopAfterCurrentRace = false
    let racesCompleted = 0
    let simulateFrameId: number | undefined

    /** Keep slices short enough for modal paint and Stop events between them. */
    const SIMULATE_SLICE_MS = 12

    const simulateSlice = (): void => {
        const deadline = performance.now() + SIMULATE_SLICE_MS
        // A simulation callback can end the run during any step.
        while (simulating && performance.now() < deadline) {
            simulation.step(SIMULATION.stepSeconds)
        }
        if (simulating) {
            simulateFrameId = requestAnimationFrame(simulateSlice)
        }
    }

    const stopSimulating = (): void => {
        if (!simulating) {
            return
        }
        simulating = false
        if (simulateFrameId !== undefined) {
            cancelAnimationFrame(simulateFrameId)
            simulateFrameId = undefined
        }
        simulateModal.close()
        // Discard rendered-loop time left over from before the background run.
        accumulator.seconds = 0
        frameLoop.start()
    }

    const startSimulating = (): void => {
        if (simulating) {
            return
        }
        simulating = true
        stopAfterCurrentRace = false
        racesCompleted = 0
        frameLoop.stop()
        simulateModal.open()
        simulateFrameId = requestAnimationFrame(simulateSlice)
    }

    const onGenerationEnd = (winner: Network | undefined): void => {
        if (winner) {
            saveWinner(winner)
        }
        if (!simulating) {
            return
        }

        racesCompleted += 1
        simulateModal.reportRace({
            index: racesCompleted,
            overtakes: simulation.state.bestCar?.stats.overtakes ?? 0,
            seconds: simulation.state.elapsedSeconds,
        })

        // Stop requests take effect only after the current race reports its result.
        if (stopAfterCurrentRace || simulation.state.courseCleared) {
            stopSimulating()
        }
    }

    /** Latest finisher, discarded when incompatible with the selected architecture. */
    let champion: ChampionRecord | undefined = loadChampion()
    if (champion && !isCompatibleNetwork(champion.network, settings.hiddenLayers)) {
        clearChampion()
        champion = undefined
    }

    /** Every finisher replaces the champion; time describes the run but does not guard the seat. */
    const onCourseFinished = (result: CourseResult): void => {
        champion = {
            network: result.network,
            seconds: result.seconds,
            overtakes: result.overtakes,
        }
        saveChampion(champion)
        simulation.setChampion(champion.network)
        hud.showChampion(champion)
    }

    const onVeteransChanged = (roster: readonly Network[]): void => {
        saveVeterans(roster)
    }

    const usableVeterans = (roster: readonly Network[]): Network[] =>
        roster.filter((network) => isCompatibleNetwork(network, settings.hiddenLayers))

    const storedVeterans = loadVeterans()
    const veterans = usableVeterans(storedVeterans)
    if (veterans.length !== storedVeterans.length) {
        saveVeterans(veterans)
    }

    // Reset rebuilds the simulation because restart preserves its in-memory winner.
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
        veterans,
        champion: champion?.network,
        onGenerationEnd,
        onCourseFinished,
        onVeteransChanged,
    })

    const simulationLayer = createCanvasLayer(container, 'Simulation')

    // The graph and standings alternate in one grid cell.
    const sidePane = document.createElement('div')
    sidePane.className = 'relative min-h-0 min-w-0'
    container.appendChild(sidePane)
    const networkLayer = createCanvasLayer(sidePane, 'Network')
    const veteransPanel = createVeteransPanel(sidePane, abortController.signal)
    let sidePanelView: SidePanelView = 'network'

    /** Repaints standings once per race. */
    const refreshVeterans = (): void => {
        if (sidePanelView !== 'veterans') {
            return
        }
        const racingIds = new Set(simulation.state.cars.map((racingCar) => racingCar.network.id))
        veteransPanel.update(simulation.state.veterans, racingIds)
    }

    const hud = createHud()

    /** Clears winner, archive and champion, then rebuilds the simulation and callbacks. */
    const resetEverything = (): void => {
        clearWinner()
        clearVeterans()
        clearChampion()
        champion = undefined
        hud.showChampion(undefined)
        simulation = createSimulation(settings, {
            onGenerationEnd,
            onCourseFinished,
            onVeteransChanged,
        })
        // Clear stale standings immediately instead of waiting for the first new race.
        refreshVeterans()
    }

    const accumulator = { seconds: 0 }

    const drawNetworkThrottled = (nowMs: number): void => {
        if (sidePanelView !== 'network' || nowMs - lastNetworkDrawMs < NETWORK_DRAW_INTERVAL_MS) {
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
        // Drop excess elapsed time after reaching the catch-up cap.
        if (steps >= SIMULATION.maxStepsPerFrame) {
            accumulator.seconds = 0
        }

        const victoryIsActive: boolean = simulation.state.courseCleared
        if (victoryIsActive && !victoryWasActive) {
            victoryAudio.muted = false
            victoryAudio.currentTime = 0
            // Playback failure must not interrupt the simulation.
            void victoryAudio.play().catch((error: unknown) => {
                console.warn('Victory audio playback was blocked by the browser', error)
            })
        }
        victoryWasActive = victoryIsActive

        // Grid membership and archive history change only between races.
        if (simulation.state.generation !== standingsGeneration) {
            standingsGeneration = simulation.state.generation
            refreshVeterans()
        }

        drawScene(simulationLayer, simulation.state, { trafficVisible, radarMode })
        drawNetworkThrottled(performance.now())
        hud.update(simulation.state, fps)
    }

    const frameLoop = createFrameLoop(onFrame)

    // Stop after the current race so the final result is not truncated.
    const simulateModal = createSimulateModal(() => {
        stopAfterCurrentRace = true
    }, abortController.signal)

    // The first manual driving intent releases the armed round.
    const manualInput: ManualControlInput = createManualControls(abortController.signal, {
        onIntentStart: () => simulation.beginManualDriving(),
    })

    createControlPanel(
        settings,
        {
            onSettingsChange: (nextSettings) => {
                const architectureChanged: boolean = !sameLayers(
                    settings.hiddenLayers,
                    nextSettings.hiddenLayers,
                )
                settings = nextSettings
                saveSettings(settings)

                // Existing networks cannot run through a different architecture.
                if (architectureChanged) {
                    resetEverything()
                    return
                }

                simulation.updateSettings(settings)
            },
            onAction: (action) => {
                switch (action) {
                    case 'restart': {
                        simulation.restart()
                        break
                    }
                    case 'reset': {
                        resetEverything()
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
                    case 'simulate': {
                        startSimulating()
                        break
                    }
                }
            },
            onDriveToggle: (driving) => {
                manualInput.reset()
                if (driving) {
                    // Start frozen; the first driving key releases the round.
                    simulation.startManualDriving(manualInput.controls)
                } else {
                    // Continue the same car under its newly trained network.
                    simulation.stopManualDriving()
                }
            },
            onTrafficVisibilityToggle: (visible) => {
                trafficVisible = visible
            },
            onRadarModeChange: (mode) => {
                radarMode = mode
            },
            onSidePanelChange: (view) => {
                sidePanelView = view
                veteransPanel.setVisible(view === 'veterans')
                // Canvas visibility is inline, so the paired panel uses the same mechanism.
                networkLayer.element.style.display = view === 'network' ? 'block' : 'none'
                refreshVeterans()
            },
        },
        abortController.signal,
    )

    hud.showChampion(champion)

    return {
        start(): void {
            frameLoop.start()
        },
        stop(): void {
            frameLoop.stop()
        },
        destroy(): void {
            abortController.abort()
            stopSimulating()
            frameLoop.destroy()
            victoryAudio.pause()
            victoryAudio.currentTime = 0
            simulationLayer.destroy()
            networkLayer.destroy()
            veteransPanel.destroy()
            sidePane.remove()
        },
    }
}
