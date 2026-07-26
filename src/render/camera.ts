import { type Vec2, vec } from '@core/geometry'
import { SIMULATION } from '@core/config'
import type { CanvasLayer } from './canvas'

/**
 * The camera: a plain translation applied before drawing the world, so the
 * followed car appears at a fixed point on screen while the world scrolls
 * underneath it.
 */

/**
 * Translation that puts `followY` at `SIMULATION.cameraHeightRatio` of the
 * canvas height, with `x` centred. Meant to be passed straight to
 * `ctx.translate`: everything drawn afterwards can use plain world coordinates
 * and the followed car stays put on screen.
 */
export const cameraTranslation = (layer: CanvasLayer, followY: number): Vec2 =>
    vec(layer.width / 2, layer.height * SIMULATION.cameraHeightRatio - followY)
