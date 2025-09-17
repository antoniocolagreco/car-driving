import { FrameLoop } from '@models/frame-loop'
import { UIController, type UIConfig, type UIState, type UIAction } from '@models/ui-controller'
import { SimulationManager, type SimulationConfig } from '@models/simulation-manager'
import { RenderingManager } from '@models/rendering-manager'
import { WorldBuilder } from '@models/world-builder'
import Persistence from './persistence'

// Configuration and state management moved to dedicated services

export type SimulationControls = {
    start: () => void
    stop: () => void
    destroy: () => void
}

export function createSimulation(container: HTMLElement): SimulationControls {
    const abortController = new AbortController()

    // Create frame loop that manages canvas and animation
    const frameLoop = new FrameLoop(container)
    const carCanvas = frameLoop.getCarCanvas()
    const networkCanvas = frameLoop.getNetworkCanvas()
    const carContext = frameLoop.getCarContext()
    const networkContext = frameLoop.getNetworkContext()

    // Create world (map and road)
    const worldConfig = WorldBuilder.getDefaultConfig(carCanvas.width, carCanvas.height)
    const world = WorldBuilder.createWorld(worldConfig)

    // Create rendering manager
    const renderingManager = new RenderingManager(
        carCanvas,
        networkCanvas,
        carContext,
        networkContext,
        world.map,
        world.road,
    )

    // Create simulation manager
    const simulationConfig: SimulationConfig = {
        mutationRate: Persistence.loadMutationRate(),
        carsQuantity: Persistence.loadCarsQuantity(),
        neurons: Persistence.loadNeurons(),
    }

    const simulationManager = new SimulationManager(world.road, simulationConfig, networkContext)

    // Setup UI controller
    const uiController = new UIController(
        abortController,
        (config: Partial<UIConfig>) => {
            // Update simulation configuration when UI changes
            const simConfig: Partial<SimulationConfig> = {}
            if (config.mutationRate !== undefined) {
                simConfig.mutationRate = config.mutationRate
            }
            if (config.carsQuantity !== undefined) {
                simConfig.carsQuantity = config.carsQuantity
            }
            if (config.neurons !== undefined) {
                simConfig.neurons = config.neurons
            }

            simulationManager.updateConfig(simConfig)
        },
        (action: UIAction) => {
            switch (action) {
                case 'save-network':
                    simulationManager.saveNetwork()
                    break
                case 'restore-network':
                    if (simulationManager.restoreNetwork()) {
                        simulationManager.restart()
                    }
                    break
                case 'reset-network':
                    simulationManager.resetNetwork()
                    simulationManager.restart()
                    break
                case 'restart-network':
                    simulationManager.restart()
                    break
                case 'evolve-network':
                    if (simulationManager.evolveNetwork()) {
                        simulationManager.endRound()
                    }
                    break
            }
        },
    )

    uiController.setupEventListeners()

    // Initialize simulation
    simulationManager.restart()

    const start = () => {
        frameLoop.start((timestamp: number, _currentFps: number) => {
            const state = simulationManager.getState()

            // Update simulation state
            simulationManager.update()

            // Check for game over conditions
            simulationManager.checkGameOver(timestamp)

            // Update all vehicles
            simulationManager.updateVehicles()

            // Render everything
            renderingManager.render(state, timestamp)

            // Update HUD
            const currentFps = frameLoop.getCurrentFps()
            const uiState: UIState = {
                activeCar: state.activeCar
                    ? {
                          networkId: state.activeCar.getNetwork()?.getId(),
                          points: state.activeCar.getPoints(),
                          networkSurvivedRounds: state.activeCar.getNetwork()?.getSurvivedRounds(),
                          speed: state.activeCar.getSpeed(),
                      }
                    : undefined,
                aliveCars: state.aliveCars.length,
                fps: currentFps,
            }

            uiController.updateHUD(uiState)
        })
    }

    const stop = () => {
        frameLoop.stop()
        simulationManager.stop()
    }

    const destroy = () => {
        stop()
        frameLoop.destroy()
        abortController.abort()
    }

    // kick things off by default; caller can stop/start as needed
    start()
    return { start, stop, destroy }
}
