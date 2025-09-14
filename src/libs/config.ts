// Centralized configuration and storage keys

export const STORAGE_KEYS = {
    bestNetwork: 'best-network',
    backupNetwork: 'backup-network',
    mutationRate: 'mutation-rate',
    carsQuantity: 'cars-quantity',
    neurons: 'neurons',
} as const

export const TIMERS = {
    deathMs: 15000,
    demeritMs: 10000,
    winnerMs: 3000,
} as const

// Display and simulation defaults (UI/render-only; no game logic change)
export const DISPLAY = {
    targetFps: 60,
    networkDrawThrottleMs: 120,
    viewportYFactor: 0.7,
} as const

export const SIMULATION = {
    initialTrafficRows: 20,
    trafficCrashLead: 5000,
} as const

export const DEFAULTS = {
    mutationRate: 0.1,
    carsQuantity: 50,
    neurons: '4',
} as const
