/**
 * Single source of truth for every DOM element id the UI touches, plus a small
 * helper to look one up without repeating a null-check at every call site.
 */

export const ELEMENT_IDS = {
    /** The element `render/canvas.ts` appends the two canvases into. */
    appContainer: 'app-container',
    /** `aria-live` region: only meaningful state changes are announced here. */
    statusRegion: 'status-region',
    /** Text inside the manual-driving switch; the adjacent shortcut badge stays intact. */
    manualDriveState: 'manual-drive-state',
    /** Text inside the traffic-visibility switch. */
    trafficState: 'traffic-state',
    buttons: {
        backup: 'backup-network-button',
        restore: 'restore-network-button',
        reset: 'reset-network-button',
        restart: 'restart-network-button',
        evolve: 'evolve-network-button',
        drive: 'drive-button',
        traffic: 'traffic-button',
    },
    inputs: {
        carsQuantityRange: 'cars-quantity-range',
        carsQuantityNumber: 'cars-quantity-number',
        mutationRateRange: 'mutation-rate-range',
        mutationRateNumber: 'mutation-rate-number',
        hiddenLayersInput: 'hidden-layers-input',
    },
    hud: {
        networkId: 'hud-network-id',
        generation: 'hud-generation',
        completedGenerations: 'hud-completed-generations',
        aliveCars: 'hud-alive-cars',
        bestFitness: 'hud-best-fitness',
        currentFitness: 'hud-current-fitness',
        idleTimeout: 'hud-idle-timeout',
        overtakeTimeout: 'hud-overtake-timeout',
        speed: 'hud-speed',
        headingDeviation: 'hud-heading-deviation',
        fps: 'hud-fps',
        breakdown: {
            overtakes: 'hud-breakdown-overtakes',
            progress: 'hud-breakdown-progress',
            pace: 'hud-breakdown-pace',
            survival: 'hud-breakdown-survival',
            crash: 'hud-breakdown-crash',
            stall: 'hud-breakdown-stall',
            hazard: 'hud-breakdown-hazard',
            reverse: 'hud-breakdown-reverse',
        },
    },
} as const

/**
 * Looks up an element by id, returning `undefined` instead of `null` when it is
 * missing so callers can use optional chaining / nullish coalescing directly.
 */
export const findElement = <T extends HTMLElement = HTMLElement>(id: string): T | undefined => {
    const element = document.getElementById(id)
    return element instanceof HTMLElement ? (element as T) : undefined
}
