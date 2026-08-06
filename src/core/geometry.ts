/** Immutable 2D geometry shared by physics, sensors and rendering. */

export type Vec2 = { readonly x: number; readonly y: number }

export type Size = { readonly width: number; readonly height: number }

export type Segment = { readonly a: Vec2; readonly b: Vec2 }

/** Ordered vertices of an implicitly closed polygon. */
export type Polygon = readonly Vec2[]

export type RayHit = {
    readonly point: Vec2
    /** Parametric position along segment `a`, in [0, 1]: 0 = `a.a`, 1 = `a.b`. */
    readonly offset: number
}

export const vec = (x: number, y: number): Vec2 => ({ x, y })

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y)

/** Finds a segment intersection; both parametric offsets must lie in `[0, 1]`. */
export const segmentIntersection = (a: Segment, b: Segment): RayHit | null => {
    const tTop = (b.b.x - b.a.x) * (a.a.y - b.a.y) - (b.b.y - b.a.y) * (a.a.x - b.a.x)
    const uTop = (b.a.y - a.a.y) * (a.a.x - a.b.x) - (b.a.x - a.a.x) * (a.a.y - a.b.y)
    const bottom = (b.b.y - b.a.y) * (a.b.x - a.a.x) - (b.b.x - b.a.x) * (a.b.y - a.a.y)

    if (bottom === 0) {
        return null
    }

    const t = tTop / bottom
    const u = uTop / bottom

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return {
            point: vec(a.a.x + (a.b.x - a.a.x) * t, a.a.y + (a.b.y - a.a.y) * t),
            offset: t,
        }
    }

    return null
}

export const polygonSegments = (polygon: Polygon): Segment[] => {
    const segments: Segment[] = []
    for (let index = 0; index < polygon.length; index++) {
        segments.push({
            a: polygon[index],
            b: polygon[(index + 1) % polygon.length],
        })
    }
    return segments
}

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y

const signedDoubleArea = (polygon: Polygon): number => {
    let area = 0
    for (let index = 0; index < polygon.length; index++) {
        const current = polygon[index]
        const next = polygon[(index + 1) % polygon.length]
        area += current.x * next.y - current.y * next.x
    }
    return area
}

/** Clips a segment to a convex polygon, including zero-length boundary contacts. */
export const clipSegmentToConvexPolygon = (segment: Segment, polygon: Polygon): Segment | null => {
    if (polygon.length < 3) {
        return null
    }

    const direction = vec(segment.b.x - segment.a.x, segment.b.y - segment.a.y)
    const winding = Math.sign(signedDoubleArea(polygon)) || 1
    let entry = 0
    let exit = 1

    for (let index = 0; index < polygon.length; index++) {
        const edgeStart = polygon[index]
        const edgeEnd = polygon[(index + 1) % polygon.length]
        const edge = vec(edgeEnd.x - edgeStart.x, edgeEnd.y - edgeStart.y)
        const fromEdge = vec(segment.a.x - edgeStart.x, segment.a.y - edgeStart.y)
        const startSide = winding * (edge.x * fromEdge.y - edge.y * fromEdge.x)
        const change = winding * (edge.x * direction.y - edge.y * direction.x)

        if (Math.abs(change) < 1e-10) {
            if (startSide < -1e-10) {
                return null
            }
            continue
        }

        const boundary = -startSide / change
        if (change > 0) {
            entry = Math.max(entry, boundary)
        } else {
            exit = Math.min(exit, boundary)
        }
        if (entry > exit + 1e-10) {
            return null
        }
    }

    const startOffset = Math.min(1, Math.max(0, entry))
    const endOffset = Math.min(1, Math.max(0, exit))
    if (startOffset > endOffset + 1e-10) {
        return null
    }
    return {
        a: vec(segment.a.x + direction.x * startOffset, segment.a.y + direction.y * startOffset),
        b: vec(segment.a.x + direction.x * endOffset, segment.a.y + direction.y * endOffset),
    }
}

/** Builds the four corners of a rotated rectangle from its diagonal radius and angle. */
export const carPolygon = (position: Vec2, size: Size, heading: number): Polygon => {
    const rad = Math.hypot(size.width, size.height) / 2
    const alpha = Math.atan2(size.width, size.height)

    // Cycle order is required by `polygonSegments`; heading zero faces negative y.
    const frontRight = vec(
        position.x - Math.sin(heading - alpha) * rad,
        position.y - Math.cos(heading - alpha) * rad,
    )
    const frontLeft = vec(
        position.x - Math.sin(heading + alpha) * rad,
        position.y - Math.cos(heading + alpha) * rad,
    )
    const rearLeft = vec(
        position.x - Math.sin(Math.PI + heading - alpha) * rad,
        position.y - Math.cos(Math.PI + heading - alpha) * rad,
    )
    const rearRight = vec(
        position.x - Math.sin(Math.PI + heading + alpha) * rad,
        position.y - Math.cos(Math.PI + heading + alpha) * rad,
    )

    return [frontRight, frontLeft, rearLeft, rearRight]
}
