/**
 * General-purpose numeric helpers used across physics, the neural network and
 * the network visualizer. Nothing here knows about cars, sensors or canvases.
 */

/**
 * Linear interpolation between `start` and `end`.
 * @example lerp(0, 10, 0.5) // 5
 */
export const lerp = (start: number, end: number, t: number): number => start + (end - start) * t

/**
 * Restricts `value` to the [min, max] range.
 *
 * NOTE: argument order is `(value, min, max)`, unlike the original helper
 * clamp which took `(min, max, value)` — that order was a recurring source of
 * bugs at call sites, so it was deliberately changed here.
 */
export const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value))

/**
 * Maps `value` from the range [fromMin, fromMax] to [toMin, toMax], clamping the
 * result to the target range. Used to turn raw simulation quantities (distances,
 * speeds) into normalized inputs for the neural network and colors for the HUD.
 * @example normalize(5, 0, 10, 0, 100) // 50
 */
export const normalize = (
    value: number,
    fromMin: number,
    fromMax: number,
    toMin: number,
    toMax: number,
): number => {
    const fromScale = fromMax - fromMin
    const toScale = toMax - toMin
    const mapped = ((value - fromMin) / fromScale) * toScale
    return clamp(mapped, toMin, toMax)
}

/**
 * Like `normalize`, but maps around a `threshold` point instead of `fromMin`
 * directly, so that `threshold` always lands on 0 in the target range. This is
 * what lets car speed — which has a different range going forward than in
 * reverse — be normalized onto a single symmetric [-1, 1] input for the network,
 * with 0 speed always mapping to 0 regardless of how lopsided the input range is.
 */
export const normalizeWithThreshold = (
    value: number,
    fromMin: number,
    fromMax: number,
    toMin: number,
    toMax: number,
    threshold: number = 0,
): number => {
    let mapped: number

    if (value <= threshold) {
        // Maps [fromMin, threshold] -> [toMin, 0]
        mapped = ((value - threshold) / (fromMin - threshold)) * (toMin - threshold) + threshold
    } else {
        // Maps [threshold, fromMax] -> [0, toMax]
        mapped = ((value - threshold) / (fromMax - threshold)) * (toMax - threshold) + threshold
    }

    return clamp(mapped, toMin, toMax)
}

/**
 * Hyperbolic tangent activation function used by the neural network: squashes
 * `sum + bias` into (-1, 1), symmetric around zero so both positive and negative
 * signals can drive a neuron equally.
 */
export const tanh = (sum: number, bias: number): number => {
    const exponent = sum + bias
    const numerator = Math.exp(exponent) - Math.exp(-exponent)
    const denominator = Math.exp(exponent) + Math.exp(-exponent)
    return numerator / denominator
}

/**
 * Converts a value within [min, max] to a two-digit hexadecimal byte (00-ff).
 * Building block for `toHexDualColorRange`, used by the network visualizer.
 */
export const toHex = (value: number, min: number, max: number): string => {
    const intensity = Math.floor(normalize(value, min, max, 0, 255))
    return intensity.toString(16).padStart(2, '0')
}

/**
 * Converts a value to a red/green color: red for negative values, green for
 * positive values, black at `threshold`. Used by the network visualizer to show
 * the sign of a weight or bias at a glance (red = inhibitory, green = excitatory).
 */
export const toHexDualColorRange = (
    value: number,
    min: number,
    max: number,
    threshold: number = 0,
): string => {
    let red = '00'
    let green = '00'

    if (value < 0) {
        red = toHex(value, min, threshold)
    } else if (value > 0) {
        green = toHex(value, threshold, max)
    }

    return `#${red}${green}00`
}
