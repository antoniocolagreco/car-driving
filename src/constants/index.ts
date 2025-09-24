export const STORAGE_KEYS = {
    bestNetwork: 'best-network',
    backupNetwork: 'backup-network',
    mutationRate: 'mutation-rate',
    carsQuantity: 'cars-quantity',
    networkArchitecture: 'network-architecture',
} as const

export const CONSTANTS = {
    deathTimeout: 15000,
    gameoverDuration: 3000,
    targetFps: 60,
    networkDrawThrottleMs: 120,
    cameraViewportHeightRatio: 0.7,
    trafficRows: 20,
} as const

export const DEFAULTS = {
    mutationRate: 0.1,
    carsQuantity: 200,
    networkArchitecture: [4],
}

export const SCORE = {
    overtake: 40,
    turning: 1,
    breaking: 0.5,
    distanceTravelled: 0.005,
    settings: {
        reactionDistanceThreshold: 300,
        steeringDegreeReaction: Math.PI / 60,
        frontAngleToCheckForCars: Math.PI / 4,
    },
}

export const HTML_IDS = {
    appContainer: 'app-container',
    buttons: {
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
        record: 'info-record',
        survivedRounds: 'info-survived-rounds',
        remainingCars: 'info-remaining-cars',
        timeout: 'info-timeout',
        pixelsPerSecond: 'info-pixels-per-second',
        steeringDegree: 'info-steering-degree',
        fps: 'info-fps',
        score: {
            overtakesScore: 'info-score-overtakes',
            breakingsScore: 'info-score-breakings',
            turningsScore: 'info-score-turnings',
            distanceScore: 'info-score-distance',
            totalScore: 'info-score-total',
        },
    },
} as const
