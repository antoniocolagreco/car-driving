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
    | 'simulation-start'
    | 'simulation-stop'
    | 'network-save'
    | 'network-restore'
    | 'network-reset'
    | 'network-restart'
    | 'network-evolve'
    | 'switch-to-imitation'
    | 'switch-to-genetic'

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
        this.setupModeRadios()
        this.initializeUIValues()
    }

    updateHUD(state: UIState): void {
        const infoId = document.querySelector(`#${HTML_IDS.info.networkId}`)
        if (infoId) {
            infoId.innerHTML = `${state.activeCar?.networkId ?? ''}`
        }

        const infoPts = document.querySelector(`#${HTML_IDS.info.points}`)
        if (infoPts) {
            infoPts.innerHTML = `${state.activeCar?.points ?? 0}`
        }

        const infoRec = document.querySelector(`#${HTML_IDS.info.record}`)
        if (infoRec) {
            infoRec.innerHTML = `${state.activeCar?.networkId ? state.activeCar.record : 0}`
        }

        const infoSrs = document.querySelector(`#${HTML_IDS.info.survivedRounds}`)
        if (infoSrs) {
            infoSrs.innerHTML = `${state.activeCar?.networkSurvivedRounds ?? 0}`
        }

        const infoCrs = document.querySelector(`#${HTML_IDS.info.remainingCars}`)
        if (infoCrs) {
            infoCrs.innerHTML = `${state.remainingCars}`
        }

        const infoPps = document.querySelector(`#${HTML_IDS.info.pixelsPerSecond}`)
        if (infoPps) {
            const pixelsPerSecond = (state.activeCar?.speed ?? 0) * state.fps
            infoPps.innerHTML = `${pixelsPerSecond.toFixed(2)}`
        }

        const infoFps = document.querySelector(`#${HTML_IDS.info.fps}`)
        if (infoFps) {
            infoFps.innerHTML = `${state.fps}`
        }
    }

    private initializeUIValues(): void {
        const mutationValue = document.querySelector(
            `#${HTML_IDS.inputs.mutationRateValue}`,
        ) as HTMLSpanElement | null
        const mutationRange = document.querySelector(
            `#${HTML_IDS.inputs.mutationRateRange}`,
        ) as HTMLInputElement | null
        const carsQuantityValue = document.querySelector(
            `#${HTML_IDS.inputs.carsQuantityValue}`,
        ) as HTMLSpanElement | null
        const carsQuantityRange = document.querySelector(
            `#${HTML_IDS.inputs.carsQuantityRange}`,
        ) as HTMLInputElement | null
        const neuronsInput = document.querySelector(
            `#${HTML_IDS.inputs.networkArchitectureInput}`,
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
            `#${HTML_IDS.inputs.mutationRateRange}`,
        ) as HTMLInputElement | null
        const mutationValue = document.querySelector(
            `#${HTML_IDS.inputs.mutationRateValue}`,
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
            `#${HTML_IDS.inputs.carsQuantityRange}`,
        ) as HTMLInputElement | null
        const carsQuantityValue = document.querySelector(
            `#${HTML_IDS.inputs.carsQuantityValue}`,
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
            .querySelector(`#${HTML_IDS.buttons.simulationStart}`)
            ?.addEventListener('click', () => this.onAction('simulation-start'), {
                signal: this.abortController.signal,
            })
        document
            .querySelector(`#${HTML_IDS.buttons.simulationStop}`)
            ?.addEventListener('click', () => this.onAction('simulation-stop'), {
                signal: this.abortController.signal,
            })
        document
            .querySelector(`#${HTML_IDS.buttons.saveNetwork}`)
            ?.addEventListener('click', () => this.onAction('network-save'), {
                signal: this.abortController.signal,
            })

        document
            .querySelector(`#${HTML_IDS.buttons.restoreNetwork}`)
            ?.addEventListener('click', () => this.onAction('network-restore'), {
                signal: this.abortController.signal,
            })

        document
            .querySelector(`#${HTML_IDS.buttons.resetNetwork}`)
            ?.addEventListener('click', () => this.onAction('network-reset'), {
                signal: this.abortController.signal,
            })

        document
            .querySelector(`#${HTML_IDS.buttons.restartNetwork}`)
            ?.addEventListener('click', () => this.onAction('network-restart'), {
                signal: this.abortController.signal,
            })

        document
            .querySelector(`#${HTML_IDS.buttons.evolveNetwork}`)
            ?.addEventListener('click', () => this.onAction('network-evolve'), {
                signal: this.abortController.signal,
            })
    }

    private setupInputs(): void {
        const neuronsInput = document.querySelector(
            `#${HTML_IDS.inputs.networkArchitectureInput}`,
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
                    this.onAction('network-restart')
                }
            },
            { signal: this.abortController.signal },
        )
    }

    private setupModeRadios(): void {
        const imitationRadio = document.querySelector(
            `#${HTML_IDS.inputs.imitationModeRadio}`,
        ) as HTMLInputElement | null
        const geneticRadio = document.querySelector(
            `#${HTML_IDS.inputs.geneticModeRadio}`,
        ) as HTMLInputElement | null

        imitationRadio?.addEventListener(
            'change',
            () => {
                if (imitationRadio.checked) {
                    this.onAction('switch-to-imitation')
                }
            },
            { signal: this.abortController.signal },
        )

        geneticRadio?.addEventListener(
            'change',
            () => {
                if (geneticRadio.checked) {
                    this.onAction('switch-to-genetic')
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
