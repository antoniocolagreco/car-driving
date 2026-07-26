/**
 * Pure 2D geometry primitives shared by physics, sensors and rendering.
 *
 * Everything here is immutable data plus free functions: moving a car means
 * reassigning its `position`, never mutating one in place. At the scale of this
 * simulation (a couple hundred cars, one small object allocated per car per
 * frame) that costs nothing, and it removes a whole class of aliasing bugs that
 * the old model classes suffered from (e.g. a sensor sharing a mutable `Point`
 * reference with the car it tracked, so moving the car silently moved the sensor).
 */

/** A point or vector in world space, in pixels. */
export type Vec2 = { readonly x: number; readonly y: number }

/** A 2D size, in pixels. */
export type Size = { readonly width: number; readonly height: number }

/** A line segment between two points. */
export type Segment = { readonly a: Vec2; readonly b: Vec2 }

/** An ordered list of vertices, implicitly closed (last vertex connects back to the first). */
export type Polygon = readonly Vec2[]

/**
 * The result of a successful segment intersection: where it happened, and how far
 * along the first segment it happened.
 */
export type RayHit = {
    readonly point: Vec2
    /** Parametric position along segment `a`, in [0, 1]: 0 = `a.a`, 1 = `a.b`. */
    readonly offset: number
}

/** Builds a vector/point. Trivial, but keeps call sites free of object-literal noise. */
export const vec = (x: number, y: number): Vec2 => ({ x, y })

/** Euclidean distance between two points, in pixels. */
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y)

/**
 * Finds where two segments cross, if they do.
 *
 * Used for both sensor ray casting (segment `a` is the ray, `b` is an obstacle
 * edge) and collision detection (both segments are car/road edges).
 *
 * The two segments are written as parametric lines: point = start + t * (end - start).
 * Solving for where line(a) meets line(b) gives one `t` (position along `a`) and one
 * `u` (position along `b`). The lines themselves are infinite, so a solution only
 * counts as a real intersection between the two *segments* when both `t` and `u`
 * fall inside [0, 1] — outside that range the crossing point lies on the extension
 * of one or both segments, past their actual endpoints.
 */
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

/** Splits a polygon into its edges, wrapping the last vertex back to the first. */
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

/** Dot product of two vectors. */
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y

/** Signed doubled area; its sign is the winding direction of a polygon. */
const signedDoubleArea = (polygon: Polygon): number => {
    let area = 0
    for (let index = 0; index < polygon.length; index++) {
        const current = polygon[index]
        const next = polygon[(index + 1) % polygon.length]
        area += current.x * next.y - current.y * next.x
    }
    return area
}

/**
 * Returns the portion of `segment` inside or touching a convex polygon.
 *
 * The result deliberately includes zero-length contacts. Sensor areas must report
 * a bumper grazing their boundary, not only crossings through their edges.
 */
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

/**
 * Builds the four-corner polygon of a car (or any rectangular body) given its
 * center position, size and heading. Used both for rendering the car body and
 * for collision checks against the road borders and other traffic.
 *
 * The trick is to treat the rectangle as inscribed in a circle: `rad` is the
 * radius of that circle (half of the rectangle's diagonal), and `alpha` is the
 * angle between the diagonal and the rectangle's vertical axis. Sine gives the
 * position on the x-axis, cosine the position on the y-axis, of a point on the
 * unit circle. So `sin(heading ± alpha) * rad` and `cos(heading ± alpha) * rad`
 * give the offset of each corner from the center, already accounting for the
 * car's current heading — rotating the car is just changing which angle on that
 * circle we sample. The two rear corners are found the same way, shifted by PI
 * (180 degrees) since they sit on the opposite side of the circle.
 */
export const carPolygon = (position: Vec2, size: Size, heading: number): Polygon => {
    const rad = Math.hypot(size.width, size.height) / 2
    const alpha = Math.atan2(size.width, size.height)

    // Corner names are relative to the car itself: at heading 0 the car faces up the
    // road, which is towards negative y on the canvas, so "front" is the top of the
    // screen. They are listed in cycle order, which is what `polygonSegments` needs.
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
