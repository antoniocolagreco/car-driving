import { describe, expect, it } from 'vitest'
import { PENALTY, REWARD, SIMULATION } from './config'
import { vec } from './geometry'
import {
    computeFitness,
    createStats,
    hasMissedOvertakeDeadline,
    isStuck,
    recordCrash,
    recordOvertakeTimeout,
    recordTimeout,
    selectBest,
    selectParents,
    updateStats,
} from './fitness'
import type { CarStats, FitnessSample } from './fitness'

const START = vec(0, 10_000)

const sample = (y: number, overtakes = 0): FitnessSample => ({
    position: vec(0, y),
    overtakes,
})

const drive = (
    stats: CarStats,
    dt: number,
    steps: number,
    makeSample: (step: number) => FitnessSample,
): void => {
    for (let step = 0; step < steps; step++) {
        updateStats(stats, makeSample(step), dt)
    }
}

describe('sparse overtake fitness', () => {
    it('starts at zero', () => {
        const stats: CarStats = createStats(START)

        expect(stats.fitness).toBe(0)
        expect(stats.breakdown).toEqual({ overtakes: 0, crash: 0, total: 0 })
    })

    it('awards only the fixed reward for each overtake', () => {
        const stats: CarStats = createStats(START)
        stats.overtakes = 3

        expect(computeFitness(stats)).toEqual({
            overtakes: 3 * REWARD.overtake,
            crash: 0,
            total: 3 * REWARD.overtake,
        })
    })

    it('does not award movement or survival without an overtake', () => {
        const stats: CarStats = createStats(START)

        drive(stats, 1, 5, (step: number) => sample(START.y - (step + 1) * 200))

        expect(stats.groundProgress).toBe(1_000)
        expect(stats.aliveSeconds).toBe(5)
        expect(stats.fitness).toBe(0)
    })

    it('keeps the maximum overtake count when a car falls behind again', () => {
        const stats: CarStats = createStats(START)

        updateStats(stats, sample(START.y - 100, 3), 1)
        updateStats(stats, sample(START.y - 50, 1), 1)

        expect(stats.overtakes).toBe(3)
        expect(stats.fitness).toBe(3 * REWARD.overtake)
    })
})

describe('the sole fitness penalty', () => {
    const earnedStats = (): CarStats => {
        const stats: CarStats = createStats(START)
        updateStats(stats, sample(START.y - 100, 2), 1)
        return stats
    }

    it('removes 50% after a minimum-speed collision', () => {
        const stats: CarStats = earnedStats()

        recordCrash(stats, 0)

        expect(stats.breakdown.crash).toBe(-stats.breakdown.overtakes * 0.5)
        expect(stats.fitness).toBe(stats.breakdown.overtakes * 0.5)
    })

    it('linearly increases the collision malus with impact speed', () => {
        const stats: CarStats = earnedStats()

        recordCrash(stats, 0.5)

        const expectedFraction: number =
            (PENALTY.crashAtMinimumSpeed + PENALTY.crashAtMaximumSpeed) / 2
        expect(stats.breakdown.crash).toBeCloseTo(-stats.breakdown.overtakes * expectedFraction)
        expect(stats.fitness).toBeCloseTo(stats.breakdown.overtakes * (1 - expectedFraction))
    })

    it('removes 90% after a maximum-speed collision', () => {
        const stats: CarStats = earnedStats()

        recordCrash(stats, 1)

        expect(stats.breakdown.crash).toBeCloseTo(
            -stats.breakdown.overtakes * PENALTY.crashAtMaximumSpeed,
        )
        expect(stats.fitness).toBeCloseTo(
            stats.breakdown.overtakes * (1 - PENALTY.crashAtMaximumSpeed),
        )
    })

    it('applies the maximum-speed malus to a timeout', () => {
        const stats: CarStats = earnedStats()

        recordTimeout(stats)

        expect(stats.timedOut).toBe(true)
        expect(stats.fitness).toBeCloseTo(
            stats.breakdown.overtakes * (1 - PENALTY.crashAtMaximumSpeed),
        )
    })

    it('never stacks a timeout and collision above the 90% maximum', () => {
        const stats: CarStats = earnedStats()

        recordCrash(stats, 0)
        recordTimeout(stats)

        expect(stats.fitness).toBeCloseTo(
            stats.breakdown.overtakes * (1 - PENALTY.crashAtMaximumSpeed),
        )
    })
})

describe('timeouts', () => {
    it('keeps the idle timeout independent from fitness', () => {
        const stats: CarStats = createStats(START)

        drive(stats, 1, SIMULATION.idleTimeoutSeconds, () => sample(START.y))

        expect(isStuck(stats)).toBe(true)
        expect(stats.fitness).toBe(0)
    })

    it('resets the idle timeout after enough ground progress', () => {
        const stats: CarStats = createStats(START)

        updateStats(stats, sample(START.y), 1)
        updateStats(stats, sample(START.y - SIMULATION.idleProgressThreshold), 1)

        expect(stats.idleSeconds).toBe(0)
        expect(isStuck(stats)).toBe(false)
    })

    it('expires the overtake timeout when no overtake arrives', () => {
        const stats: CarStats = createStats(START)

        drive(stats, 1, SIMULATION.overtakeTimeoutSeconds, (step: number) =>
            sample(START.y - (step + 1) * SIMULATION.idleProgressThreshold),
        )

        expect(hasMissedOvertakeDeadline(stats)).toBe(true)
        expect(stats.fitness).toBe(0)
    })

    it('resets the overtake timeout and timestamps a new overtake', () => {
        const stats: CarStats = createStats(START)

        updateStats(stats, sample(START.y - 100), 4)
        updateStats(stats, sample(START.y - 200, 1), 2)

        expect(stats.secondsSinceLastOvertake).toBe(0)
        expect(stats.lastOvertakeAtSeconds).toBe(6)
        expect(stats.fitness).toBe(REWARD.overtake)
    })

    it('marks an overtake timeout as ineligible and applies the maximum malus', () => {
        const stats: CarStats = createStats(START)
        updateStats(stats, sample(START.y - 100, 2), 1)

        recordOvertakeTimeout(stats)

        expect(stats.overtakeTimedOut).toBe(true)
        expect(stats.timedOut).toBe(true)
        expect(stats.fitness).toBeCloseTo(2 * REWARD.overtake * (1 - PENALTY.crashAtMaximumSpeed))
    })
})

describe('selection', () => {
    it('selects the car with more overtakes regardless of other runtime state', () => {
        const leader: { stats: CarStats } = { stats: createStats(START) }
        const follower: { stats: CarStats } = { stats: createStats(START) }
        leader.stats.overtakes = 3
        leader.stats.lastOvertakeAtSeconds = 9
        follower.stats.overtakes = 2
        follower.stats.lastOvertakeAtSeconds = 1
        follower.stats.groundProgress = 100_000
        follower.stats.aliveSeconds = 100

        expect(selectBest([follower, leader])).toBe(leader)
    })

    it('uses earlier overtake time only to break an equal-count tie', () => {
        const faster: { stats: CarStats } = { stats: createStats(START) }
        const slower: { stats: CarStats } = { stats: createStats(START) }
        faster.stats.overtakes = 4
        faster.stats.lastOvertakeAtSeconds = 8
        slower.stats.overtakes = 4
        slower.stats.lastOvertakeAtSeconds = 12

        expect(selectBest([slower, faster])).toBe(faster)
    })

    it('prefers the higher residual fitness when overtake counts are equal', () => {
        const gentle: { stats: CarStats } = { stats: createStats(START) }
        const severe: { stats: CarStats } = { stats: createStats(START) }
        updateStats(gentle.stats, sample(START.y - 100, 4), 10)
        updateStats(severe.stats, sample(START.y - 100, 4), 5)
        recordCrash(gentle.stats, 0)
        recordCrash(severe.stats, 1)

        expect(selectBest([severe, gentle])).toBe(gentle)
    })

    it('does not select a car that made zero overtakes', () => {
        const car: { stats: CarStats } = { stats: createStats(START) }
        car.stats.groundProgress = 100_000
        car.stats.aliveSeconds = 100

        expect(selectBest([car])).toBeUndefined()
    })

    it('excludes timed-out cars even when they have more overtakes', () => {
        const valid: { stats: CarStats } = { stats: createStats(START) }
        const timedOut: { stats: CarStats } = { stats: createStats(START) }
        valid.stats.overtakes = 1
        timedOut.stats.overtakes = 5
        timedOut.stats.overtakeTimedOut = true

        expect(selectBest([timedOut, valid])).toBe(valid)
    })

    it('uses the same sparse ordering for the parent pool', () => {
        const faster: { stats: CarStats } = { stats: createStats(START) }
        const slower: { stats: CarStats } = { stats: createStats(START) }
        const fewer: { stats: CarStats } = { stats: createStats(START) }
        const none: { stats: CarStats } = { stats: createStats(START) }
        faster.stats.overtakes = 3
        faster.stats.lastOvertakeAtSeconds = 5
        slower.stats.overtakes = 3
        slower.stats.lastOvertakeAtSeconds = 7
        fewer.stats.overtakes = 2
        fewer.stats.lastOvertakeAtSeconds = 2

        expect(selectParents([fewer, slower, none, faster], 4)).toEqual([faster, slower, fewer])
    })
})
