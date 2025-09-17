import Map from './map'
import Road from './road'
import type Vehicle from './vehicle'
import Visualizer from './visualizer'
import { CONSTANTS } from '../constants'
import type { SimulationState } from './simulation-manager'

export interface Viewport {
    x: number
    y: number
}

export class RenderingManager {
    private lastNetworkDrawAt = 0

    constructor(
        private carCanvas: HTMLCanvasElement,
        private networkCanvas: HTMLCanvasElement,
        private carContext: CanvasRenderingContext2D | null,
        private networkContext: CanvasRenderingContext2D | null,
        private worldMap: Map,
        private road: Road,
    ) {}

    computeViewport(activeCar?: Vehicle, traffic: Vehicle[] = []): Viewport {
        const x = this.carCanvas.width / 2
        const fallbackY = traffic[0]?.getPosition().getY() ?? 0
        const y = activeCar
            ? -activeCar.getPosition().getY() + this.carCanvas.height * CONSTANTS.viewportYFactor
            : fallbackY
        return { x, y }
    }

    drawGameOverOverlay(bestCar?: Vehicle): void {
        if (!bestCar || !this.carContext) {
            return
        }

        this.carContext.font = '32px monospace'
        this.carContext.lineWidth = 3
        this.carContext.setLineDash([])
        this.carContext.textAlign = 'center'
        this.carContext.textBaseline = 'middle'

        const message1 = `${bestCar.getNetwork()?.getId()}`
        const message2 = 'WINS'
        const message3 = `with ${bestCar.getPoints()} points`

        this.carContext.fillStyle = '#fff'
        this.carContext.strokeStyle = 'black'

        const centerX = this.carCanvas.width / 2
        const centerY = this.carCanvas.height / 2

        this.carContext.strokeText(message1, centerX, centerY - 80)
        this.carContext.fillText(message1, centerX, centerY - 80)
        this.carContext.strokeText(message2, centerX, centerY - 40)
        this.carContext.fillText(message2, centerX, centerY - 40)
        this.carContext.strokeText(message3, centerX, centerY)
        this.carContext.fillText(message3, centerX, centerY)
    }

    render(state: SimulationState, timestamp: number): void {
        if (!this.carContext) {
            return
        }

        // Center viewport on active car
        const { x: translateX, y: translateY } = this.computeViewport(
            state.activeCar,
            state.traffic,
        )
        this.carContext.save()
        this.carContext.translate(translateX, translateY)

        // Draw map and road
        this.worldMap.drawIn(this.carContext)
        this.road.drawIn(this.carContext)

        // Draw non-active AI-controlled cars first
        const otherCars = state.allCars.filter((c) => c !== state.activeCar)
        for (const car of otherCars) {
            car.drawIn(this.carContext)
        }

        // Draw traffic vehicles next
        for (const vehicle of state.traffic) {
            vehicle.drawIn(this.carContext)
        }

        // Draw active car last to keep it on top
        if (state.activeCar) {
            state.activeCar.drawIn(this.carContext)
        }

        // Reset viewport
        this.carContext.restore()

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
            this.networkContext.clearRect(0, 0, this.networkCanvas.width, this.networkCanvas.height)
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
