import { HTML_IDS } from 'src/constants'
import Persistence from '../libs/persistence'
import type { SimulationConfig } from './simulation-config'
import type { SimulationState } from './simulation-state'

export type UIAction =
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
        private simulationConfig: SimulationConfig,
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

    updateHUD(state: SimulationState, fps: number): void {
        const infoId = document.querySelector(`#${HTML_IDS.info.networkId}`)
        if (infoId) {
            infoId.innerHTML = `${state.getActiveCar()?.getNetwork()?.getId()}`
        }

        // Score panel fields
        const stats = state.getActiveCar()?.getStats()

        if (stats) {
            const overtakeScoreElement = document.querySelector(
                `#${HTML_IDS.info.score.overtakesScore}`,
            )
            if (overtakeScoreElement) {
                overtakeScoreElement.innerHTML = `Overtakes: ${stats.getOvertakesScore().toFixed(0)}`
            }

            const breakingsScoreElement = document.querySelector(
                `#${HTML_IDS.info.score.breakingsScore}`,
            )
            if (breakingsScoreElement) {
                breakingsScoreElement.innerHTML = `Breakings: ${stats.getBreakingsScore().toFixed(0)}`
            }

            const turningsScoreElement = document.querySelector(
                `#${HTML_IDS.info.score.turningsScore}`,
            )
            if (turningsScoreElement) {
                turningsScoreElement.innerHTML = `Turnings: ${stats.getTurningScore().toFixed(0)}`
            }

            const distanceScoreElement = document.querySelector(
                `#${HTML_IDS.info.score.distanceScore}`,
            )
            if (distanceScoreElement) {
                distanceScoreElement.innerHTML = `Distance: ${stats.getDistanceScore().toFixed(0)}`
            }

            const totalScoreElement = document.querySelector(`#${HTML_IDS.info.score.totalScore}`)
            if (totalScoreElement) {
                totalScoreElement.innerHTML = `Total: ${stats.getFormattedTotalScore()}`
            }
        } else {
            // Clear score panel when no active stats
            const fields = [
                HTML_IDS.info.score.distanceScore,
                HTML_IDS.info.score.breakingsScore,
                HTML_IDS.info.score.turningsScore,
                HTML_IDS.info.score.distanceScore,
                HTML_IDS.info.score.totalScore,
            ]
            fields.forEach((id) => {
                const el = document.querySelector(`#${id}`)
                if (el) {
                    el.innerHTML = '0'
                }
            })
        }

        const infoRec = document.querySelector(`#${HTML_IDS.info.record}`)
        if (infoRec) {
            infoRec.innerHTML = `${state.getActiveCar()?.getNetwork()?.getFormattedBestScore() ?? 0}`
        }

        const infoSrs = document.querySelector(`#${HTML_IDS.info.survivedRounds}`)
        if (infoSrs) {
            infoSrs.innerHTML = `${state.getActiveCar()?.getNetwork()?.getSurvivedRounds() ?? 0}`
        }

        const infoCrs = document.querySelector(`#${HTML_IDS.info.remainingCars}`)
        if (infoCrs) {
            infoCrs.innerHTML = `${state.getRemainingCars().length}`
        }

        const infoTimeout = document.querySelector(`#${HTML_IDS.info.timeout}`)
        if (infoTimeout) {
            const activeCar = state.getActiveCar()
            const timeout = activeCar?.getTimeout()

            if (timeout) {
                const remainingTime = timeout.getRemainingTime()
                if (timeout.isRunning() && remainingTime > 0) {
                    // Mostra tempo rimanente se il timeout è attivo
                    const seconds = (remainingTime / 1000).toFixed(2)
                    infoTimeout.innerHTML = `${seconds}s`
                } else {
                    // Se il timeout è scaduto o non è attivo, mostra 0
                    infoTimeout.innerHTML = '0.00s'
                }
            } else {
                infoTimeout.innerHTML = 'N/A'
            }
        }

        const infoPps = document.querySelector(`#${HTML_IDS.info.pixelsPerSecond}`)
        if (infoPps) {
            const pixelsPerSecond = (state.getActiveCar()?.getSpeed() ?? 0) * fps
            infoPps.innerHTML = `${pixelsPerSecond.toFixed(2)}`
        }

        const infoSteeringDegree = document.querySelector(`#${HTML_IDS.info.steeringDegree}`)
        if (infoSteeringDegree) {
            //     const steeringInput = state.getActiveCar()?.getControls().getSteering() ?? 0
            //     const steeringPercentage = Math.abs(steeringInput * 100) // Converti in percentuale

            //     let steeringLabel: string
            //     if (steeringInput > 0.009) {
            //         steeringLabel = 'RIGHT' // input positivo = destra (corretto)
            //     } else if (steeringInput < -0.009) {
            //         steeringLabel = 'LEFT' // input negativo = sinistra (corretto)
            //     } else {
            //         steeringLabel = '' // Straight
            //     }

            const steeringValue = state.getActiveCar()?.getAbsoluteSteeringDegree() ?? 0
            infoSteeringDegree.innerHTML = `${steeringValue.toFixed(2)}°`
        }

        const infoFps = document.querySelector(`#${HTML_IDS.info.fps}`)
        if (infoFps) {
            infoFps.innerHTML = `${fps}`
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

                this.simulationConfig.setMutationRate(this.mutationRate)
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
                this.simulationConfig.setCarsQuantity(this.carsQuantity)
                this.onAction('network-restart')
            },
            { signal: this.abortController.signal },
        )
    }

    private setupButtons(): void {
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
                    this.simulationConfig.setNetworkArchitecture(this.networkArchitecture)
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
}
