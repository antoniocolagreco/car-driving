import { describe, expect, it } from 'vitest'
import { vec } from './geometry'
import { DRIVING, PENALTY, RACING_CAR, REWARD, SIMULATION } from './config'
import {
    computeFitness,
    createStats,
    hasMissedOvertakeDeadline,
    isStuck,
    recordCrash,
    recordOvertakeTimeout,
    selectBest,
    selectParents,
    updateStats,
} from './fitness'
import type { CarStats, FitnessSample } from './fitness'

const START = vec(0, 10_000)

/**
 * A sample describing clear road ahead, driving forward at a steady speed.
 * `speedRatio` is the speed as a fraction of a racing car's top speed, clamped to the
 * [-1, 1] the real simulation can produce.
 */
const clearRoadSample = (speed: number, y: number): FitnessSample => ({
    position: vec(0, y),
    speed,
    speedRatio: Math.max(-1, Math.min(1, speed / RACING_CAR.maxSpeed)),
    pathDistance: Infinity,
    stoppingDistance: speed ** 2 / (2 * RACING_CAR.brakePower),
    overtakes: 0,
    trafficDrift: 0,
})

/** Drives `stats` forward by `steps` samples of `dt` seconds each, building one per step. */
const drive = (
    stats: CarStats,
    dt: number,
    steps: number,
    sample: (step: number) => FitnessSample,
): void => {
    for (let step = 0; step < steps; step++) {
        updateStats(stats, sample(step), dt)
    }
}

describe('createStats', () => {
    it('starts every counter at zero', () => {
        const stats = createStats(START)

        expect(stats.forwardProgress).toBe(0)
        expect(stats.overtakes).toBe(0)
        expect(stats.lastOvertakeAtSeconds).toBe(0)
        expect(stats.secondsSinceLastOvertake).toBe(0)
        expect(stats.overtakeTimedOut).toBe(false)
        expect(stats.aliveSeconds).toBe(0)
        expect(stats.idleSeconds).toBe(0)
        expect(stats.reverseDistance).toBe(0)
        expect(stats.stalledSeconds).toBe(0)
        expect(stats.paceScore).toBe(0)
        expect(stats.hazardScore).toBe(0)
        expect(stats.topSpeed).toBe(0)
        expect(stats.crashed).toBe(false)
    })

    it('records startY from the given start position', () => {
        const stats = createStats(vec(3, 12_345))

        expect(stats.startY).toBe(12_345)
    })

    it('caches a zero fitness for a fresh run', () => {
        const stats = createStats(START)

        expect(stats.fitness).toBe(0)
        expect(stats.breakdown.total).toBe(0)
    })
})

describe('updateStats: forwardProgress', () => {
    it('grows as the car moves forward (y decreases)', () => {
        const stats = createStats(START)

        updateStats(stats, clearRoadSample(5, START.y - 100), 1 / 60)

        expect(stats.forwardProgress).toBe(100)
    })

    it('is monotone: moving back after progressing does not reduce it', () => {
        const stats = createStats(START)

        updateStats(stats, clearRoadSample(5, START.y - 100), 1 / 60)
        updateStats(stats, clearRoadSample(-5, START.y - 40), 1 / 60)

        expect(stats.forwardProgress).toBe(100)
    })

    it('is monotone: driving back and forth does not inflate it beyond the furthest point reached', () => {
        const stats = createStats(START)

        updateStats(stats, clearRoadSample(5, START.y - 100), 1 / 60)
        updateStats(stats, clearRoadSample(-5, START.y - 50), 1 / 60)
        updateStats(stats, clearRoadSample(5, START.y - 90), 1 / 60)
        updateStats(stats, clearRoadSample(-5, START.y - 20), 1 / 60)

        expect(stats.forwardProgress).toBe(100)
    })
})

describe('updateStats: overtakes', () => {
    it('tracks the max overtake count seen so far', () => {
        const stats = createStats(START)

        updateStats(stats, { ...clearRoadSample(5, START.y - 10), overtakes: 2 }, 1 / 60)

        expect(stats.overtakes).toBe(2)
    })

    it('does not drop when a later sample reports fewer cars behind', () => {
        const stats = createStats(START)

        updateStats(stats, { ...clearRoadSample(5, START.y - 10), overtakes: 3 }, 1 / 60)
        updateStats(stats, { ...clearRoadSample(5, START.y - 20), overtakes: 1 }, 1 / 60)

        expect(stats.overtakes).toBe(3)
    })

    it('counts time from the start and resets the deadline after every new overtake', () => {
        const stats = createStats(START)

        updateStats(stats, clearRoadSample(5, START.y - 10), 9)
        expect(stats.secondsSinceLastOvertake).toBe(9)

        updateStats(stats, { ...clearRoadSample(5, START.y - 20), overtakes: 1 }, 1)
        expect(stats.secondsSinceLastOvertake).toBe(0)

        updateStats(stats, clearRoadSample(5, START.y - 30), 4)
        expect(stats.secondsSinceLastOvertake).toBe(4)
    })

    it('records when a new overtake maximum was reached without changing it otherwise', () => {
        const stats = createStats(START)

        updateStats(stats, clearRoadSample(5, START.y - 10), 5)
        expect(stats.lastOvertakeAtSeconds).toBe(0)

        updateStats(stats, { ...clearRoadSample(5, START.y - 20), overtakes: 2 }, 2)
        expect(stats.lastOvertakeAtSeconds).toBe(7)

        updateStats(stats, { ...clearRoadSample(5, START.y - 30), overtakes: 1 }, 3)
        updateStats(stats, { ...clearRoadSample(5, START.y - 40), overtakes: 2 }, 4)
        expect(stats.lastOvertakeAtSeconds).toBe(7)

        updateStats(stats, { ...clearRoadSample(5, START.y - 50), overtakes: 3 }, 1)
        expect(stats.lastOvertakeAtSeconds).toBe(15)
    })
})

describe('updateStats: aliveSeconds', () => {
    it('accumulates dt on every call', () => {
        const stats = createStats(START)

        drive(stats, 0.5, 4, (step) => clearRoadSample(1, START.y - step))

        expect(stats.aliveSeconds).toBeCloseTo(2)
    })
})

describe('updateStats: topSpeed', () => {
    it('tracks the highest speed seen', () => {
        const stats = createStats(START)

        updateStats(stats, clearRoadSample(3, START.y - 3), 1 / 60)
        updateStats(stats, clearRoadSample(9, START.y - 12), 1 / 60)
        updateStats(stats, clearRoadSample(2, START.y - 14), 1 / 60)

        expect(stats.topSpeed).toBe(9)
    })
})

describe('updateStats: reverseDistance', () => {
    it('accumulates only while speed is negative', () => {
        const stats = createStats(START)

        updateStats(stats, clearRoadSample(-2, START.y + 2), 1 / 60)

        expect(stats.reverseDistance).toBeCloseTo(2 * (1 / 60) * 60)
    })

    it('does not accumulate while driving forward', () => {
        const stats = createStats(START)

        updateStats(stats, clearRoadSample(5, START.y - 5), 1 / 60)

        expect(stats.reverseDistance).toBe(0)
    })
})

describe('updateStats: stalledSeconds', () => {
    it('accumulates when speed is below stallSpeed and nothing is ahead', () => {
        const stats = createStats(START)
        const sample: FitnessSample = {
            position: START,
            speed: DRIVING.stallSpeed / 2,
            speedRatio: 0.5,
            stoppingDistance: 0,
            pathDistance: Infinity,
            overtakes: 0,
            trafficDrift: 0,
        }

        updateStats(stats, sample, 1)

        expect(stats.stalledSeconds).toBe(1)
    })

    it('does not accumulate when an obstacle is within reaction distance', () => {
        const stats = createStats(START)
        const sample: FitnessSample = {
            position: START,
            speed: DRIVING.stallSpeed / 2,
            speedRatio: 0.5,
            stoppingDistance: 0,
            pathDistance: DRIVING.reactionDistance / 2,
            overtakes: 0,
            trafficDrift: 0,
        }

        updateStats(stats, sample, 1)

        expect(stats.stalledSeconds).toBe(0)
    })

    it('does not accumulate when the car is moving faster than stallSpeed', () => {
        const stats = createStats(START)
        const sample: FitnessSample = {
            position: START,
            speed: DRIVING.stallSpeed * 2,
            speedRatio: 0.5,
            stoppingDistance: 0,
            pathDistance: Infinity,
            overtakes: 0,
            trafficDrift: 0,
        }

        updateStats(stats, sample, 1)

        expect(stats.stalledSeconds).toBe(0)
    })
})

describe('updateStats: pace and hazard', () => {
    it('pays pace only while the road ahead is clear', () => {
        const stats = createStats(START)

        updateStats(stats, { ...clearRoadSample(5, START.y - 5), speedRatio: 0.5 }, 1)

        expect(stats.paceScore).toBeCloseTo(0.5)
        expect(stats.hazardScore).toBe(0)
    })

    it('pays no pace when an obstacle sits inside the reaction distance', () => {
        const stats = createStats(START)

        updateStats(
            stats,
            {
                ...clearRoadSample(5, START.y - 5),
                speedRatio: 0.5,
                pathDistance: DRIVING.reactionDistance / 2,
            },
            1,
        )

        expect(stats.paceScore).toBe(0)
    })

    it('charges unsafe speed for the available path, graded by closeness', () => {
        const stats = createStats(START)

        updateStats(
            stats,
            {
                ...clearRoadSample(8, START.y - 8),
                pathDistance: 50,
                stoppingDistance: 200,
            },
            1,
        )

        const speedRatio = 8 / RACING_CAR.maxSpeed
        const zone = 200 * DRIVING.hazardFactor + DRIVING.hazardMargin * Math.max(0, speedRatio)
        expect(stats.hazardScore).toBeCloseTo(1 - 50 / zone)
    })

    it('reduces the hazard as braking lowers speed and stopping distance', () => {
        const unsafeStats: CarStats = createStats(START)
        const slowedStats: CarStats = createStats(START)

        updateStats(
            unsafeStats,
            {
                ...clearRoadSample(8, START.y - 8),
                pathDistance: 50,
                stoppingDistance: 200,
            },
            1,
        )
        updateStats(
            slowedStats,
            {
                ...clearRoadSample(2, START.y - 2),
                pathDistance: 50,
                stoppingDistance: 0,
            },
            1,
        )

        expect(unsafeStats.hazardScore).toBeGreaterThan(0)
        expect(slowedStats.hazardScore).toBe(0)
    })

    it('clears the hazard only after steering actually opens the path', () => {
        const stats = createStats(START)

        updateStats(
            stats,
            {
                ...clearRoadSample(8, START.y - 8),
                pathDistance: Infinity,
                stoppingDistance: 200,
            },
            1,
        )

        expect(stats.hazardScore).toBe(0)
    })

    it('charges nothing once the obstacle is beyond the hazard zone', () => {
        const stats = createStats(START)
        const stoppingDistance = 200
        const speedRatio = 8 / RACING_CAR.maxSpeed
        const beyondTheZone =
            stoppingDistance * DRIVING.hazardFactor + DRIVING.hazardMargin * speedRatio + 1

        updateStats(
            stats,
            {
                ...clearRoadSample(8, START.y - 8),
                pathDistance: beyondTheZone,
                stoppingDistance,
            },
            1,
        )

        expect(stats.hazardScore).toBe(0)
    })

    it('charges no hazard when the car is stopped, even close to an obstacle', () => {
        const stats: CarStats = createStats(START)

        updateStats(stats, { ...clearRoadSample(0, START.y), pathDistance: 1 }, 1)

        expect(stats.hazardScore).toBe(0)
    })
})

describe('updateStats: idleSeconds', () => {
    it('accumulates dt while forward progress does not grow', () => {
        const stats = createStats(START)

        updateStats(stats, clearRoadSample(0, START.y), 1)
        updateStats(stats, clearRoadSample(0, START.y), 1)

        expect(stats.idleSeconds).toBe(2)
    })

    it('resets to zero once progress grows by at least idleProgressThreshold', () => {
        const stats = createStats(START)

        updateStats(stats, clearRoadSample(0, START.y), 1)
        expect(stats.idleSeconds).toBe(1)

        updateStats(stats, clearRoadSample(10, START.y - SIMULATION.idleProgressThreshold), 1)

        expect(stats.idleSeconds).toBe(0)
    })

    it('keeps accumulating past the threshold while progress does not renew it', () => {
        const stats = createStats(START)

        updateStats(stats, clearRoadSample(10, START.y - SIMULATION.idleProgressThreshold), 1)
        updateStats(stats, clearRoadSample(0, START.y - SIMULATION.idleProgressThreshold), 1)
        updateStats(stats, clearRoadSample(0, START.y - SIMULATION.idleProgressThreshold), 1)

        expect(stats.idleSeconds).toBe(2)
    })
})

describe('isStuck', () => {
    it('is false for a freshly created run', () => {
        const stats = createStats(START)

        expect(isStuck(stats)).toBe(false)
    })

    it('stays false while progress keeps arriving', () => {
        const stats = createStats(START)

        drive(stats, 1, SIMULATION.idleTimeoutSeconds + 5, (step) =>
            clearRoadSample(10, START.y - step * SIMULATION.idleProgressThreshold),
        )

        expect(isStuck(stats)).toBe(false)
    })

    /**
     * The regression this file exists to prevent. A car creeping forward — below
     * `DRIVING.stallSpeed`, bleeding stall penalties, going nowhere — used to renew
     * the idle timer forever, because the timer only asked for *some* progress
     * rather than for a minimum average speed. Cars like that never died and the
     * generation never ended.
     */
    it('is true for a car creeping forward far slower than the threshold demands', () => {
        const stats = createStats(START)
        const creepPerStep = DRIVING.stallSpeed / 2

        // One step past the timeout: summing 1/60 exactly `60 * timeout` times
        // lands a rounding error short of it.
        drive(stats, SIMULATION.stepSeconds, 60 * SIMULATION.idleTimeoutSeconds + 1, (step) =>
            clearRoadSample(creepPerStep, START.y - step * creepPerStep),
        )

        expect(isStuck(stats)).toBe(true)
    })

    it('becomes true exactly after idleTimeoutSeconds of no progress', () => {
        const stats = createStats(START)

        drive(stats, 1, SIMULATION.idleTimeoutSeconds - 1, () => clearRoadSample(0, START.y))
        expect(isStuck(stats)).toBe(false)

        updateStats(stats, clearRoadSample(0, START.y), 1)
        expect(isStuck(stats)).toBe(true)
    })
})

describe('overtake deadline', () => {
    it('expires after the configured overtake timeout without a new overtake', () => {
        const stats = createStats(START)

        drive(stats, 1, SIMULATION.overtakeTimeoutSeconds, (step) =>
            clearRoadSample(5, START.y - (step + 1) * 100),
        )

        expect(hasMissedOvertakeDeadline(stats)).toBe(true)
    })

    it('keeps earned points as telemetry while marking a timed-out car ineligible', () => {
        const stats = createStats(START)
        updateStats(stats, clearRoadSample(5, START.y - 500), 1)
        const fitnessBeforeTimeout = stats.fitness

        recordOvertakeTimeout(stats)

        expect(stats.overtakeTimedOut).toBe(true)
        expect(stats.fitness).toBe(fitnessBeforeTimeout)
    })
})

describe('recordCrash', () => {
    it('sets crashed to true and records the impact speed', () => {
        const stats = createStats(START)

        recordCrash(stats, 0.6)

        expect(stats.crashed).toBe(true)
        expect(stats.impactSpeedRatio).toBeCloseTo(0.6)
    })

    it('charges the full-speed fraction for a flat-out impact', () => {
        const stats = createStats(START)
        updateStats(stats, clearRoadSample(5, START.y - 1000), 1 / 60)
        const fitnessBeforeCrash = stats.fitness

        recordCrash(stats, 1)

        expect(stats.fitness).toBeCloseTo(fitnessBeforeCrash * (1 - PENALTY.crashAtFullSpeed))
        expect(stats.fitness).toBe(0)
    })

    // The slope that makes braking worth discovering: shedding speed before an
    // unavoidable impact always leaves the car better off.
    it('charges less the slower the car was going when it hit', () => {
        const fitnessAfter = (impactSpeedRatio: number): number => {
            const stats = createStats(START)
            updateStats(stats, clearRoadSample(5, START.y - 1000), 1 / 60)
            recordCrash(stats, impactSpeedRatio)
            return stats.fitness
        }

        expect(fitnessAfter(0.2)).toBeGreaterThan(fitnessAfter(0.6))
        expect(fitnessAfter(0.6)).toBeGreaterThan(fitnessAfter(1))
    })
})

describe('computeFitness', () => {
    it('rewards each overtake at REWARD.overtake', () => {
        const stats = createStats(START)
        stats.overtakes = 3

        const breakdown = computeFitness(stats)

        expect(breakdown.overtakes).toBeCloseTo(3 * REWARD.overtake)
    })

    it('rewards forward progress at REWARD.forwardProgress per pixel', () => {
        const stats = createStats(START)
        stats.forwardProgress = 5000

        const breakdown = computeFitness(stats)

        expect(breakdown.progress).toBeCloseTo(5000 * REWARD.forwardProgress)
    })

    it('rewards survival at REWARD.survival per second', () => {
        const stats = createStats(START)
        stats.aliveSeconds = 10

        const breakdown = computeFitness(stats)

        expect(breakdown.survival).toBeCloseTo(10 * REWARD.survival)
    })

    it('rewards accumulated pace at REWARD.pace', () => {
        const stats = createStats(START)
        stats.paceScore = 4

        const breakdown = computeFitness(stats)

        expect(breakdown.pace).toBeCloseTo(4 * REWARD.pace)
    })

    // Proportional, not flat: it takes a share of what the run earned, so it can never
    // turn an achievement into a debt. See `PENALTY.crashAtRest` / `crashAtFullSpeed`.
    it('charges the crash as a fraction of what the run earned', () => {
        const stats = createStats(START)
        stats.overtakes = 2
        stats.forwardProgress = 1000
        stats.crashed = true
        stats.impactSpeedRatio = 1

        const breakdown = computeFitness(stats)
        const earned =
            breakdown.overtakes + breakdown.progress + breakdown.pace + breakdown.survival

        expect(breakdown.crash).toBeCloseTo(-earned * PENALTY.crashAtFullSpeed)
        expect(breakdown.total).toBe(0)
    })

    it('preserves part of an overtake after a low-speed crash', () => {
        const survived = createStats(START)
        survived.overtakes = 1

        const crashed = createStats(START)
        crashed.overtakes = 1
        crashed.crashed = true

        const nobody = createStats(START)
        nobody.crashed = true

        expect(computeFitness(crashed).total).toBeLessThan(computeFitness(survived).total)
        expect(computeFitness(crashed).total).toBeGreaterThan(computeFitness(nobody).total)
    })

    it('applies no crash penalty when the run did not crash', () => {
        const stats = createStats(START)

        const breakdown = computeFitness(stats)

        expect(breakdown.crash).toBe(0)
    })

    it('penalizes stalled seconds at PENALTY.stall, stored negative', () => {
        const stats = createStats(START)
        stats.stalledSeconds = 4

        const breakdown = computeFitness(stats)

        expect(breakdown.stall).toBeCloseTo(-4 * PENALTY.stall)
    })

    it('penalizes an ignored hazard at PENALTY.hazard, stored negative', () => {
        const stats = createStats(START)
        stats.hazardScore = 4

        const breakdown = computeFitness(stats)

        expect(breakdown.hazard).toBeCloseTo(-4 * PENALTY.hazard)
    })

    it('penalizes reverse distance at PENALTY.reverse per pixel, stored negative', () => {
        const stats = createStats(START)
        stats.reverseDistance = 200

        const breakdown = computeFitness(stats)

        expect(breakdown.reverse).toBeCloseTo(-200 * PENALTY.reverse)
    })

    it('sums every term into total', () => {
        const stats = createStats(START)
        stats.overtakes = 1
        stats.forwardProgress = 1000
        stats.aliveSeconds = 5
        stats.stalledSeconds = 1
        stats.hazardScore = 1
        stats.reverseDistance = 10
        stats.crashed = true

        const breakdown = computeFitness(stats)
        const manualSum =
            breakdown.overtakes +
            breakdown.progress +
            breakdown.pace +
            breakdown.survival +
            breakdown.crash +
            breakdown.stall +
            breakdown.hazard +
            breakdown.reverse

        // Floored at zero, so the comparison is against the sum only when it is positive.
        expect(breakdown.total).toBeCloseTo(Math.max(0, manualSum))
    })

    // A score is what a car earned, and nothing earned is zero, not a debt. The raw
    // terms stay signed so the HUD can still show WHY a car ended up on nothing.
    it('floors the total at zero while keeping the terms signed', () => {
        const stats = createStats(START)
        stats.stalledSeconds = 100

        const breakdown = computeFitness(stats)

        expect(breakdown.stall).toBeLessThan(0)
        expect(breakdown.total).toBe(0)
    })
})

describe('selectBest', () => {
    it('returns undefined for an empty array', () => {
        expect(selectBest([])).toBeUndefined()
    })

    it('uses fitness to break a complete race-result tie', () => {
        const low = { stats: createStats(START) }
        const high = { stats: createStats(START) }
        low.stats.forwardProgress = 100
        high.stats.forwardProgress = 100
        low.stats.fitness = 10
        high.stats.fitness = 50

        expect(selectBest([low, high])).toBe(high)
    })

    it('ranks more overtakes above higher fitness', () => {
        const tenOvertakes: { stats: CarStats } = { stats: createStats(START) }
        const nineOvertakes: { stats: CarStats } = { stats: createStats(START) }
        tenOvertakes.stats.overtakes = 10
        tenOvertakes.stats.lastOvertakeAtSeconds = 20
        tenOvertakes.stats.fitness = 10
        tenOvertakes.stats.crashed = true
        nineOvertakes.stats.overtakes = 9
        nineOvertakes.stats.lastOvertakeAtSeconds = 30
        nineOvertakes.stats.fitness = 1_000

        expect(selectBest([nineOvertakes, tenOvertakes])).toBe(tenOvertakes)
    })

    it('ranks an equal overtake total by fitness before overtake time', () => {
        const faster: { stats: CarStats } = { stats: createStats(START) }
        const slower: { stats: CarStats } = { stats: createStats(START) }
        faster.stats.overtakes = 10
        faster.stats.lastOvertakeAtSeconds = 20
        faster.stats.fitness = 10
        slower.stats.overtakes = 10
        slower.stats.lastOvertakeAtSeconds = 30
        slower.stats.fitness = 1_000

        expect(selectBest([slower, faster])).toBe(slower)
    })

    it('uses progress only after equal overtakes and equal fitness', () => {
        const survivor: { stats: CarStats } = { stats: createStats(START) }
        const crashed: { stats: CarStats } = { stats: createStats(START) }
        survivor.stats.overtakes = 10
        survivor.stats.forwardProgress = 200
        survivor.stats.lastOvertakeAtSeconds = 30
        survivor.stats.fitness = 100
        crashed.stats.overtakes = 10
        crashed.stats.forwardProgress = 100
        crashed.stats.lastOvertakeAtSeconds = 20
        crashed.stats.fitness = 100
        crashed.stats.crashed = true

        expect(selectBest([crashed, survivor])).toBe(survivor)
    })

    it('ranks fitness above progress when neither car overtook traffic', () => {
        const earlyWreck: { stats: CarStats } = { stats: createStats(START) }
        const laterWreck: { stats: CarStats } = { stats: createStats(START) }
        earlyWreck.stats.forwardProgress = 20
        earlyWreck.stats.fitness = 100
        earlyWreck.stats.crashed = true
        laterWreck.stats.forwardProgress = 200
        laterWreck.stats.fitness = 0
        laterWreck.stats.crashed = true

        expect(selectBest([earlyWreck, laterWreck])).toBe(earlyWreck)
    })

    it('does not filter out a car that never braked or turned', () => {
        // Nothing in FitnessSample even records braking/turning history, but this
        // documents the intent explicitly: forward progress alone is a valid result.
        const onlyCar = { stats: createStats(START) }
        onlyCar.stats.forwardProgress = 1
        onlyCar.stats.fitness = 1

        expect(selectBest([onlyCar])).toBe(onlyCar)
    })

    // A field where nobody moved has no winner, and the simulation keeps its previous
    // champion rather than crowning an arbitrary stationary wreck.
    it('returns undefined when nobody moved forward', () => {
        const wreck = { stats: createStats(START) }
        const otherWreck = { stats: createStats(START) }

        expect(selectBest([wreck, otherWreck])).toBeUndefined()
    })

    it('ignores cars without a race result when someone moved forward', () => {
        const wreck = { stats: createStats(START) }
        const scorer = { stats: createStats(START) }
        scorer.stats.forwardProgress = 1
        scorer.stats.fitness = 12

        expect(selectBest([wreck, scorer])).toBe(scorer)
    })

    it('excludes an overtake-timeout result even when it travelled further', () => {
        const valid = { stats: createStats(START) }
        const timedOut = { stats: createStats(START) }
        valid.stats.forwardProgress = 100
        valid.stats.fitness = 1
        timedOut.stats.forwardProgress = 1_000
        timedOut.stats.overtakes = 5
        timedOut.stats.overtakeTimedOut = true

        expect(selectBest([timedOut, valid])).toBe(valid)
    })
})

describe('selectParents', () => {
    it('uses the same overtake, fitness, progress and time ordering as selectBest', () => {
        const fasterTen: { stats: CarStats } = { stats: createStats(START) }
        const slowerTen: { stats: CarStats } = { stats: createStats(START) }
        const nineOvertakes: { stats: CarStats } = { stats: createStats(START) }
        const zeroFitness: { stats: CarStats } = { stats: createStats(START) }
        fasterTen.stats.overtakes = 10
        fasterTen.stats.lastOvertakeAtSeconds = 20
        fasterTen.stats.fitness = 10
        fasterTen.stats.crashed = true
        slowerTen.stats.overtakes = 10
        slowerTen.stats.lastOvertakeAtSeconds = 30
        slowerTen.stats.fitness = 1_000
        nineOvertakes.stats.overtakes = 9
        nineOvertakes.stats.lastOvertakeAtSeconds = 10
        nineOvertakes.stats.fitness = 10_000

        expect(selectParents([nineOvertakes, slowerTen, zeroFitness, fasterTen], 4)).toEqual([
            slowerTen,
            fasterTen,
            nineOvertakes,
        ])
    })
})

describe('design intent: distance and a slowed crash beats idling', () => {
    it('a car that covered 5000 px and slowed before impact beats an idler', () => {
        const dt = 1
        const seconds = 100
        const stepDistance = 5000 / seconds

        const driver = createStats(START)
        drive(driver, dt, seconds, (step) =>
            clearRoadSample(stepDistance, START.y - (step + 1) * stepDistance),
        )
        recordCrash(driver, 0.5)

        const idler = createStats(START)
        drive(idler, dt, seconds, () => clearRoadSample(0, START.y))

        expect(driver.fitness).toBeGreaterThan(idler.fitness)
    })
})

describe('design intent: overtaking beats matching distance without overtaking', () => {
    it('a car that overtook 3 cars beats a car that covered the same distance overtaking nobody', () => {
        const dt = 1
        const steps = 10
        const stepDistance = 100

        const overtaker = createStats(START)
        drive(overtaker, dt, steps, (step) => ({
            ...clearRoadSample(stepDistance, START.y - (step + 1) * stepDistance),
            overtakes: 3,
            trafficDrift: 0,
        }))

        const nonOvertaker = createStats(START)
        drive(nonOvertaker, dt, steps, (step) =>
            clearRoadSample(stepDistance, START.y - (step + 1) * stepDistance),
        )

        expect(overtaker.fitness).toBeGreaterThan(nonOvertaker.fitness)
    })
})

describe('design intent: riding the convoy earns nothing', () => {
    // Traffic rolls forward, so a car that tucks in behind it and holds position is
    // carried down the road for free. Progress is measured against the traffic, so
    // that ride is worth nothing however long it lasts — which is the whole reason
    // `forwardProgress` subtracts `trafficDrift`.
    it('scores a car that keeps pace with the traffic below one that gains on it', () => {
        const dt = 1
        const seconds = 10
        const trafficSpeed = 150

        const passenger = createStats(START)
        drive(passenger, dt, seconds, (step) => ({
            position: vec(0, START.y - (step + 1) * trafficSpeed),
            speed: trafficSpeed / 60,
            speedRatio: 0.5,
            stoppingDistance: 0,
            pathDistance: DRIVING.reactionDistance / 2,
            overtakes: 0,
            trafficDrift: (step + 1) * trafficSpeed,
        }))

        const overtaker = createStats(START)
        drive(overtaker, dt, seconds, (step) => ({
            position: vec(0, START.y - (step + 1) * trafficSpeed * 2),
            speed: (trafficSpeed * 2) / 60,
            speedRatio: 0.5,
            stoppingDistance: 0,
            pathDistance: Infinity,
            overtakes: 0,
            trafficDrift: (step + 1) * trafficSpeed,
        }))

        expect(passenger.forwardProgress).toBe(0)
        expect(overtaker.forwardProgress).toBeGreaterThan(0)
        expect(passenger.fitness).toBeLessThan(overtaker.fitness)
    })
})
