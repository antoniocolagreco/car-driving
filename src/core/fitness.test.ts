import { describe, expect, it } from 'vitest'
import { BRAKE_DISCOVERY_BONUS, SIMULATION } from './config'
import { vec } from './geometry'
import {
    createStats,
    hasMissedOvertakeDeadline,
    isStuck,
    raceScore,
    recordOvertakeTimeout,
    selectBest,
    selectParents,
    updateStats,
} from './fitness'
import type { CarStats, FitnessSample } from './fitness'

const START = vec(0, 10_000)

const sample = (y: number, overtakes = 0, brake = 0, speed = 10): FitnessSample => ({
    position: vec(0, y),
    overtakes,
    brake,
    speed,
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

        expect(stats.overtakes).toBe(0)
    })

    it('does not award movement or survival without an overtake', () => {
        const stats: CarStats = createStats(START)

        drive(stats, 1, 5, (step: number) => sample(START.y - (step + 1) * 200))

        expect(stats.groundProgress).toBe(1_000)
        expect(stats.aliveSeconds).toBe(5)
        expect(stats.overtakes).toBe(0)
    })

    it('keeps the maximum overtake count when a car falls behind again', () => {
        const stats: CarStats = createStats(START)

        updateStats(stats, sample(START.y - 100, 3), 1)
        updateStats(stats, sample(START.y - 50, 1), 1)

        expect(stats.overtakes).toBe(3)
    })
})

describe('timeouts', () => {
    it('keeps the idle timeout independent from fitness', () => {
        const stats: CarStats = createStats(START)

        drive(stats, 1, SIMULATION.idleTimeoutSeconds, () => sample(START.y))

        expect(isStuck(stats)).toBe(true)
        expect(stats.overtakes).toBe(0)
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
        expect(stats.overtakes).toBe(0)
    })

    it('resets the overtake timeout and timestamps a new overtake', () => {
        const stats: CarStats = createStats(START)

        updateStats(stats, sample(START.y - 100), 4)
        updateStats(stats, sample(START.y - 200, 1), 2)

        expect(stats.secondsSinceLastOvertake).toBe(0)
        expect(stats.lastOvertakeAtSeconds).toBe(6)
        expect(stats.overtakes).toBe(1)
    })

    it('marks an overtake timeout as ineligible without touching the score', () => {
        const stats: CarStats = createStats(START)
        updateStats(stats, sample(START.y - 100, 2), 1)

        recordOvertakeTimeout(stats)

        expect(stats.overtakeTimedOut).toBe(true)
        // Elimination, not a malus: the two overtakes it did make are still on the board,
        // they just cannot win or breed any more.
        expect(stats.overtakes).toBe(2)
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

    it('ignores everything except overtakes and the time they took', () => {
        const slowSurvivor: { stats: CarStats } = { stats: createStats(START) }
        const fastWreck: { stats: CarStats } = { stats: createStats(START) }
        updateStats(slowSurvivor.stats, sample(START.y - 100, 4), 10)
        updateStats(fastWreck.stats, sample(START.y - 100, 4), 5)
        slowSurvivor.stats.groundProgress = 100_000
        slowSurvivor.stats.aliveSeconds = 100

        // Same four overtakes. How the round ended, how far either drove and how long
        // either lasted are not part of the comparison: only who got there first is.
        expect(selectBest([slowSurvivor, fastWreck])).toBe(fastWreck)
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

    it('outranks a better driver that never braked, once, by the bonus', () => {
        const braked: { stats: CarStats } = { stats: createStats(START) }
        const dry: { stats: CarStats } = { stats: createStats(START) }
        braked.stats.overtakes = 1
        braked.stats.usedBrake = true
        dry.stats.overtakes = 9

        // 1 + 10 beats 9. That is the ignition working as intended for as long as the
        // brake is still a rarity in the field.
        expect(selectBest([dry, braked])).toBe(braked)
        expect(raceScore(braked.stats)).toBe(1 + BRAKE_DISCOVERY_BONUS)
    })

    it('stops deciding anything once both cars have braked', () => {
        const better: { stats: CarStats } = { stats: createStats(START) }
        const worse: { stats: CarStats } = { stats: createStats(START) }
        better.stats.overtakes = 9
        better.stats.usedBrake = true
        worse.stats.overtakes = 1
        worse.stats.usedBrake = true

        // The bonus is the same constant on both sides, so it cancels and the ranking is
        // back to being overtakes alone. This is why it is safe to make it large.
        expect(selectBest([worse, better])).toBe(better)
    })

    it('pays the bonus once, however long the brake is held', () => {
        const stats: CarStats = createStats(START)

        drive(stats, 1, 30, (step) => sample(START.y - 100 * step, 1, 1))

        expect(raceScore(stats)).toBe(1 + BRAKE_DISCOVERY_BONUS)
    })

    it('pays nothing to a car that braked but never passed anybody', () => {
        const stats: CarStats = createStats(START)

        drive(stats, 1, 30, (step) => sample(START.y - 100 * step, 0, 1))

        // Braking at the start line and creeping until the idle timeout is cheaper than
        // racing. Left ungated, the whole population found that within one generation
        // and stopped overtaking entirely.
        expect(stats.usedBrake).toBe(true)
        expect(raceScore(stats)).toBe(0)
    })

    it('does not pay for a brake pressed at a standstill', () => {
        const stats: CarStats = createStats(START)

        drive(stats, 1, 30, () => sample(START.y, 1, 1, 0))

        expect(stats.usedBrake).toBe(false)
        expect(raceScore(stats)).toBe(1)
    })

    it('never counts the bonus as a traffic car passed', () => {
        const stats: CarStats = createStats(START)

        updateStats(stats, sample(START.y - 100, 3, 1), 1)

        // `overtakes` still has to mean "cars actually passed": it is what decides a
        // cleared course and what the Champion record stores.
        expect(stats.overtakes).toBe(3)
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
