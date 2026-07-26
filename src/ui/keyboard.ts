import type { Controls } from '@core/car'

export type ManualControlInput = {
    /** Mutable controls read by the simulation on every fixed step. */
    readonly controls: Controls
    /** Clears both held keys and their resulting control values. */
    reset(): void
}

export type ManualControlHandlers = {
    /** Fired once for each newly pressed driving key, before its control is applied. */
    onIntentStart?(): void
}

/**
 * Manual driving: turns the keyboard into a live `Controls` record the simulation can
 * read every step, exactly as it reads a network's outputs.
 *
 * Arrows or WASD steer and accelerate, Space brakes. The object returned is MUTATED in
 * place as keys go down and up — `simulation.setManualControls` keeps a reference to it
 * and copies it per step, so there is nothing to poll and no event plumbing in `core/`.
 *
 * Keys are tracked as a set of held codes rather than by writing the controls directly
 * on each event, so releasing one arrow while another is still held does the right thing
 * instead of zeroing the input.
 */
export const createManualControls = (
    signal: AbortSignal,
    handlers: ManualControlHandlers = {},
): ManualControlInput => {
    const controls: Controls = { throttle: 0, brake: 0, steering: 0 }
    const held = new Set<string>()

    const intentOf = (event: KeyboardEvent): string | undefined => {
        switch (event.key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
                return 'forward'
            case 'ArrowDown':
            case 's':
            case 'S':
                return 'reverse'
            case 'ArrowLeft':
            case 'a':
            case 'A':
                return 'left'
            case 'ArrowRight':
            case 'd':
            case 'D':
                return 'right'
            case ' ':
                return 'brake'
            default:
                return undefined
        }
    }

    const apply = (): void => {
        controls.throttle = (held.has('forward') ? 1 : 0) - (held.has('reverse') ? 1 : 0)
        controls.steering = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)
        controls.brake = held.has('brake') ? 1 : 0
    }

    document.addEventListener(
        'keydown',
        (event) => {
            const intent = intentOf(event)
            if (!intent) {
                return
            }
            // Arrows scroll the page and Space pages down: neither is wanted mid-corner.
            event.preventDefault()
            if (!held.has(intent)) {
                handlers.onIntentStart?.()
            }
            held.add(intent)
            apply()
        },
        { signal },
    )

    document.addEventListener(
        'keyup',
        (event) => {
            const intent = intentOf(event)
            if (!intent) {
                return
            }
            held.delete(intent)
            apply()
        },
        { signal },
    )

    // A key held while the window loses focus never sends its `keyup`, which would leave
    // the car accelerating into a wall while the user is somewhere else entirely.
    window.addEventListener(
        'blur',
        () => {
            held.clear()
            apply()
        },
        { signal },
    )

    const reset = (): void => {
        held.clear()
        apply()
    }

    return { controls, reset }
}
