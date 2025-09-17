export const STORAGE_KEYS = {
    bestNetwork: 'best-network',
    backupNetwork: 'backup-network',
    mutationRate: 'mutation-rate',
    carsQuantity: 'cars-quantity',
    neurons: 'neurons',
} as const

export const CONSTANTS = {
    deathTimeout: 8000, // Ridotto da 15000: controlli più frequenti
    demeritTimeout: 5000, // Ridotto da 10000: penalità più rapide
    gameoverDuration: 3000,
    targetFps: 60,
    networkDrawThrottleMs: 120,
    viewportYFactor: 0.7,
    initialTrafficRows: 20,
    maximumDistanceFromFirstCar: 3000, // Ridotto da 5000: meno tolleranza
} as const

export const DEFAULTS = {
    mutationRate: 0.2,
    carsQuantity: 50,
    neurons: [8, 6],
}
