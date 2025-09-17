import { CONSTANTS } from '../constants'
import type Canvas from './canvas'
import Map from './map'
import Road from './road'
import type { SimulationState } from './simulation'
import type Vehicle from './vehicle'
import Visualizer from './visualizer'
import type World from './world'

export interface Viewport {
    x: number
    y: number
}

export class Renderer {
    private lastNetworkDrawAt = 0
    private simulationCanvas: Canvas
    private networkCanvas: Canvas
    private simulationContext: CanvasRenderingContext2D | null
    private networkContext: CanvasRenderingContext2D | null
    private map: Map
    private road: Road

    constructor(simulationCanvas: Canvas, networkCanvas: Canvas, world: World) {
        this.simulationCanvas = simulationCanvas
        this.networkCanvas = networkCanvas
        this.simulationContext = this.simulationCanvas.getContext()
        this.networkContext = this.networkCanvas.getContext()
        this.map = world.getMap()
        this.road = world.getRoad()
    }

    computeViewport(activeCar?: Vehicle, traffic: Vehicle[] = []): Viewport {
        const x = this.simulationCanvas.getElement().width / 2
        const fallbackY = traffic[0]?.getPosition().getY() ?? 0
        const y = activeCar
            ? -activeCar.getPosition().getY() +
              this.simulationCanvas.getElement().height * CONSTANTS.viewportYFactor
            : fallbackY
        return { x, y }
    }

    drawGameOverOverlay(bestCar?: Vehicle): void {
        if (!bestCar || !this.simulationContext) {
            return
        }

        this.simulationContext.font = '32px monospace'
        this.simulationContext.lineWidth = 3
        this.simulationContext.setLineDash([])
        this.simulationContext.textAlign = 'center'
        this.simulationContext.textBaseline = 'middle'

        const message1 = `${bestCar.getNetwork()?.getId()}`
        const message2 = 'WINS'
        const message3 = `with ${bestCar.getPoints()} points`

        this.simulationContext.fillStyle = '#fff'
        this.simulationContext.strokeStyle = 'black'

        const centerX = this.simulationCanvas.getElement().width / 2
        const centerY = this.simulationCanvas.getElement().height / 2

        this.simulationContext.strokeText(message1, centerX, centerY - 80)
        this.simulationContext.fillText(message1, centerX, centerY - 80)
        this.simulationContext.strokeText(message2, centerX, centerY - 40)
        this.simulationContext.fillText(message2, centerX, centerY - 40)
        this.simulationContext.strokeText(message3, centerX, centerY)
        this.simulationContext.fillText(message3, centerX, centerY)
    }

    render(state: SimulationState, timestamp: number): void {
        if (!this.simulationContext) {
            return
        }

        this.simulationCanvas.clear()

        // Center viewport on active car
        const { x: translateX, y: translateY } = this.computeViewport(
            state.activeCar,
            state.traffic,
        )
        this.simulationContext.save()
        this.simulationContext.translate(translateX, translateY)

        // Draw map and road
        this.map.drawIn(this.simulationContext)
        this.road.drawIn(this.simulationContext)

        // Draw non-active AI-controlled cars first
        const otherCars = state.allCars.filter((c) => c !== state.activeCar)
        for (const car of otherCars) {
            car.drawIn(this.simulationContext)
        }

        // Draw traffic vehicles next
        for (const vehicle of state.traffic) {
            vehicle.drawIn(this.simulationContext)
        }

        // Draw active car last to keep it on top
        if (state.activeCar) {
            state.activeCar.drawIn(this.simulationContext)
        }

        // Reset viewport
        this.simulationContext.restore()

        // Draw game over overlay if needed
        if (state.gameover && state.bestCar) {
            this.drawGameOverOverlay(state.bestCar)
        }

        // Draw neural network visualization for active car
        this.renderNeuralNetwork(state.activeCar, timestamp)
    }

    private renderNeuralNetwork(activeCar?: Vehicle, timestamp: number = 0): void {
        if (!this.networkContext || !activeCar?.getNetwork()) {
            return
        }

        if (timestamp - this.lastNetworkDrawAt > CONSTANTS.networkDrawThrottleMs) {
            // Clear once per redraw to avoid ghosting without flicker
            this.networkContext.clearRect(
                0,
                0,
                this.networkCanvas.getElement().width,
                this.networkCanvas.getElement().height,
            )
            Visualizer.drawNetworkIn(this.networkContext, activeCar.getNetwork()!)
            this.lastNetworkDrawAt = timestamp
        }
    }

    initialNetworkRender(activeCar?: Vehicle): void {
        if (this.networkContext && activeCar?.getNetwork()) {
            Visualizer.drawNetworkIn(this.networkContext, activeCar.getNetwork()!)
        }
    }
}
