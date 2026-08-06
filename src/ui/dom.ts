/** DOM ids shared by markup and UI wiring. */

export const ELEMENT_IDS = {
    appContainer: 'app-container',
    /** `aria-live` region: only meaningful state changes are announced here. */
    statusRegion: 'status-region',
    manualDriveState: 'manual-drive-state',
    trafficState: 'traffic-state',
    radarState: 'radar-state',
    sidePanelState: 'side-panel-state',
    courseIntervalValue: 'course-interval-value',
    brakeBonusValue: 'brake-bonus-value',
    buttons: {
        reset: 'reset-network-button',
        restart: 'restart-network-button',
        evolve: 'evolve-network-button',
        simulate: 'simulate-button',
        simulateStop: 'simulate-stop-button',
        drive: 'drive-button',
        traffic: 'traffic-button',
        radar: 'radar-button',
        sidePanel: 'side-panel-button',
    },
    inputs: {
        carsQuantityRange: 'cars-quantity-range',
        carsQuantityNumber: 'cars-quantity-number',
        mutationRateRange: 'mutation-rate-range',
        mutationRateNumber: 'mutation-rate-number',
        hiddenLayersInput: 'hidden-layers-input',
        courseIntervalRange: 'course-interval-range',
        brakeBonusRange: 'brake-bonus-range',
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
    champion: {
        networkId: 'champion-network-id',
        seconds: 'champion-seconds',
        overtakes: 'champion-overtakes',
    },
    simulate: {
        dialog: 'simulate-dialog',
        raceCount: 'simulate-race-count',
        bestOvertakes: 'simulate-best-overtakes',
        log: 'simulate-log',
        empty: 'simulate-empty',
    },
} as const

/** Looks up an element and normalizes a missing result to `undefined`. */
export const findElement = <T extends HTMLElement = HTMLElement>(id: string): T | undefined => {
    const element = document.getElementById(id)
    return element instanceof HTMLElement ? (element as T) : undefined
}
