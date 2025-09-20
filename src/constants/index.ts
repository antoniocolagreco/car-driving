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
    buttons: {
        simulationStart: 'simulation-start-button',
        simulationStop: 'simulation-stop-button',
        saveNetwork: 'save-network-button',
        restoreNetwork: 'restore-network-button',
        resetNetwork: 'reset-network-button',
        restartNetwork: 'restart-network-button',
        evolveNetwork: 'evolve-network-button',
    },
    inputs: {
        mutationRateRange: 'mutation-rate-range',
        mutationRateValue: 'mutation-rate-value',
        carsQuantityRange: 'number-of-cars-range',
        carsQuantityValue: 'number-of-cars-value',
        sensorsAngleValue: 'sensor-angle-value',
        sensorsAngleRange: 'sensor-angle-input',
        sensorsQuantityInput: 'sensor-quantity-value',
        networkArchitectureInput: 'network-architecture-input',
        imitationModeRadio: 'app-mode-imitation',
        geneticModeRadio: 'app-mode-genetic',
        activationTahn: 'activation-tanh',
    },
    info: {
        networkId: 'info-network-id',
        points: 'info-points',
        record: 'info-record',
        survivedRounds: 'info-survived-rounds',
        remainingCars: 'info-remaining-cars',
        timeout: 'info-timeout',
        pixelsPerSecond: 'info-pixels-per-second',
        fps: 'info-fps',
    },
} as const
