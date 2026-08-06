import { ELEMENT_IDS, findElement } from './dom'

/** Headless-run modal, updated once per completed race. */

export type RaceReport = {
    readonly index: number
    readonly overtakes: number
    readonly seconds: number
}

export type SimulateModal = {
    open(): void
    reportRace(report: RaceReport): void
    close(): void
}

/** Bounds DOM work during long runs. */
const MAX_VISIBLE_RACES = 60

/** Wires a modal whose stop request takes effect after the current race. */
export const createSimulateModal = (
    onStopRequested: () => void,
    signal: AbortSignal,
): SimulateModal => {
    const dialog = findElement<HTMLDialogElement>(ELEMENT_IDS.simulate.dialog)
    const raceCount = findElement(ELEMENT_IDS.simulate.raceCount)
    const bestOvertakes = findElement(ELEMENT_IDS.simulate.bestOvertakes)
    const log = findElement<HTMLOListElement>(ELEMENT_IDS.simulate.log)
    const empty = findElement(ELEMENT_IDS.simulate.empty)
    const stopButton = findElement<HTMLButtonElement>(ELEMENT_IDS.buttons.simulateStop)

    let best = 0
    let stopped = false

    const requestStop = (): void => {
        if (stopped) {
            return
        }
        stopped = true
        if (stopButton) {
            stopButton.disabled = true
            stopButton.textContent = 'Finishing the current race'
        }
        onStopRequested()
    }

    stopButton?.addEventListener('click', requestStop, { signal })

    // Treat Esc as Stop so the headless run cannot continue behind a closed dialog.
    dialog?.addEventListener(
        'cancel',
        (event: Event) => {
            event.preventDefault()
            requestStop()
        },
        { signal },
    )

    const appendRow = (report: RaceReport): void => {
        if (!log) {
            return
        }
        const row = document.createElement('li')
        row.className = 'flex min-w-0 justify-between gap-2 px-1 py-0.5 odd:bg-white/5'

        const label = document.createElement('span')
        label.className = 'shrink-0 text-white/60'
        label.textContent = `Race ${report.index}`

        const result = document.createElement('span')
        result.className = 'truncate'
        result.textContent = `${report.overtakes} overtakes in ${report.seconds.toFixed(1)} s`

        row.append(label, result)
        log.prepend(row)

        while (log.childElementCount > MAX_VISIBLE_RACES) {
            log.lastElementChild?.remove()
        }
    }

    return {
        open(): void {
            best = 0
            stopped = false
            if (stopButton) {
                stopButton.disabled = false
                stopButton.textContent = 'Stop'
            }
            if (raceCount) {
                raceCount.textContent = '0'
            }
            if (bestOvertakes) {
                bestOvertakes.textContent = '0'
            }
            log?.replaceChildren()
            empty?.removeAttribute('hidden')
            dialog?.showModal()
        },

        reportRace(report: RaceReport): void {
            best = Math.max(best, report.overtakes)
            if (raceCount) {
                raceCount.textContent = String(report.index)
            }
            if (bestOvertakes) {
                bestOvertakes.textContent = String(best)
            }
            empty?.setAttribute('hidden', '')
            appendRow(report)
        },

        close(): void {
            dialog?.close()
        },
    }
}
