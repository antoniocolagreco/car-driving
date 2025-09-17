import { CONSTANTS } from '../constants'

export class FrameLoop {
    private container: HTMLElement
    private carCanvas: HTMLCanvasElement
    private networkCanvas: HTMLCanvasElement
    private abortController: AbortController
    private animationId: number | undefined
    private targetFPS: number = CONSTANTS.targetFps
    private framesInterval: number = 1000 / this.targetFPS
    private lastFrameTimestamp: number = 0
    private lastFpsCountTimestamp: number = 0
    private countedFrames: number = 0
    private currentFps: number = 0
    private onFrameCallback?: (timestamp: number, fps: number) => void

    constructor(container: HTMLElement) {
        this.container = container
        this.abortController = new AbortController()

        // Create canvas elements
        this.carCanvas = document.createElement('canvas')
        this.carCanvas.setAttribute('role', 'img')
        this.carCanvas.setAttribute('aria-label', 'Simulation view: road and cars')

        this.networkCanvas = document.createElement('canvas')
        this.networkCanvas.setAttribute('role', 'img')
        this.networkCanvas.setAttribute(
            'aria-label',
            'Neural network visualization of the active car',
        )

        this.container.appendChild(this.carCanvas)
        this.container.appendChild(this.networkCanvas)

        // Setup resize listener
        window.addEventListener('resize', () => this.resizeCanvas(), {
            signal: this.abortController.signal,
        })

        // Initial resize
        this.resizeCanvas()
    }

    getCarCanvas(): HTMLCanvasElement {
        return this.carCanvas
    }

    getNetworkCanvas(): HTMLCanvasElement {
        return this.networkCanvas
    }

    getCarContext(): CanvasRenderingContext2D | null {
        return this.carCanvas.getContext('2d', { alpha: false })
    }

    getNetworkContext(): CanvasRenderingContext2D | null {
        return this.networkCanvas.getContext('2d', { alpha: false })
    }

    getCurrentFps(): number {
        return this.currentFps
    }

    private resizeCanvas(): void {
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

        if (this.carCanvas.width !== desiredCarWidth) {
            this.carCanvas.width = desiredCarWidth
        }
        if (this.carCanvas.height !== desiredCarHeight) {
            this.carCanvas.height = desiredCarHeight
        }
        if (this.networkCanvas.width !== desiredNetWidth) {
            this.networkCanvas.width = desiredNetWidth
        }
        if (this.networkCanvas.height !== desiredNetHeight) {
            this.networkCanvas.height = desiredNetHeight
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
        try {
            this.container.removeChild(this.carCanvas)
            this.container.removeChild(this.networkCanvas)
        } catch {}
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
