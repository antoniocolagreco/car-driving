import { HTML_IDS } from 'src/constants'
import Persistence from '../libs/persistence'

export interface UIConfig {
    mutationRate: number
    carsQuantity: number
    networkArchitecture: number[]
}

export interface UIState {
    activeCar?: {
        networkId?: string
        points: number
        record?: number
        networkSurvivedRounds?: number
        speed: number
    }
    remainingCars: number
    fps: number
}

export type UIAction =
    | 'save-network'
    | 'restore-network'
    | 'reset-network'
    | 'restart-network'
    | 'evolve-network'

export class UIController {
    private mutationRate: number
    private carsQuantity: number
    private networkArchitecture: Array<number>

    constructor(
        private abortController: AbortController,
        private onConfigChange: (config: Partial<UIConfig>) => void,
        private onAction: (action: UIAction) => void,
    ) {
        this.mutationRate = Persistence.loadMutationRate()
        this.carsQuantity = Persistence.loadCarsQuantity()
        this.networkArchitecture = Persistence.loadNetworkArchitecture()
    }

    setupEventListeners(): void {
        this.setupSliders()
        this.setupButtons()
        this.setupInputs()
        this.initializeUIValues()
    }

    updateHUD(state: UIState): void {
        const infoId = document.querySelector(`#${HTML_IDS.infoNetworkId}`)
        if (infoId) {
            infoId.innerHTML = `${state.activeCar?.networkId ?? ''}`
        }

        const infoPts = document.querySelector(`#${HTML_IDS.infoPoints}`)
        if (infoPts) {
            infoPts.innerHTML = `${state.activeCar?.points ?? 0}`
        }

        const infoRec = document.querySelector(`#${HTML_IDS.infoRecord}`)
        if (infoRec) {
            infoRec.innerHTML = `${state.activeCar?.networkId ? state.activeCar.record : 0}`
        }

        const infoSrs = document.querySelector(`#${HTML_IDS.infoSurvivedRounds}`)
        if (infoSrs) {
            infoSrs.innerHTML = `${state.activeCar?.networkSurvivedRounds ?? 0}`
        }

        const infoCrs = document.querySelector(`#${HTML_IDS.infoRemainingCars}`)
        if (infoCrs) {
            infoCrs.innerHTML = `${state.remainingCars}`
        }

        const infoPps = document.querySelector(`#${HTML_IDS.infoPixelsPerSecond}`)
        if (infoPps) {
            const pixelsPerSecond = (state.activeCar?.speed ?? 0) * state.fps
            infoPps.innerHTML = `${pixelsPerSecond.toFixed(2)}`
        }

        const infoFps = document.querySelector(`#${HTML_IDS.infoFps}`)
        if (infoFps) {
            infoFps.innerHTML = `${state.fps}`
        }
    }

    private initializeUIValues(): void {
        const mutationValue = document.querySelector(
            `#${HTML_IDS.mutationRateValue}`,
        ) as HTMLSpanElement | null
        const mutationRange = document.querySelector(
            `#${HTML_IDS.mutationRateRange}`,
        ) as HTMLInputElement | null
        const carsQuantityValue = document.querySelector(
            `#${HTML_IDS.carsQuantityValue}`,
        ) as HTMLSpanElement | null
        const carsQuantityRange = document.querySelector(
            `#${HTML_IDS.carsQuantityRange}`,
        ) as HTMLInputElement | null
        const neuronsInput = document.querySelector(
            `#${HTML_IDS.networkArchitectureInput}`,
        ) as HTMLInputElement | null

        if (mutationValue) {
            mutationValue.innerText = `${Math.round(this.mutationRate * 100)}%`
        }
        if (mutationRange) {
            mutationRange.value = `${this.mutationRate * 100}`
        }
        if (carsQuantityValue) {
            carsQuantityValue.innerText = String(this.carsQuantity)
        }
        if (carsQuantityRange) {
            carsQuantityRange.value = `${this.carsQuantity}`
        }
        if (neuronsInput) {
            neuronsInput.value = this.networkArchitecture.join(',')
        }
    }

    private setupSliders(): void {
        this.setupMutationRateSlider()
        this.setupCarsQuantitySlider()
    }

    private setupMutationRateSlider(): void {
        const mutationRange = document.querySelector(
            `#${HTML_IDS.mutationRateRange}`,
        ) as HTMLInputElement | null
        const mutationValue = document.querySelector(
            `#${HTML_IDS.mutationRateValue}`,
        ) as HTMLSpanElement | null

        mutationRange?.addEventListener(
            'input',
            () => {
                if (!mutationRange || !mutationValue) {
                    return
                }
                const value = Number(mutationRange.value)
                mutationValue.innerText = `${value}%`
                this.mutationRate = value / 100
                Persistence.saveMutationRate(this.mutationRate)
                this.onConfigChange({ mutationRate: this.mutationRate })
            },
            { signal: this.abortController.signal },
        )
    }

    private setupCarsQuantitySlider(): void {
        const carsQuantityRange = document.querySelector(
            `#${HTML_IDS.carsQuantityRange}`,
        ) as HTMLInputElement | null
        const carsQuantityValue = document.querySelector(
            `#${HTML_IDS.carsQuantityValue}`,
        ) as HTMLSpanElement | null

        carsQuantityRange?.addEventListener(
            'input',
            () => {
                if (!carsQuantityRange || !carsQuantityValue) {
                    return
                }
                carsQuantityValue.innerText = carsQuantityRange.value
                this.carsQuantity = Number(carsQuantityRange.value)
                Persistence.saveCarsQuantity(this.carsQuantity)
                this.onConfigChange({ carsQuantity: this.carsQuantity })
            },
            { signal: this.abortController.signal },
        )
    }

    private setupButtons(): void {
        document
            .querySelector(`#${HTML_IDS.saveNetworkButton}`)
            ?.addEventListener('click', () => this.onAction('save-network'), {
                signal: this.abortController.signal,
            })

        document
            .querySelector(`#${HTML_IDS.restoreNetworkButton}`)
            ?.addEventListener('click', () => this.onAction('restore-network'), {
                signal: this.abortController.signal,
            })

        document
            .querySelector(`#${HTML_IDS.resetNetworkButton}`)
            ?.addEventListener('click', () => this.onAction('reset-network'), {
                signal: this.abortController.signal,
            })

        document
            .querySelector(`#${HTML_IDS.restartNetworkButton}`)
            ?.addEventListener('click', () => this.onAction('restart-network'), {
                signal: this.abortController.signal,
            })

        document
            .querySelector(`#${HTML_IDS.evolveNetworkButton}`)
            ?.addEventListener('click', () => this.onAction('evolve-network'), {
                signal: this.abortController.signal,
            })
    }

    private setupInputs(): void {
        const neuronsInput = document.querySelector(
            `#${HTML_IDS.networkArchitectureInput}`,
        ) as HTMLInputElement | null

        neuronsInput?.addEventListener(
            'keypress',
            (event: Event) => {
                const e = event as KeyboardEvent
                if (e.key !== 'Enter' || !neuronsInput) {
                    return
                }

                const values = neuronsInput.value
                    .split(',')
                    .map((v) => Number(v))
                    .filter((n) => Number.isFinite(n))

                if (values.length > 0) {
                    Persistence.saveNetworkArchitecture(values.join(','))
                    this.networkArchitecture = values
                    Persistence.clearBestNetwork()
                    this.onConfigChange({ networkArchitecture: this.networkArchitecture })
                    this.onAction('restart-network')
                }
            },
            { signal: this.abortController.signal },
        )
    }

    getConfig(): UIConfig {
        return {
            mutationRate: this.mutationRate,
            carsQuantity: this.carsQuantity,
            networkArchitecture: this.networkArchitecture,
        }
    }
}
