export const STORAGE_KEYS = {
    bestNetwork: 'best-network',
    backupNetwork: 'backup-network',
    mutationRate: 'mutation-rate',
    carsQuantity: 'cars-quantity',
    neurons: 'neurons',
} as const

export const CONSTANTS = {
    deathTimeout: 15000,
    demeritTimeout: 10000,
    gameoverDuration: 3000,
    targetFps: 60,
    networkDrawThrottleMs: 120,
    viewportYFactor: 0.7,
    initialTrafficRows: 20,
    maximumDistanceFromFirstCar: 5000,
} as const

export const DEFAULTS = {
    mutationRate: 0.1,
    carsQuantity: 50,
    neurons: [4],
}
