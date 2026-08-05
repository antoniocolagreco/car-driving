/**
 * Randomness used across the simulation. Traffic generation goes through
 * `createRandom` so a given seed always reproduces the same road layout, which
 * makes runs comparable across generations. Neural network initialization and
 * mutation use the unseeded helpers below, since genetic diversity there is
 * supposed to differ on every run.
 */

/** A seeded pseudo-random number generator. */
export type Random = {
    /** Next value in [0, 1). */
    next(): number
    /** Next integer in [min, max). */
    nextInt(min: number, max: number): number
    /** Returns a new array with the same items in random order; does not mutate `items`. */
    shuffle<T>(items: readonly T[]): T[]
}

/** Hashes a string down to a 32-bit non-negative integer, used to turn a text seed into a numeric one. */
const hashString = (value: string): number => {
    let hash = 0
    for (let i = 0; i < value.length; i++) {
        const char = value.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash // Force 32-bit integer overflow, like Java/C would do natively.
    }
    return Math.abs(hash)
}

/**
 * Creates a seeded random generator: the same seed (string or number) always
 * produces the same sequence of `next()`/`nextInt()`/`shuffle()` results.
 * Implemented as a linear congruential generator (LCG), which is fast and
 * good enough for traffic placement — no cryptographic properties needed.
 */
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

/** Uniform random value in [-1, 1), used to initialize and mutate network weights/biases. */
export const randomSymmetric = (): number => Math.random() * 2 - 1

/** Tailwind-derived color palette used to tell traffic cars apart at a glance. */
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

/** Picks a random color from `PALETTE`, used to give each traffic car a distinct body color. */
export const randomColor = (): string => {
    const values = Object.values(PALETTE)
    return values[Math.floor(Math.random() * values.length)]
}
