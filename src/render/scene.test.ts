import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Car } from '@core/car'
import type { RacingCar } from '@core/population'
import type { SimulationState } from '@core/simulation'
import type { CanvasLayer } from './canvas'

const renderMocks = vi.hoisted(() => ({
    drawCar: vi.fn(),
    drawSensors: vi.fn(),
}))

vi.mock('./car', () => renderMocks)
vi.mock('./camera', () => ({ cameraTranslation: () => ({ x: 0, y: 0 }) }))
vi.mock('./world', () => ({ drawGround: vi.fn(), drawRoad: vi.fn() }))

import { drawScene, drawVictory } from './scene'

const { drawCar, drawSensors } = renderMocks

const trafficCar: Car = { position: { x: 0, y: 100 } } as Car
const activeCar: RacingCar = {
    car: { position: { x: 0, y: 200 } } as Car,
    sensorState: {},
} as RacingCar

const layer: CanvasLayer = {
    context: {
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
    } as unknown as CanvasRenderingContext2D,
    width: 800,
    height: 600,
    clear: vi.fn(),
} as unknown as CanvasLayer

const state: SimulationState = {
    traffic: [trafficCar],
    cars: [activeCar],
    activeCar,
    champion: undefined,
    courseCleared: false,
    gameOver: false,
    bestCar: undefined,
    manualDriving: false,
} as unknown as SimulationState

describe('drawScene traffic visibility', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('draws traffic by default', () => {
        drawScene(layer, state)

        expect(drawCar).toHaveBeenCalledWith(layer.context, trafficCar)
        expect(drawCar.mock.calls.at(-1)?.[1]).toBe(trafficCar)
    })

    it('hides only traffic while continuing to draw active-car sensors', () => {
        drawScene(layer, state, { trafficVisible: false })

        expect(drawCar).not.toHaveBeenCalledWith(layer.context, trafficCar)
        expect(drawCar).toHaveBeenCalledWith(layer.context, activeCar.car, {
            ghost: false,
            winner: undefined,
        })
        expect(drawSensors).toHaveBeenCalledWith(layer.context, activeCar.sensorState)
    })

    it('hides only the radar while continuing to draw traffic and racing cars', () => {
        drawScene(layer, state, { radarVisible: false })

        expect(drawSensors).not.toHaveBeenCalled()
        expect(drawCar).toHaveBeenCalledWith(layer.context, activeCar.car, {
            ghost: false,
            winner: undefined,
        })
        expect(drawCar).toHaveBeenCalledWith(layer.context, trafficCar)
    })
})

describe('drawVictory', () => {
    it('draws animated firework trails behind the victory text', () => {
        const victoryContext = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            strokeText: vi.fn(),
            fillText: vi.fn(),
        } as unknown as CanvasRenderingContext2D
        const victoryLayer: CanvasLayer = {
            context: victoryContext,
            width: 800,
            height: 600,
        } as CanvasLayer
        const victoryState: SimulationState = {
            ...state,
            courseCleared: true,
            victorySeconds: 0.8,
        }

        drawVictory(victoryLayer, victoryState)

        expect(victoryContext.beginPath).toHaveBeenCalled()
        expect(victoryContext.lineTo).toHaveBeenCalled()
        expect(victoryContext.stroke).toHaveBeenCalled()
        expect(victoryContext.fillText).toHaveBeenCalledWith('VICTORY!', 400, 260)
    })
})

describe('drawScene racing-car paint order', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    const racingCar = (x: number): RacingCar =>
        ({
            car: {
                position: { x, y: 200 },
                spec: { size: { width: 40, height: 70 } },
            } as Car,
            network: {},
            sensorState: {},
            winner: false,
        }) as RacingCar

    it('draws random cars, champion, current winner and manual player in that exact order', () => {
        const random = racingCar(-120)
        const champion = racingCar(-40)
        const winner = racingCar(40)
        const player = racingCar(120)
        winner.winner = true

        const orderedState: SimulationState = {
            ...state,
            cars: [player, winner, champion, random],
            activeCar: winner,
            bestCar: winner,
            playerCar: player,
            champion: champion.network,
            manualDriving: true,
        }

        drawScene(layer, orderedState, { trafficVisible: false })

        expect(drawCar.mock.calls.map(([_, car]) => car)).toEqual([
            random.car,
            champion.car,
            winner.car,
            player.car,
        ])
    })

    it('draws traffic obstacles after the player and every other racing car', () => {
        const random = racingCar(-120)
        const champion = racingCar(-40)
        const winner = racingCar(40)
        const player = racingCar(120)
        const orderedState: SimulationState = {
            ...state,
            cars: [random, champion, winner, player],
            activeCar: winner,
            bestCar: winner,
            playerCar: player,
            champion: champion.network,
            manualDriving: true,
        }

        drawScene(layer, orderedState)

        expect(drawCar.mock.calls.map(([_, car]) => car)).toEqual([
            random.car,
            champion.car,
            winner.car,
            player.car,
            trafficCar,
        ])
    })

    it('draws a car only once at its highest-priority layer', () => {
        const championWinner = racingCar(0)
        const player = racingCar(80)
        championWinner.winner = true

        const deduplicatedState: SimulationState = {
            ...state,
            cars: [player, championWinner],
            activeCar: championWinner,
            bestCar: championWinner,
            playerCar: player,
            champion: championWinner.network,
            manualDriving: true,
        }

        drawScene(layer, deduplicatedState, { trafficVisible: false })

        expect(drawCar.mock.calls.map(([_, car]) => car)).toEqual([championWinner.car, player.car])
    })

    it('uses no display offset when highlighted cars share the starting point', () => {
        const champion = racingCar(0)
        const winner = racingCar(0)
        const player = racingCar(0)
        const overlappingState: SimulationState = {
            ...state,
            cars: [champion, winner, player],
            activeCar: winner,
            bestCar: winner,
            playerCar: player,
            champion: champion.network,
            manualDriving: true,
        }

        drawScene(layer, overlappingState, { trafficVisible: false })

        const translateMock = layer.context.translate as ReturnType<typeof vi.fn>
        expect(translateMock.mock.calls).toEqual([[0, 0]])
        expect(drawSensors).toHaveBeenCalledWith(layer.context, winner.sensorState)
    })

    it('draws a network-driven player as an ordinary population car', () => {
        const random = racingCar(-40)
        const player = racingCar(40)
        const networkDrivenState: SimulationState = {
            ...state,
            cars: [random, player],
            activeCar: random,
            playerCar: player,
            manualDriving: false,
        }

        drawScene(layer, networkDrivenState, { trafficVisible: false })

        expect(drawCar).toHaveBeenNthCalledWith(1, layer.context, random.car, {
            ghost: false,
            winner: false,
        })
        expect(drawCar).toHaveBeenNthCalledWith(2, layer.context, player.car, {
            ghost: true,
            winner: false,
        })
    })
})
