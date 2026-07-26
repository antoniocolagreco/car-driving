import { describe, expect, it } from 'vitest'
import { SIMULATION } from '@core/config'
import type { CanvasLayer } from './canvas'
import { cameraTranslation } from './camera'

/** A `CanvasLayer` stub with just the fields `cameraTranslation` reads. */
const stubLayer = (width: number, height: number): CanvasLayer => ({ width, height }) as CanvasLayer

describe('cameraTranslation', () => {
    it('puts the followed y at SIMULATION.cameraHeightRatio of the canvas height', () => {
        const layer = stubLayer(800, 600)
        const followY = 1234

        const translation = cameraTranslation(layer, followY)

        // ctx.translate(translation.y) shifts world y so that the followed
        // point (screen y = 0 after translation, i.e. world y = followY) lands
        // at cameraHeightRatio of the canvas height.
        const followedScreenY = translation.y + followY
        expect(followedScreenY).toBeCloseTo(layer.height * SIMULATION.cameraHeightRatio)
    })

    it('centres x regardless of the followed y', () => {
        const layer = stubLayer(800, 600)

        expect(cameraTranslation(layer, 0).x).toBeCloseTo(layer.width / 2)
        expect(cameraTranslation(layer, 9999).x).toBeCloseTo(layer.width / 2)
    })

    it('scales with the canvas height', () => {
        const smallLayer = stubLayer(400, 300)
        const bigLayer = stubLayer(400, 900)

        const smallTranslation = cameraTranslation(smallLayer, 0)
        const bigTranslation = cameraTranslation(bigLayer, 0)

        expect(smallTranslation.y).toBeCloseTo(smallLayer.height * SIMULATION.cameraHeightRatio)
        expect(bigTranslation.y).toBeCloseTo(bigLayer.height * SIMULATION.cameraHeightRatio)
    })
})
