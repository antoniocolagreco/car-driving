import { BRAKE_BONUSES, COURSE_INTERVALS, DEFAULTS } from '@core/config'
import { clamp } from '@core/math'
import type { SimulationSettings } from '@core/simulation'
import type { RadarMode } from '@render/car'
import { ELEMENT_IDS, findElement } from './dom'

/** Wires controls whose limits are defined by the markup and core config. */

export type UiAction = 'restart' | 'reset' | 'evolve' | 'simulate'

export type SidePanelView = 'network' | 'veterans'

export type ControlPanelHandlers = {
    onSettingsChange(settings: SimulationSettings): void
    onAction(action: UiAction): void
    onDriveToggle(driving: boolean): void
    /** Traffic paint switched on or off; it must not affect the simulation. */
    onTrafficVisibilityToggle(visible: boolean): void
    /** Radar presentation changed; sensing and network inputs remain active. */
    onRadarModeChange(mode: RadarMode): void
    onSidePanelChange(view: SidePanelView): void
}

/** Three states require a cycle button rather than an ARIA switch. */
const RADAR_CYCLE: readonly RadarMode[] = ['hull', 'zones', 'off']

const RADAR_LABELS: Readonly<Record<RadarMode, string>> = {
    hull: 'Radar: free area',
    zones: 'Radar: zones',
    off: 'Radar: hidden',
}

const SIDE_PANEL_LABELS: Readonly<Record<SidePanelView, string>> = {
    network: 'Panel: network',
    veterans: 'Panel: veterans',
}

/** Labels an index-based interval choice, including Infinity. */
export const courseIntervalLabel = (interval: number): string =>
    Number.isFinite(interval) ? String(interval) : '∞'

const isPositiveInteger = (value: number): boolean =>
    Number.isFinite(value) && Number.isInteger(value) && value > 0

/** Parses a comma-separated list of positive integers. */
const parseHiddenLayers = (text: string): readonly number[] | undefined => {
    const parts = text.split(',').map((part) => Number(part.trim()))
    if (parts.length === 0 || !parts.every(isPositiveInteger)) {
        return undefined
    }
    return parts
}

/** Wires all controls under one abort signal. Numeric settings apply on `change`. */
export const createControlPanel = (
    initial: SimulationSettings,
    handlers: ControlPanelHandlers,
    signal: AbortSignal,
): void => {
    let settings: SimulationSettings = {
        carsQuantity: initial.carsQuantity,
        mutationRate: initial.mutationRate,
        hiddenLayers: initial.hiddenLayers,
        generationsPerCourse: initial.generationsPerCourse,
        brakeBonus: initial.brakeBonus,
    }

    const emitSettingsChange = (): void => {
        handlers.onSettingsChange(settings)
    }

    /** Keeps a slider and number field synchronized; applies only on committed changes. */
    const wireNumericSetting = (
        rangeId: string,
        numberId: string,
        initialDisplay: number,
        applySettings: (display: number) => SimulationSettings,
        options?: { readonly restarts?: boolean },
    ): void => {
        const range = findElement<HTMLInputElement>(rangeId)
        const numberField = findElement<HTMLInputElement>(numberId)
        const restarts = options?.restarts ?? true

        const limits = range ?? numberField
        const min = limits ? Number(limits.min) : Number.NEGATIVE_INFINITY
        const max = limits ? Number(limits.max) : Number.POSITIVE_INFINITY

        const show = (display: number): void => {
            if (range) {
                range.value = String(display)
            }
            if (numberField) {
                numberField.value = String(display)
            }
        }

        const apply = (raw: number): void => {
            const display = clamp(Math.round(raw), min, max)
            show(display)
            settings = applySettings(display)
            emitSettingsChange()
            if (restarts) {
                handlers.onAction('restart')
            }
        }

        show(clamp(Math.round(initialDisplay), min, max))

        range?.addEventListener('input', () => show(Number(range.value)), { signal })
        range?.addEventListener('change', () => apply(Number(range.value)), { signal })
        numberField?.addEventListener(
            'change',
            () => {
                const typed = Number(numberField.value)
                // Fall back to the last valid slider value instead of applying NaN.
                apply(Number.isFinite(typed) ? typed : Number(range?.value ?? min))
            },
            { signal },
        )
    }

    wireNumericSetting(
        ELEMENT_IDS.inputs.carsQuantityRange,
        ELEMENT_IDS.inputs.carsQuantityNumber,
        settings.carsQuantity,
        (display) => ({ ...settings, carsQuantity: display }),
    )

    // Mutation applies to the next generation without interrupting this race.
    wireNumericSetting(
        ELEMENT_IDS.inputs.mutationRateRange,
        ELEMENT_IDS.inputs.mutationRateNumber,
        settings.mutationRate * 100,
        (display) => ({ ...settings, mutationRate: display / 100 }),
        { restarts: false },
    )

    const hiddenLayersInput = findElement<HTMLInputElement>(ELEMENT_IDS.inputs.hiddenLayersInput)
    if (hiddenLayersInput) {
        hiddenLayersInput.value = settings.hiddenLayers.join(', ')
        hiddenLayersInput.addEventListener(
            'keydown',
            (event) => {
                if (event.key !== 'Enter') {
                    return
                }
                event.preventDefault()
                const parsed = parseHiddenLayers(hiddenLayersInput.value)
                if (!parsed) {
                    hiddenLayersInput.value = settings.hiddenLayers.join(', ')
                    return
                }
                settings = { ...settings, hiddenLayers: parsed }
                hiddenLayersInput.value = parsed.join(', ')
                emitSettingsChange()
                handlers.onAction('restart')
            },
            { signal },
        )
    }

    // The slider stores an index because Infinity is a valid interval choice.
    const courseIntervalRange = findElement<HTMLInputElement>(
        ELEMENT_IDS.inputs.courseIntervalRange,
    )
    const courseIntervalValue = findElement<HTMLSpanElement>(ELEMENT_IDS.courseIntervalValue)

    const showCourseInterval = (index: number): void => {
        if (courseIntervalValue) {
            courseIntervalValue.textContent = courseIntervalLabel(COURSE_INTERVALS[index])
        }
    }

    if (courseIntervalRange) {
        const storedIndex = COURSE_INTERVALS.indexOf(settings.generationsPerCourse)
        // Unknown stored values fall back to the default, not index zero.
        const initialIndex =
            storedIndex === -1
                ? COURSE_INTERVALS.indexOf(DEFAULTS.generationsPerCourse)
                : storedIndex
        courseIntervalRange.value = String(Math.max(0, initialIndex))
        showCourseInterval(Math.max(0, initialIndex))

        courseIntervalRange.addEventListener(
            'input',
            () => showCourseInterval(Number(courseIntervalRange.value)),
            { signal },
        )
        courseIntervalRange.addEventListener(
            'change',
            () => {
                const index = clamp(
                    Math.round(Number(courseIntervalRange.value)),
                    0,
                    COURSE_INTERVALS.length - 1,
                )
                courseIntervalRange.value = String(index)
                showCourseInterval(index)
                settings = { ...settings, generationsPerCourse: COURSE_INTERVALS[index] }
                emitSettingsChange()
            },
            { signal },
        )
    }

    // Index-based choice that reranks the current round without changing physics.
    const brakeBonusRange = findElement<HTMLInputElement>(ELEMENT_IDS.inputs.brakeBonusRange)
    const brakeBonusValue = findElement<HTMLSpanElement>(ELEMENT_IDS.brakeBonusValue)

    const showBrakeBonus = (index: number): void => {
        if (brakeBonusValue) {
            brakeBonusValue.textContent = String(BRAKE_BONUSES[index])
        }
    }

    if (brakeBonusRange) {
        const storedIndex = BRAKE_BONUSES.indexOf(settings.brakeBonus)
        const initialIndex =
            storedIndex === -1 ? BRAKE_BONUSES.indexOf(DEFAULTS.brakeBonus) : storedIndex
        brakeBonusRange.value = String(Math.max(0, initialIndex))
        showBrakeBonus(Math.max(0, initialIndex))

        brakeBonusRange.addEventListener(
            'input',
            () => showBrakeBonus(Number(brakeBonusRange.value)),
            { signal },
        )
        brakeBonusRange.addEventListener(
            'change',
            () => {
                const index = clamp(
                    Math.round(Number(brakeBonusRange.value)),
                    0,
                    BRAKE_BONUSES.length - 1,
                )
                brakeBonusRange.value = String(index)
                showBrakeBonus(index)
                settings = { ...settings, brakeBonus: BRAKE_BONUSES[index] }
                emitSettingsChange()
            },
            { signal },
        )
    }

    const driveButton = findElement<HTMLButtonElement>(ELEMENT_IDS.buttons.drive)
    const driveState = findElement<HTMLSpanElement>(ELEMENT_IDS.manualDriveState)
    let driving = false

    const setDriveLabel = (): void => {
        if (!driveButton) {
            return
        }
        if (driveState) {
            driveState.textContent = driving ? 'Manual driving: ON' : 'Manual driving: off'
        }
        driveButton.setAttribute('aria-checked', String(driving))
        driveButton.classList.toggle('bg-emerald-600', driving)
        driveButton.classList.toggle('hover:bg-emerald-700', driving)
    }
    setDriveLabel()

    const toggleDriving = (): void => {
        driving = !driving
        setDriveLabel()
        handlers.onDriveToggle(driving)
    }

    driveButton?.addEventListener('click', toggleDriving, { signal })

    const trafficButton = findElement<HTMLButtonElement>(ELEMENT_IDS.buttons.traffic)
    const trafficState = findElement<HTMLSpanElement>(ELEMENT_IDS.trafficState)
    let trafficVisible: boolean = true

    const setTrafficLabel = (): void => {
        if (!trafficButton) {
            return
        }
        if (trafficState) {
            trafficState.textContent = trafficVisible ? 'Traffic: visible' : 'Traffic: hidden'
        }
        trafficButton.setAttribute('aria-checked', String(trafficVisible))
        trafficButton.classList.toggle('bg-emerald-600', trafficVisible)
        trafficButton.classList.toggle('hover:bg-emerald-700', trafficVisible)
    }
    setTrafficLabel()

    const toggleTrafficVisibility = (): void => {
        trafficVisible = !trafficVisible
        setTrafficLabel()
        handlers.onTrafficVisibilityToggle(trafficVisible)
    }

    trafficButton?.addEventListener('click', toggleTrafficVisibility, { signal })

    const radarButton = findElement<HTMLButtonElement>(ELEMENT_IDS.buttons.radar)
    const radarState = findElement<HTMLSpanElement>(ELEMENT_IDS.radarState)
    let radarMode: RadarMode = RADAR_CYCLE[0]

    const setRadarLabel = (): void => {
        if (!radarButton) {
            return
        }
        if (radarState) {
            radarState.textContent = RADAR_LABELS[radarMode]
        }
        const painting: boolean = radarMode !== 'off'
        radarButton.classList.toggle('bg-emerald-600', painting)
        radarButton.classList.toggle('hover:bg-emerald-700', painting)
    }
    setRadarLabel()

    const cycleRadarMode = (): void => {
        const next: number = (RADAR_CYCLE.indexOf(radarMode) + 1) % RADAR_CYCLE.length
        radarMode = RADAR_CYCLE[next]
        setRadarLabel()
        handlers.onRadarModeChange(radarMode)
    }

    radarButton?.addEventListener('click', cycleRadarMode, { signal })

    // Network graph and standings share one pane.
    const sidePanelButton = findElement<HTMLButtonElement>(ELEMENT_IDS.buttons.sidePanel)
    const sidePanelState = findElement<HTMLSpanElement>(ELEMENT_IDS.sidePanelState)
    let sidePanelView: SidePanelView = 'network'

    const setSidePanelLabel = (): void => {
        if (sidePanelState) {
            sidePanelState.textContent = SIDE_PANEL_LABELS[sidePanelView]
        }
        sidePanelButton?.setAttribute('aria-checked', String(sidePanelView === 'veterans'))
    }
    setSidePanelLabel()

    const toggleSidePanel = (): void => {
        sidePanelView = sidePanelView === 'network' ? 'veterans' : 'network'
        setSidePanelLabel()
        handlers.onSidePanelChange(sidePanelView)
    }

    sidePanelButton?.addEventListener('click', toggleSidePanel, { signal })

    document.addEventListener(
        'keydown',
        (event) => {
            const target = event.target
            const isEditing =
                target instanceof HTMLElement &&
                (target.isContentEditable ||
                    target instanceof HTMLInputElement ||
                    target instanceof HTMLTextAreaElement ||
                    target instanceof HTMLSelectElement)

            if (
                event.key.toLowerCase() !== 'm' ||
                event.repeat ||
                event.ctrlKey ||
                event.altKey ||
                event.metaKey ||
                isEditing
            ) {
                return
            }

            event.preventDefault()
            toggleDriving()
        },
        { signal },
    )

    const wireAction = (id: string, action: UiAction): void => {
        findElement<HTMLButtonElement>(id)?.addEventListener(
            'click',
            () => handlers.onAction(action),
            { signal },
        )
    }
    wireAction(ELEMENT_IDS.buttons.reset, 'reset')
    wireAction(ELEMENT_IDS.buttons.restart, 'restart')
    wireAction(ELEMENT_IDS.buttons.evolve, 'evolve')
    wireAction(ELEMENT_IDS.buttons.simulate, 'simulate')
}
