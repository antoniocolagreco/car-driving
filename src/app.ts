import { SIMULATION } from '@core/config'
import { type Network } from '@core/neural-network'
import { isCompatibleNetwork } from '@core/population'
import { type Simulation, type SimulationSettings, createSimulation } from '@core/simulation'
import { createCanvasLayer } from '@render/canvas'
import { createFrameLoop } from '@render/frame-loop'
import { drawNetwork } from '@render/network'
import { drawScene } from '@render/scene'
import { createControlPanel } from '@ui/controls'
import { createHud } from '@ui/hud'
import { type ManualControlInput, createManualControls } from '@ui/keyboard'
import {
    clearChampion,
    loadBackup,
    loadChampion,
    loadSettings,
    saveBackup,
    saveChampion,
    saveSettings,
} from '@ui/persistence'

/**
 * The only module allowed to know about `core/`, `render/` and `ui/` at once.
 * It owns the two canvases, the
 * fixed-timestep loop that drives the core simulation, the HUD, the control
 * panel and the localStorage wiring — `core/` never touches localStorage
 * directly, it only reports a champion out through `onGenerationEnd`.
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

    const onGenerationEnd = (champion: Network | undefined): void => {
        if (champion) {
            saveChampion(champion)
        }
    }

    // `simulation` is reassigned wholesale (never mutated) on 'reset', the one
    // action that needs to drop the current champion entirely: `restart()`
    // always keeps the in-memory champion unless a new one is given, so
    // "start from random networks" can only be achieved by building a fresh
    // `Simulation` with no champion at all.
    const loadedChampion = loadChampion()
    const champion =
        loadedChampion && isCompatibleNetwork(loadedChampion, settings.hiddenLayers)
            ? loadedChampion
            : undefined
    if (loadedChampion && !champion) {
        clearChampion()
    }
    let simulation: Simulation = createSimulation(settings, {
        champion,
        onGenerationEnd,
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

        drawScene(simulationLayer, simulation.state, { trafficVisible })
        drawNetworkThrottled(performance.now())
        hud.update(simulation.state, fps)
    }

    const frameLoop = createFrameLoop(onFrame)

    const abortController = new AbortController()

    // One live `Controls` record the keyboard writes into for the whole session. The
    // first real driving intent releases a newly armed manual round; key repeat does not.
    const manualInput: ManualControlInput = createManualControls(abortController.signal, {
        onIntentStart: () => simulation.beginManualDriving(),
    })

    createControlPanel(
        settings,
        {
            onSettingsChange: (nextSettings) => {
                settings = nextSettings
                saveSettings(settings)
                simulation.updateSettings(settings)
            },
            onAction: (action) => {
                switch (action) {
                    case 'restart': {
                        simulation.restart()
                        break
                    }
                    case 'backup': {
                        const network = simulation.state.activeCar?.network
                        if (network) {
                            saveBackup(network)
                        }
                        break
                    }
                    case 'restore': {
                        const backup = loadBackup()
                        if (backup && isCompatibleNetwork(backup, settings.hiddenLayers)) {
                            saveChampion(backup)
                            simulation.restart(backup)
                        }
                        break
                    }
                    case 'reset': {
                        clearChampion()
                        simulation = createSimulation(settings, { onGenerationEnd })
                        break
                    }
                    case 'evolve': {
                        const network = simulation.promoteBest()
                        if (network) {
                            saveChampion(network)
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
        },
        abortController.signal,
    )

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
            simulationLayer.destroy()
            networkLayer.destroy()
        },
    }
}
