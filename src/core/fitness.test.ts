import { describe, expect, it } from 'vitest'
import { DEFAULTS, SIMULATION } from './config'
import { vec } from './geometry'
import {
    createStats,
    eliminate,
    hasMissedOvertakeDeadline,
    isStuck,
    raceScore,
    selectBest,
    selectParents,
    updateStats,
} from './fitness'
import type { CarStats, FitnessSample, RankingRules } from './fitness'

const START = vec(0, 10_000)

/** Default fixture count keeps comparisons below the finish line. */
const rules = (trafficCount = 1_000, brakeBonus: number = DEFAULTS.brakeBonus): RankingRules => ({
    brakeBonus,
    trafficCount,
})

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

    it('takes the whole score from an eliminated car, and leaves the raw count alone', () => {
        const stats: CarStats = createStats(START)
        updateStats(stats, sample(START.y - 100, 2), 1)
        stats.usedBrake = true

        eliminate(stats)

        expect(stats.eliminated).toBe(true)
        expect(raceScore(stats, 10)).toBe(0)
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

        expect(selectBest([follower, leader], rules())).toBe(leader)
    })

    it('breaks a tie between two finishers on who got there first', () => {
        const faster: { stats: CarStats } = { stats: createStats(START) }
        const slower: { stats: CarStats } = { stats: createStats(START) }
        faster.stats.overtakes = 4
        faster.stats.lastOvertakeAtSeconds = 8
        slower.stats.overtakes = 4
        slower.stats.lastOvertakeAtSeconds = 12

        expect(selectBest([slower, faster], rules(4))).toBe(faster)
    })

    it('does not break a tie between two wrecks on who died sooner', () => {
        const early: { stats: CarStats } = { stats: createStats(START) }
        const late: { stats: CarStats } = { stats: createStats(START) }
        early.stats.overtakes = 4
        early.stats.lastOvertakeAtSeconds = 8
        late.stats.overtakes = 4
        late.stats.lastOvertakeAtSeconds = 12

        expect(selectBest([late, early], rules(40))).toBe(late)
        expect(selectBest([early, late], rules(40))).toBe(early)
    })

    it('puts a finisher above a wreck that tied it on points', () => {
        const finisher: { stats: CarStats } = { stats: createStats(START) }
        const braker: { stats: CarStats } = { stats: createStats(START) }
        finisher.stats.overtakes = 20
        finisher.stats.lastOvertakeAtSeconds = 40
        braker.stats.overtakes = 10
        braker.stats.usedBrake = true
        braker.stats.lastOvertakeAtSeconds = 5

        expect(raceScore(braker.stats)).toBe(raceScore(finisher.stats))
        expect(selectBest([braker, finisher], rules(20))).toBe(finisher)
    })

    it('ignores everything except overtakes', () => {
        const slowSurvivor: { stats: CarStats } = { stats: createStats(START) }
        const fastWreck: { stats: CarStats } = { stats: createStats(START) }
        updateStats(slowSurvivor.stats, sample(START.y - 100, 4), 10)
        updateStats(fastWreck.stats, sample(START.y - 100, 5), 5)
        slowSurvivor.stats.groundProgress = 100_000
        slowSurvivor.stats.aliveSeconds = 100

        expect(selectBest([slowSurvivor, fastWreck], rules())).toBe(fastWreck)
    })

    it('does not select a car that made zero overtakes', () => {
        const car: { stats: CarStats } = { stats: createStats(START) }
        car.stats.groundProgress = 100_000
        car.stats.aliveSeconds = 100

        expect(selectBest([car], rules())).toBeUndefined()
    })

    it('excludes timed-out cars even when they have more overtakes', () => {
        const valid: { stats: CarStats } = { stats: createStats(START) }
        const timedOut: { stats: CarStats } = { stats: createStats(START) }
        valid.stats.overtakes = 1
        timedOut.stats.overtakes = 5
        timedOut.stats.eliminated = true

        expect(selectBest([timedOut, valid], rules())).toBe(valid)
    })

    it('outranks a better driver that never braked, once, by the bonus', () => {
        const braked: { stats: CarStats } = { stats: createStats(START) }
        const dry: { stats: CarStats } = { stats: createStats(START) }
        braked.stats.overtakes = 1
        braked.stats.usedBrake = true
        dry.stats.overtakes = 9

        expect(selectBest([dry, braked], rules())).toBe(braked)
        expect(raceScore(braked.stats)).toBe(1 + DEFAULTS.brakeBonus)
    })

    it('ranks on overtakes alone when the bonus is turned off', () => {
        const braked: { stats: CarStats } = { stats: createStats(START) }
        const dry: { stats: CarStats } = { stats: createStats(START) }
        braked.stats.overtakes = 1
        braked.stats.usedBrake = true
        dry.stats.overtakes = 9

        expect(raceScore(braked.stats, 0)).toBe(1)
        expect(selectBest([dry, braked], rules(1_000, 0))).toBe(dry)
        expect(selectParents([dry, braked], 2, rules(1_000, 0))).toEqual([dry, braked])
    })

    it('turns the bonus into a tie-break between equal overtakes when it is worth 1', () => {
        const braked: { stats: CarStats } = { stats: createStats(START) }
        const dry: { stats: CarStats } = { stats: createStats(START) }
        braked.stats.overtakes = 9
        braked.stats.usedBrake = true
        dry.stats.overtakes = 9

        expect(selectBest([dry, braked], rules(1_000, 1))).toBe(braked)
        dry.stats.overtakes = 10
        expect(selectBest([dry, braked], rules(1_000, 1))).toBe(dry)
    })

    it('stops deciding anything once both cars have braked', () => {
        const better: { stats: CarStats } = { stats: createStats(START) }
        const worse: { stats: CarStats } = { stats: createStats(START) }
        better.stats.overtakes = 9
        better.stats.usedBrake = true
        worse.stats.overtakes = 1
        worse.stats.usedBrake = true

        expect(selectBest([worse, better], rules())).toBe(better)
    })

    it('pays the bonus once, however long the brake is held', () => {
        const stats: CarStats = createStats(START)

        drive(stats, 1, 30, (step) => sample(START.y - 100 * step, 1, 1))

        expect(raceScore(stats)).toBe(1 + DEFAULTS.brakeBonus)
    })

    it('pays nothing to a car that braked but never passed anybody', () => {
        const stats: CarStats = createStats(START)

        drive(stats, 1, 30, (step) => sample(START.y - 100 * step, 0, 1))

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

        expect(stats.overtakes).toBe(3)
    })

    it('uses the same sparse ordering for the parent pool', () => {
        const first: { stats: CarStats } = { stats: createStats(START) }
        const second: { stats: CarStats } = { stats: createStats(START) }
        const fewer: { stats: CarStats } = { stats: createStats(START) }
        const none: { stats: CarStats } = { stats: createStats(START) }
        first.stats.overtakes = 3
        first.stats.lastOvertakeAtSeconds = 7
        second.stats.overtakes = 3
        second.stats.lastOvertakeAtSeconds = 5
        fewer.stats.overtakes = 2
        fewer.stats.lastOvertakeAtSeconds = 2

        expect(selectParents([first, second, none, fewer], 4, rules())).toEqual([
            first,
            second,
            fewer,
        ])
    })
})
