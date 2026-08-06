import { type Vec2, vec } from '@core/geometry'
import { SIMULATION } from '@core/config'
import type { CanvasLayer } from './canvas'

/** Translation that centers x and places `followY` at the configured screen height. */
export const cameraTranslation = (layer: CanvasLayer, followY: number): Vec2 =>
    vec(layer.width / 2, layer.height * SIMULATION.cameraHeightRatio - followY)
