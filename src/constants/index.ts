export const STORAGE_KEYS = {
    bestNetwork: 'best-network',
    backupNetwork: 'backup-network',
    mutationRate: 'mutation-rate',
    carsQuantity: 'cars-quantity',
    networkArchitecture: 'network-architecture',
} as const

export const CONSTANTS = {
    deathTimeout: 12000,
    demeritTimeout: 8000,
    gameoverDuration: 3000,
    targetFps: 60,
    networkDrawThrottleMs: 120,
    viewportYFactor: 0.7,
    initialTrafficRows: 20,
    maximumDistanceFromFirstCar: 3000,
} as const

export const DEFAULTS = {
    mutationRate: 0.2,
    carsQuantity: 50,
    networkArchitecture: [4],
}

export const HTML_IDS = {
    appContainer: 'app-container',
    saveNetworkButton: 'save-network-button',
    restoreNetworkButton: 'restore-network-button',
    resetNetworkButton: 'reset-network-button',
    restartNetworkButton: 'restart-network-button',
    evolveNetworkButton: 'evolve-network-button',
    mutationRateRange: 'mutation-rate-range',
    mutationRateValue: 'mutation-rate-value',
    carsQuantityRange: 'number-of-cars-range',
    carsQuantityValue: 'number-of-cars-value',
    networkArchitectureInput: 'network-architecture-input',
    infoNetworkId: 'info-network-id',
    infoPoints: 'info-points',
    infoRecord: 'info-record',
    infoSurvivedRounds: 'info-survived-rounds',
    infoRemainingCars: 'info-remaining-cars',
    infoTimeout: 'info-timeout',
    infoPixelsPerSecond: 'info-pixels-per-second',
    infoFps: 'info-fps',
} as const
