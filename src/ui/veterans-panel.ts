import { type Network, shortNetworkId } from '@core/neural-network'
import {
    bestScore,
    bestTime,
    completionRate,
    medianScore,
    raceCount,
    worstScore,
} from '@core/veterans'

/** Sortable archive table, rebuilt once per race. */

type ColumnKey = 'network' | 'races' | 'survival' | 'best' | 'worst' | 'median' | 'time'

type Column = {
    readonly key: ColumnKey
    readonly label: string
    readonly title: string
    /** `undefined` always sorts last. */
    readonly value: (network: Network) => number | string | undefined
    readonly text: (network: Network) => string
    readonly numeric: boolean
}

/** Empty text means the network has never finished. */
const formatSeconds = (seconds: number | undefined): string =>
    seconds === undefined ? '' : `${seconds.toFixed(1)}s`

const formatPercentage = (rate: number): string => `${(rate * 100).toFixed(2)}%`

const COLUMNS: readonly Column[] = [
    {
        key: 'network',
        label: 'Network',
        title: 'Network identifier, in the colour its car wears on the track',
        value: (network) => network.id,
        text: (network) => shortNetworkId(network.id),
        numeric: false,
    },
    {
        key: 'races',
        label: 'Races',
        title: 'Races this network has on record. The more there are, the more its median is worth',
        value: raceCount,
        text: (network) => String(raceCount(network)),
        numeric: true,
    },
    {
        key: 'survival',
        label: 'Survival',
        title: 'Share of its races it finished, passing every traffic car on the course. This is what the archive ranks on first',
        value: completionRate,
        text: (network) => formatPercentage(completionRate(network)),
        numeric: true,
    },
    {
        key: 'best',
        label: 'Best',
        title: 'Highest overtake count it has ever managed',
        value: bestScore,
        text: (network) => String(bestScore(network)),
        numeric: true,
    },
    {
        key: 'worst',
        label: 'Worst',
        title: 'Lowest overtake count on record',
        value: worstScore,
        text: (network) => String(worstScore(network)),
        numeric: true,
    },
    {
        key: 'median',
        label: 'Median',
        title: 'Middle result across every race. The archive ranks on this once survival rates are equal, which early on is always',
        value: medianScore,
        text: (network) => String(medianScore(network)),
        numeric: true,
    },
    {
        key: 'time',
        label: 'Best time',
        title: 'Fastest time it ever cleared a course in. Empty means it never has',
        value: bestTime,
        text: (network) => formatSeconds(bestTime(network)),
        numeric: true,
    },
]

export type VeteransPanel = {
    /** Repaints the standings. `racingIds` are the networks on the grid right now. */
    update(roster: readonly Network[], racingIds: ReadonlySet<string>): void
    setVisible(visible: boolean): void
    destroy(): void
}

type SortState = {
    key: ColumnKey
    ascending: boolean
}

/** Compares column values while keeping missing finish data last in both directions. */
export const compareValues = (
    left: number | string | undefined,
    right: number | string | undefined,
    ascending: boolean,
): number => {
    if (left === undefined || right === undefined) {
        return left === right ? 0 : left === undefined ? 1 : -1
    }
    if (typeof left === 'string' || typeof right === 'string') {
        return ascending
            ? String(left).localeCompare(String(right))
            : String(right).localeCompare(String(left))
    }
    return ascending ? left - right : right - left
}

const HEADER_CLASS =
    'sticky top-0 z-10 cursor-pointer bg-neutral-800 px-2 py-1 text-left font-semibold whitespace-nowrap select-none hover:bg-neutral-700'

export const createVeteransPanel = (container: HTMLElement, signal: AbortSignal): VeteransPanel => {
    const root = document.createElement('div')
    root.className =
        'absolute inset-0 min-h-0 flex-col overflow-hidden rounded-md bg-neutral-900 text-xs text-stone-50'
    // Match the canvas's inline visibility mechanism.
    root.style.display = 'none'

    const caption = document.createElement('p')
    caption.className = 'shrink-0 px-2 py-1 text-[11px] text-white/60'

    const scroller = document.createElement('div')
    scroller.className = 'min-h-0 grow overflow-auto'

    const table = document.createElement('table')
    table.className = 'w-full border-collapse tabular-nums'
    table.setAttribute('aria-label', 'Veterans standings')

    const head = document.createElement('thead')
    const headRow = document.createElement('tr')
    const body = document.createElement('tbody')

    // Stable sorting preserves archive order among equal completion rates.
    let sort: SortState = { key: 'survival', ascending: false }
    let lastRoster: readonly Network[] = []
    let lastRacingIds: ReadonlySet<string> = new Set()

    const headerCells = new Map<ColumnKey, HTMLTableCellElement>()

    const render = (): void => {
        for (const column of COLUMNS) {
            const cell = headerCells.get(column.key)
            if (!cell) {
                continue
            }
            const active = sort.key === column.key
            cell.setAttribute(
                'aria-sort',
                active ? (sort.ascending ? 'ascending' : 'descending') : 'none',
            )
            cell.textContent = active
                ? `${column.label} ${sort.ascending ? '▲' : '▼'}`
                : column.label
        }

        const column = COLUMNS.find((candidate) => candidate.key === sort.key) ?? COLUMNS[0]
        const ordered = [...lastRoster].sort((left, right) =>
            compareValues(column.value(left), column.value(right), sort.ascending),
        )

        body.replaceChildren()
        for (const [index, network] of ordered.entries()) {
            const row = document.createElement('tr')
            const racing = lastRacingIds.has(network.id)
            // Keep rank visible after column sorting; highlight current entrants.
            row.className = racing
                ? 'bg-emerald-900/50 ring-1 ring-emerald-500/40'
                : 'odd:bg-white/5'

            const rank = document.createElement('td')
            rank.className = 'px-2 py-0.5 text-white/40'
            rank.textContent = String(index + 1)
            row.appendChild(rank)

            for (const definition of COLUMNS) {
                const cell = document.createElement('td')
                cell.className = definition.numeric
                    ? 'px-2 py-0.5 text-right'
                    : 'px-2 py-0.5 whitespace-nowrap'
                if (definition.key === 'network') {
                    const swatch = document.createElement('span')
                    swatch.className = 'mr-1.5 inline-block size-2 rounded-full align-middle'
                    swatch.style.backgroundColor = network.color
                    cell.appendChild(swatch)
                    cell.appendChild(document.createTextNode(definition.text(network)))
                } else {
                    cell.textContent = definition.text(network)
                }
                row.appendChild(cell)
            }

            if (racing) {
                row.title = 'On the grid in the race running now'
            }
            body.appendChild(row)
        }

        // Count only archived networks among all ids currently on the grid.
        const racingCount: number = lastRoster.filter((network) =>
            lastRacingIds.has(network.id),
        ).length

        caption.textContent =
            lastRoster.length === 0
                ? 'No veterans yet. The best of each race are admitted to the archive as it runs.'
                : `${lastRoster.length} networks remembered, ${racingCount} of them racing now. Click a column to sort.`
    }

    const rankHeader = document.createElement('th')
    rankHeader.scope = 'col'
    rankHeader.className = 'sticky top-0 z-10 bg-neutral-800 px-2 py-1 text-left font-semibold'
    rankHeader.textContent = '#'
    headRow.appendChild(rankHeader)

    for (const column of COLUMNS) {
        const cell = document.createElement('th')
        cell.scope = 'col'
        cell.className = column.numeric ? `${HEADER_CLASS} text-right` : HEADER_CLASS
        cell.textContent = column.label
        cell.title = `${column.title}. Click to sort`
        cell.addEventListener(
            'click',
            () => {
                // New numeric columns start descending; re-clicking reverses direction.
                sort =
                    sort.key === column.key
                        ? { key: column.key, ascending: !sort.ascending }
                        : { key: column.key, ascending: !column.numeric }
                render()
            },
            { signal },
        )
        headerCells.set(column.key, cell)
        headRow.appendChild(cell)
    }

    head.appendChild(headRow)
    table.append(head, body)
    scroller.appendChild(table)
    root.append(caption, scroller)
    container.appendChild(root)
    render()

    return {
        update: (roster, racingIds) => {
            lastRoster = roster
            lastRacingIds = racingIds
            render()
        },
        setVisible: (visible) => {
            root.style.display = visible ? 'flex' : 'none'
        },
        destroy: () => {
            root.remove()
        },
    }
}
