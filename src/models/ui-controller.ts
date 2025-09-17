import Persistence from '../libs/persistence'

export interface UIConfig {
    mutationRate: number
    carsQuantity: number
    neurons: number[]
}

export interface UIState {
    activeCar?: {
        networkId?: string
        points: number
        networkSurvivedRounds?: number
        speed: number
    }
    aliveCars: number
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
    private neurons: number[]

    constructor(
        private abortController: AbortController,
        private onConfigChange: (config: Partial<UIConfig>) => void,
        private onAction: (action: UIAction) => void,
    ) {
        this.mutationRate = Persistence.loadMutationRate()
        this.carsQuantity = Persistence.loadCarsQuantity()
        this.neurons = Persistence.loadNeurons()
    }

    setupEventListeners(): void {
        this.setupSliders()
        this.setupButtons()
        this.setupInputs()
        this.initializeUIValues()
    }

    updateHUD(state: UIState): void {
        const infoId = document.querySelector('#info-id')
        if (infoId) {
            infoId.innerHTML = `${state.activeCar?.networkId ?? ''}`
        }

        const infoPts = document.querySelector('#info-pts')
        if (infoPts) {
            infoPts.innerHTML = `${state.activeCar?.points ?? 0}`
        }

        const infoSrs = document.querySelector('#info-srv')
        if (infoSrs) {
            infoSrs.innerHTML = `${state.activeCar?.networkSurvivedRounds ?? 0}`
        }

        const infoCrs = document.querySelector('#info-crs')
        if (infoCrs) {
            infoCrs.innerHTML = `${state.aliveCars}`
        }

        const infoPps = document.querySelector('#info-pps')
        if (infoPps) {
            const pixelsPerSecond = (state.activeCar?.speed ?? 0) * state.fps
            infoPps.innerHTML = `${pixelsPerSecond.toFixed(2)}`
        }

        const infoFps = document.querySelector('#info-fps')
        if (infoFps) {
            infoFps.innerHTML = `${state.fps}`
        }
    }

    private initializeUIValues(): void {
        const mutationValue = document.querySelector(
            '#mutation-rate-value',
        ) as HTMLSpanElement | null
        const mutationRange = document.querySelector('#mutation-rate') as HTMLInputElement | null
        const carsQuantityValue = document.querySelector(
            '#number-of-cars-value',
        ) as HTMLSpanElement | null
        const carsQuantityRange = document.querySelector(
            '#number-of-cars',
        ) as HTMLInputElement | null
        const neuronsInput = document.querySelector('#neurons') as HTMLInputElement | null

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
            neuronsInput.value = this.neurons.join(',')
        }
    }

    private setupSliders(): void {
        this.setupMutationRateSlider()
        this.setupCarsQuantitySlider()
    }

    private setupMutationRateSlider(): void {
        const mutationRange = document.querySelector('#mutation-rate') as HTMLInputElement | null
        const mutationValue = document.querySelector(
            '#mutation-rate-value',
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
            '#number-of-cars',
        ) as HTMLInputElement | null
        const carsQuantityValue = document.querySelector(
            '#number-of-cars-value',
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
            .querySelector('#save-network')
            ?.addEventListener('click', () => this.onAction('save-network'), {
                signal: this.abortController.signal,
            })

        document
            .querySelector('#restore-network')
            ?.addEventListener('click', () => this.onAction('restore-network'), {
                signal: this.abortController.signal,
            })

        document
            .querySelector('#reset-network')
            ?.addEventListener('click', () => this.onAction('reset-network'), {
                signal: this.abortController.signal,
            })

        document
            .querySelector('#restart-network')
            ?.addEventListener('click', () => this.onAction('restart-network'), {
                signal: this.abortController.signal,
            })

        document
            .querySelector('#evolve-network')
            ?.addEventListener('click', () => this.onAction('evolve-network'), {
                signal: this.abortController.signal,
            })
    }

    private setupInputs(): void {
        const neuronsInput = document.querySelector('#neurons') as HTMLInputElement | null

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
                    Persistence.saveNeurons(values.join(','))
                    this.neurons = values
                    Persistence.clearBestNetwork()
                    this.onConfigChange({ neurons: this.neurons })
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
            neurons: this.neurons,
        }
    }
}
