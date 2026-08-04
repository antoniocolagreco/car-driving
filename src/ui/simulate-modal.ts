import { ELEMENT_IDS, findElement } from './dom'

/**
 * The modal shown while the simulation runs with no rendering at all.
 *
 * It is written to once per finished race, never per frame: the whole reason the mode
 * exists is that drawing is what costs the time, so this panel must not put any of it
 * back. `app.ts` owns the run itself and only reports results here.
 */

/** One finished race, as the modal shows it. */
export type RaceReport = {
    /** Race number within this run, starting at 1. */
    readonly index: number
    readonly overtakes: number
    /** Seconds of simulated race time, on the same clock the champion record uses. */
    readonly seconds: number
}

export type SimulateModal = {
    /** Opens the modal and clears the previous run's results. */
    open(): void
    /** Adds one finished race and updates the counters. */
    reportRace(report: RaceReport): void
    /** Closes the modal. Safe to call when it is already closed. */
    close(): void
}

/**
 * How many finished races stay in the list. A long run would otherwise grow one row per
 * race forever, and the rows nobody scrolls back to still cost layout on every insert.
 */
const MAX_VISIBLE_RACES = 60

/**
 * Wires the modal. `onStopRequested` fires once per opening: the run has to finish the
 * race it is in before the normal UI returns, so the button reports that it was heard
 * and then does nothing more.
 */
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

    // Esc fires `cancel` and would close the dialog on the spot, leaving the run going
    // behind a UI that is drawing nothing. Treat it as the Stop button instead.
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
        // `min-w-0` plus the truncation below is what keeps a long row from widening the
        // list and adding a horizontal scrollbar to a box that only scrolls vertically.
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
