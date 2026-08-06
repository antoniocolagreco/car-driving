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

/** Maps held Arrow/WASD/Space keys onto one mutable controls record. */
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
            // Prevent page scrolling while driving.
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

    // Blur may swallow keyup events, so release every held control.
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
