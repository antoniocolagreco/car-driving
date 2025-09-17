import Canvas from '@models/canvas'
import { FrameLoop } from '@models/frame-loop'
import { Renderer } from '@models/renderer'
import { Simulation, type SimulationConfig } from '@models/simulation'
import { UIController, type UIAction, type UIConfig, type UIState } from '@models/ui-controller'
import World, { type WorldConfig } from '@models/world'
import Persistence from './persistence'

// Configuration and state management moved to dedicated services

export type SimulationControls = {
    start: () => void
    stop: () => void
    destroy: () => void
}

export function createSimulation(element: HTMLElement): SimulationControls {
    const abortController = new AbortController()

    const simulationCanvas = new Canvas(element)
    const networkCanvas = new Canvas(element)

    // Create frame loop that manages canvas and animation
    const frameLoop = new FrameLoop(simulationCanvas, networkCanvas)

    const worldConfig: WorldConfig = {
        canvas: {
            width: simulationCanvas.getElement().width,
            height: simulationCanvas.getElement().height,
        },
        map: {
            width: 1000,
            height: 100000, // Very tall world for driving
        },
        road: {
            width: 240,
            laneCount: 3,
        },
    }
    // Create world (map and road)
    const world = new World(worldConfig)

    // Create simulation manager
    const simulationConfig: SimulationConfig = {
        mutationRate: Persistence.loadMutationRate(),
        carsQuantity: Persistence.loadCarsQuantity(),
        neurons: Persistence.loadNeurons(),
    }

    const simulation = new Simulation(world, simulationConfig)

    // Create rendering manager
    const renderingManager = new Renderer(simulationCanvas, networkCanvas, world)

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

            simulation.updateConfig(simConfig)
        },
        (action: UIAction) => {
            switch (action) {
                case 'save-network':
                    simulation.saveNetwork()
                    break
                case 'restore-network':
                    if (simulation.restoreNetwork()) {
                        simulation.restart()
                    }
                    break
                case 'reset-network':
                    simulation.resetNetwork()
                    simulation.restart()
                    break
                case 'restart-network':
                    simulation.restart()
                    break
                case 'evolve-network':
                    if (simulation.evolveNetwork()) {
                        simulation.endRound()
                    }
                    break
            }
        },
    )

    uiController.setupEventListeners()

    // Initialize simulation
    simulation.restart()

    const start = () => {
        frameLoop.start((timestamp: number, _currentFps: number) => {
            const state = simulation.getState()

            // Update simulation state
            simulation.update()

            // Check for game over conditions
            simulation.checkGameOver(timestamp)

            // Update all vehicles
            simulation.updateVehicles()

            // Render everything
            renderingManager.render(state, timestamp)

            // Update HUD
            const currentFps = frameLoop.getCurrentFps()

            const uiState: UIState = {
                activeCar: state.activeCar
                    ? {
                          networkId: state.activeCar.getNetwork()?.getId(),
                          points: state.activeCar.getPoints(),
                          record: state.activeCar.getNetwork()?.getPointsRecord(),
                          networkSurvivedRounds: state.activeCar.getNetwork()?.getSurvivedRounds(),
                          speed: state.activeCar.getSpeed(),
                      }
                    : undefined,
                remainingCars: state.remainingCars.length,
                fps: currentFps,
            }

            uiController.updateHUD(uiState)
        })
    }

    const stop = () => {
        frameLoop.stop()
        simulation.stop()
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
