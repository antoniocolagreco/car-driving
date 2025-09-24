export class Timeout {
    private startTime: number
    private duration: number
    private running: boolean
    private timeoutId: ReturnType<typeof setTimeout> | null
    private onTimeoutCallback: () => void

    constructor(duration: number, onTimeoutCallback: () => void) {
        this.startTime = Date.now()
        this.duration = duration
        this.running = false
        this.timeoutId = null
        this.onTimeoutCallback = onTimeoutCallback
    }

    start(): void {
        if (this.running) {
            return
        }
        this.running = true
        this.timeoutId = setTimeout(() => {
            this.running = false
            if (this.onTimeoutCallback) {
                this.onTimeoutCallback()
            }
        }, this.duration)
    }

    stop(): void {
        if (!this.running) {
            return
        }
        this.running = false
        if (this.timeoutId) {
            clearTimeout(this.timeoutId)
            this.timeoutId = null
        }
    }

    reset(): void {
        this.stop()
        this.startTime = Date.now()
        this.start()
    }

    isRunning(): boolean {
        return this.running
    }

    getRemainingTime(): number {
        if (!this.running) {
            return 0
        }
        const elapsed = Date.now() - this.startTime
        return Math.max(this.duration - elapsed, 0)
    }
}
