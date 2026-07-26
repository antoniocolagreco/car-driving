/**
 * Drives a `requestAnimationFrame` loop and reports each frame's delta time in
 * seconds, plus a once-per-second FPS count.
 *
 * This loop does not own a fixed-timestep accumulator or a target frame rate:
 * it reports the real delta between frames and lets the caller (`app.ts`)
 * decide how many physics steps that delta is worth. It also never throttles
 * itself by returning early without calling `requestAnimationFrame` again for
 * a "skipped" frame, unlike the old `FrameLoop`, which busy-waited until its
 * target interval had passed.
 */

/** Safety valve: a backgrounded tab resuming after minutes away must not report a multi-second delta. */
const MAX_DELTA_SECONDS = 0.1

export type FrameLoop = {
    /** Starts (or resumes) calling `onFrame` every animation frame. */
    start(): void
    /** Stops calling `onFrame`. Safe to call when already stopped. */
    stop(): void
    /** Frames counted in the last full second, updated once per second. */
    readonly fps: number
    /** Stops the loop. There is nothing else to release. */
    destroy(): void
}

/**
 * Builds a `FrameLoop` that calls `onFrame(deltaSeconds, fps)` on every
 * animation frame, `deltaSeconds` clamped to `MAX_DELTA_SECONDS`.
 */
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
        // A fresh start should not report the elapsed time spent stopped as
        // one giant frame, so forget where we were.
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
