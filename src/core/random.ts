/** Seeded randomness for traffic; network initialization and mutation remain unseeded. */

export type Random = {
    /** Next value in [0, 1). */
    next(): number
    /** Next integer in [min, max). */
    nextInt(min: number, max: number): number
    /** Returns a shuffled copy. */
    shuffle<T>(items: readonly T[]): T[]
}

/** Hashes a text seed to 32 bits. */
const hashString = (value: string): number => {
    let hash = 0
    for (let i = 0; i < value.length; i++) {
        const char = value.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash // Force 32-bit integer overflow, like Java/C would do natively.
    }
    return Math.abs(hash)
}

/** Creates a deterministic linear congruential generator. */
export const createRandom = (seed: string | number): Random => {
    let state = typeof seed === 'string' ? hashString(seed) : seed

    const next = (): number => {
        state = (state * 1664525 + 1013904223) % 4294967296
        return state / 4294967296
    }

    const nextInt = (min: number, max: number): number => Math.floor(next() * (max - min)) + min

    const shuffle = <T>(items: readonly T[]): T[] => {
        const shuffled = [...items]
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = nextInt(0, i + 1)
            ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        return shuffled
    }

    return { next, nextInt, shuffle }
}

/** Uniform random value in `[-1, 1)`. */
export const randomSymmetric = (): number => Math.random() * 2 - 1

export const PALETTE = {
    red: '#dc2626',
    orange: '#ea580c',
    amber: '#d97706',
    yellow: '#ca8a04',
    lime: '#65a30d',
    green: '#16a34a',
    emerald: '#059669',
    teal: '#0d9488',
    cyan: '#0891b2',
    sky: '#0284c7',
    blue: '#2563eb',
    indingo: '#4f46e5',
    violet: '#7c3aed',
    purple: '#9333ea',
    fuchsia: '#c026d3',
    pink: '#db2777',
    rose: '#e11d48',
} as const

/** Picks a color from `PALETTE`. */
export const randomColor = (): string => {
    const values = Object.values(PALETTE)
    return values[Math.floor(Math.random() * values.length)]
}
