import { COURSE_INTERVALS, DEFAULTS } from '@core/config'
import { clamp } from '@core/math'
import type { SimulationSettings } from '@core/simulation'
import type { RadarMode } from '@render/car'
import { ELEMENT_IDS, findElement } from './dom'

/**
 * Wires every input and button of the control panel. Slider/range/select limits
 * (min, max, step) live in the markup, generated at build time from
 * `@core/config` — this module only reacts to user input and sets the initial
 * `value` from `initial`, it never invents a range of its own.
 */

export type UiAction = 'restart' | 'reset' | 'evolve' | 'simulate'

/** What the right-hand pane shows: the followed car's network, or the veterans standings. */
export type SidePanelView = 'network' | 'veterans'

export type ControlPanelHandlers = {
    onSettingsChange(settings: SimulationSettings): void
    onAction(action: UiAction): void
    /** Manual driving switched on or off. */
    onDriveToggle(driving: boolean): void
    /** Traffic paint switched on or off; it must not affect the simulation. */
    onTrafficVisibilityToggle(visible: boolean): void
    /** Radar presentation changed; sensing and network inputs remain active. */
    onRadarModeChange(mode: RadarMode): void
    /** The right-hand pane switched between the network graph and the veterans standings. */
    onSidePanelChange(view: SidePanelView): void
}

/**
 * The order the radar button cycles through: the summary first, then what it is made
 * of, then nothing. Three states are why the radar is a cycling button and not a switch
 * like the two next to it — `role="switch"` can only be on or off.
 */
const RADAR_CYCLE: readonly RadarMode[] = ['hull', 'zones', 'off']

const RADAR_LABELS: Readonly<Record<RadarMode, string>> = {
    hull: 'Radar: free area',
    zones: 'Radar: zones',
    off: 'Radar: hidden',
}

/** The label names what is on screen now, not what clicking would switch to. */
const SIDE_PANEL_LABELS: Readonly<Record<SidePanelView, string>> = {
    network: 'Panel: network',
    veterans: 'Panel: veterans',
}

/**
 * The course-interval slider steps through `COURSE_INTERVALS` by index rather than by
 * value: the choices are 1, 3, 5, 10 and "never", which is not a range anything can be
 * clamped into, and the last of them has no numeric position on a track at all.
 */
export const courseIntervalLabel = (interval: number): string =>
    Number.isFinite(interval) ? String(interval) : '∞'

const isPositiveInteger = (value: number): boolean =>
    Number.isFinite(value) && Number.isInteger(value) && value > 0

/** Parses `"8, 6, 4"` into `[8, 6, 4]`; `undefined` if any part is not a positive integer. */
const parseHiddenLayers = (text: string): readonly number[] | undefined => {
    const parts = text.split(',').map((part) => Number(part.trim()))
    if (parts.length === 0 || !parts.every(isPositiveInteger)) {
        return undefined
    }
    return parts
}

/**
 * Wires every input and button of the control panel with `{ signal }`, so a
 * single `AbortController.abort()` tears the whole thing down.
 *
 * Behaviour that matters:
 * - Every numeric setting has both a slider and a typed number field (see
 *   `wireNumericSetting`), kept in sync, and applies on `change` rather than `input`.
 * - Manual driving is a switch, not a button: it reports its own state, because what it
 *   toggles is invisible until a key is pressed.
 * - Mutation rate only ever calls `onSettingsChange`: it applies to the next
 *   generation and must never trigger a restart of the current one.
 * - Hidden layers is a free-text field, applied on Enter, and rejects anything
 *   that is not a comma-separated list of positive integers by restoring the
 *   previous text instead of building a broken architecture.
 */
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
    }

    const emitSettingsChange = (): void => {
        handlers.onSettingsChange(settings)
    }

    /**
     * Wires one numeric setting: a slider to sweep it and a number field to type it,
     * both in the unit the user reads, kept in sync with each other.
     *
     * Two rules that matter more than the plumbing:
     *
     * - The slider mirrors into the number field on every `input` event (so dragging
     *   shows the value live) but only APPLIES on `change`, when the drag ends. A
     *   setting that rebuilds the population must not rebuild it once per pixel.
     * - The number field applies on `change` too, which fires on Enter or on blur, and
     *   its value is clamped through `min`/`max` from the markup — a typed 500 in a
     *   10-100 field becomes 100 rather than a population of 500.
     */
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
                // An empty or unparseable field falls back to the slider, which still
                // holds the last good value, instead of applying NaN.
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

    // The mutation rate is the one setting that must NOT restart: it applies to the
    // next generation, and interrupting the current one to change it would throw away
    // the round the user is watching.
    wireNumericSetting(
        ELEMENT_IDS.inputs.mutationRateRange,
        ELEMENT_IDS.inputs.mutationRateNumber,
        settings.mutationRate * 100,
        (display) => ({ ...settings, mutationRate: display / 100 }),
        { restarts: false },
    )

    // --- Hidden layers: free text, applied (and validated) on Enter -----------
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

    // --- Course interval -------------------------------------------------------
    // A slider over a list, so the input's value is an INDEX into `COURSE_INTERVALS` and
    // never the interval itself; `∞` is a legitimate choice and has no place on a track.
    // Like the mutation rate it must not restart: it decides which layout the NEXT
    // generation draws, and interrupting the current one to say so would throw away the
    // race being watched.
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
        // An unknown stored value falls back to the default's position rather than to
        // index 0, which would silently turn "3" into "randomise every generation".
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

    // --- Manual driving --------------------------------------------------------
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
        // A switch has to look switched, not just say so.
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

    // --- Traffic visibility ---------------------------------------------------
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

    // --- Radar presentation ---------------------------------------------------
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
        // Its own label is the only place the current mode is announced, so the colour
        // says nothing more than "something is being drawn".
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

    // --- Right-hand pane ------------------------------------------------------
    // The two things worth looking at while a race runs compete for the same space and
    // answer different questions: the graph is about the one car being followed right
    // now, the standings are about what the run has accumulated. Showing them side by
    // side would halve both.
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

    // --- Network buttons ---------------------------------------------------------
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
