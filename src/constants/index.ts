export const STORAGE_KEYS = {
    bestNetwork: 'best-network',
    backupNetwork: 'backup-network',
    mutationRate: 'mutation-rate',
    carsQuantity: 'cars-quantity',
    networkArchitecture: 'network-architecture',
    sensorCount: 'sensor-count',
    sensorSpread: 'sensor-spread',
} as const

export const CONSTANTS = {
    deathTimeout: 10000,
    gameoverDuration: 3000,
    targetFps: 60,
    networkDrawThrottleMs: 120,
    cameraViewportHeightRatio: 0.7,
    trafficRows: 20,
} as const

export const DEFAULTS = {
    mutationRate: 0.1,
    carsQuantity: 200,
    networkArchitecture: [8, 6, 4],
    sensorCount: 7,
    sensorSpread: Math.PI / 2,
}

export const SCORE = {
    overtake: 50,
    lesserTurning: 0.1,
    averageTurning: 0.3,
    greaterTurning: 0.5,
    breaking: 5,
    distanceTravelled: 0.01,
    settings: {
        reactionDistanceThreshold: 300,
        lesserSteeringDegreeReaction: 0.025,
        averageSteeringDegreeReaction: 0.05,
        greaterSteeringDegreeReaction: 0.1,
        frontAngleToCheckForCars: Math.PI / 4,
    },
}

export const SENSOR_LIMITS = {
    minCount: 3,
    maxCount: 36,
    minSpread: 0,
    maxSpread: Math.PI * 2,
    rayLength: 700,
} as const

export const MUTATION_LIMITS = {
    minRate: 0,
    maxRate: 1,
    lowRateFloor: 0.01,
} as const

export const MUTATION_DISTRIBUTION = {
    baseRatio: 0.5,
    lowRatio: 0.25,
} as const

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
        sensorsQuantityInput: 'sensor-quantity-input',
        sensorsQuantityValue: 'sensor-quantity-value',
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
