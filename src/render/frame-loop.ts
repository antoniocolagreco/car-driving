/** Reports animation-frame deltas and a once-per-second FPS count; physics stays in `app.ts`. */

/** Caps the first delta after a backgrounded tab resumes. */
const MAX_DELTA_SECONDS = 0.1

export type FrameLoop = {
    start(): void
    stop(): void
    readonly fps: number
    destroy(): void
}

/** Calls `onFrame` for every animation frame with a capped delta. */
export const createFrameLoop = (
    onFrame: (deltaSeconds: number, fps: number) => void,
): FrameLoop => {
    let animationId: number | undefined
    let lastTimestamp: number | undefined
    let fpsWindowStart = 0
    let framesInWindow = 0
    let fps = 0

    const tick = (timestamp: number): void => {
        const deltaSeconds =
            lastTimestamp === undefined
                ? 0
                : Math.min((timestamp - lastTimestamp) / 1000, MAX_DELTA_SECONDS)
        lastTimestamp = timestamp

        framesInWindow += 1
        if (timestamp - fpsWindowStart >= 1000) {
            fps = framesInWindow
            framesInWindow = 0
            fpsWindowStart = timestamp
        }

        onFrame(deltaSeconds, fps)
        animationId = requestAnimationFrame(tick)
    }

    const stop = (): void => {
        if (animationId !== undefined) {
            cancelAnimationFrame(animationId)
            animationId = undefined
        }
    }

    const start = (): void => {
        if (animationId !== undefined) {
            return
        }
        // Do not report paused time as one frame on resume.
        lastTimestamp = undefined
        animationId = requestAnimationFrame(tick)
    }

    return {
        start,
        stop,
        get fps() {
            return fps
        },
        destroy: stop,
    }
}
