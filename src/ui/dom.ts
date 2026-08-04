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
    /** Text inside the radar-visibility switch. */
    radarState: 'radar-state',
    buttons: {
        loadChampion: 'load-champion-button',
        reset: 'reset-network-button',
        restart: 'restart-network-button',
        evolve: 'evolve-network-button',
        simulate: 'simulate-button',
        simulateStop: 'simulate-stop-button',
        drive: 'drive-button',
        traffic: 'traffic-button',
        radar: 'radar-button',
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
        aliveCars: 'hud-alive-cars',
        overtakes: 'hud-overtakes',
        raceTime: 'hud-race-time',
        idleTimeout: 'hud-idle-timeout',
        overtakeTimeout: 'hud-overtake-timeout',
        speed: 'hud-speed',
        headingDeviation: 'hud-heading-deviation',
        fps: 'hud-fps',
    },
    /** The record holder's panel, filled from localStorage rather than from the simulation. */
    champion: {
        networkId: 'champion-network-id',
        seconds: 'champion-seconds',
        overtakes: 'champion-overtakes',
    },
    /** The modal shown while the simulation runs headless, with no rendering at all. */
    simulate: {
        dialog: 'simulate-dialog',
        raceCount: 'simulate-race-count',
        bestOvertakes: 'simulate-best-overtakes',
        log: 'simulate-log',
        empty: 'simulate-empty',
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
