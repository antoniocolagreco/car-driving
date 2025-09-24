import { CONSTANTS } from '../constants'
import type Canvas from './canvas'

export class FrameLoop {
    private simulationCanvas: Canvas
    private networkCanvas: Canvas
    private container: HTMLElement
    private abortController: AbortController
    private animationId: number | undefined
    private targetFPS: number = CONSTANTS.targetFps
    private framesInterval: number = 1000 / this.targetFPS
    private lastFrameTimestamp: number = 0
    private lastFpsCountTimestamp: number = 0
    private countedFrames: number = 0
    private currentFps: number = 0
    private onFrameCallback?: (timestamp: number, fps: number) => void

    constructor(simulationCanvas: Canvas, network: Canvas) {
        this.simulationCanvas = simulationCanvas
        this.networkCanvas = network
        this.container = simulationCanvas.getContainer()
        this.abortController = new AbortController()

        // Setup resize listener
        window.addEventListener('resize', () => this.resizeCanvas(), {
            signal: this.abortController.signal,
        })

        // Initial resize
        this.resizeCanvas()
    }

    getSimulationCanvas(): Canvas {
        return this.simulationCanvas
    }

    getNetworkCanvas(): Canvas {
        return this.networkCanvas
    }

    getCurrentFps(): number {
        return this.currentFps
    }

    private resizeCanvas(): void {
        const simulationCanvasElement = this.simulationCanvas.getElement()
        const networkCanvasElement = this.networkCanvas.getElement()

        this.container.style.display = 'grid'
        const twoCols = this.container.clientWidth > 699
        this.container.style.gridTemplateColumns = twoCols ? '1fr 1fr' : '1fr'

        const desiredCarWidth = twoCols
            ? this.container.clientWidth / 2
            : this.container.clientWidth
        const desiredCarHeight = twoCols
            ? this.container.clientHeight
            : this.container.clientHeight / 2
        const desiredNetWidth = desiredCarWidth
        const desiredNetHeight = desiredCarHeight

        if (simulationCanvasElement.width !== desiredCarWidth) {
            simulationCanvasElement.width = desiredCarWidth
        }
        if (simulationCanvasElement.height !== desiredCarHeight) {
            simulationCanvasElement.height = desiredCarHeight
        }
        if (networkCanvasElement.width !== desiredNetWidth) {
            networkCanvasElement.width = desiredNetWidth
        }
        if (networkCanvasElement.height !== desiredNetHeight) {
            networkCanvasElement.height = desiredNetHeight
        }
    }

    start(onFrame: (timestamp: number, fps: number) => void): void {
        this.onFrameCallback = onFrame
        if (this.animationId) {
            cancelAnimationFrame(this.animationId)
        }
        this.animationId = requestAnimationFrame((timestamp) => this.animate(timestamp))
    }

    stop(): void {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId)
            this.animationId = undefined
        }
    }

    destroy(): void {
        this.stop()
        this.abortController.abort()
    }

    private animate(timestamp: number): void {
        if (timestamp - this.lastFrameTimestamp < this.framesInterval) {
            this.animationId = requestAnimationFrame((ts) => this.animate(ts))
            return
        }
        this.lastFrameTimestamp = timestamp

        // Auto-resize on each frame to handle responsive layout
        this.resizeCanvas()

        // Calculate FPS
        this.countedFrames += 1
        if (timestamp - this.lastFpsCountTimestamp > 1000) {
            this.lastFpsCountTimestamp = timestamp
            this.currentFps = this.countedFrames
            this.countedFrames = 0
        }

        // Call the frame callback
        if (this.onFrameCallback) {
            this.onFrameCallback(timestamp, this.currentFps)
        }

        this.animationId = requestAnimationFrame((ts) => this.animate(ts))
    }
}
