/** Linear interpolation between `start` and `end`. */
export const lerp = (start: number, end: number, t: number): number => start + (end - start) * t

/** Restricts `value` to `[min, max]`; argument order is `(value, min, max)`. */
export const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value))

/** Maps between ranges and clamps to the target range. */
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

/** Maps asymmetric ranges around `threshold`, which always maps to zero. */
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
        mapped = ((value - threshold) / (fromMin - threshold)) * (toMin - threshold) + threshold
    } else {
        mapped = ((value - threshold) / (fromMax - threshold)) * (toMax - threshold) + threshold
    }

    return clamp(mapped, toMin, toMax)
}

/** Hyperbolic tangent activation. */
export const tanh = (sum: number, bias: number): number => {
    const exponent = sum + bias
    const numerator = Math.exp(exponent) - Math.exp(-exponent)
    const denominator = Math.exp(exponent) + Math.exp(-exponent)
    return numerator / denominator
}

/** Maps a value in `[min, max]` to a two-digit hexadecimal byte. */
export const toHex = (value: number, min: number, max: number): string => {
    const intensity = Math.floor(normalize(value, min, max, 0, 255))
    return intensity.toString(16).padStart(2, '0')
}

/** Red below `threshold`, green above it, black at it. */
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
