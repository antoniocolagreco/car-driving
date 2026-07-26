/**
 * Owns one `<canvas>` element: creates it, keeps its backing store in sync with
 * its container's CSS size and the display's device pixel ratio, and tears it
 * down. This is the only place in `render/` that touches the DOM directly to
 * create an element; every other module here only draws onto a context it is
 * handed.
 *
 * Layout (how big the container is, how two canvases sit side by side) is owned
 * entirely by CSS on the page. The canvas itself is told to fill its slot in
 * that layout, and its drawing surface is resized to match the size it ends up
 * with, via a `ResizeObserver` rather than on every animation frame.
 */

/** A canvas element plus its 2D context, kept sized to its container. */
export type CanvasLayer = {
    readonly element: HTMLCanvasElement
    readonly context: CanvasRenderingContext2D
    /** CSS pixel size, kept in sync by a `ResizeObserver`. */
    readonly width: number
    readonly height: number
    /** Clears the whole drawing surface. */
    clear(): void
    /** Disconnects the resize observer and removes the element from the DOM. */
    destroy(): void
}

/**
 * Creates a canvas, appends it to `container`, and keeps its backing store at
 * `clientWidth/Height * devicePixelRatio` so drawing stays crisp on retina
 * displays. The context is scaled by the same ratio, so every other module in
 * `render/` can keep drawing in plain CSS pixels without knowing about DPR.
 */
export const createCanvasLayer = (container: HTMLElement, label: string): CanvasLayer => {
    const element = document.createElement('canvas')
    element.setAttribute('role', 'img')
    element.setAttribute('aria-label', label)
    // The canvas fills the slot CSS gave it, whatever that slot turns out to be
    // (a grid cell, a flex item, the whole container). Its own intrinsic size —
    // the `width`/`height` attributes set below — must never take part in
    // layout, or resizing the backing store would resize the element, which
    // would resize the backing store again.
    element.style.display = 'block'
    element.style.width = '100%'
    element.style.height = '100%'
    container.appendChild(element)

    const context = element.getContext('2d', { alpha: false })
    if (!context) {
        throw new Error(`Could not get a 2D context for the "${label}" canvas`)
    }

    let width = 0
    let height = 0

    const resize = (): void => {
        const devicePixelRatio = window.devicePixelRatio || 1
        // Measure the CANVAS, not the container. The container holds two canvases
        // side by side, so its width is roughly twice the width each canvas is
        // actually displayed at; sizing the backing store from it produced a
        // surface twice as wide as its CSS box, which the browser then squeezed
        // back into that box — every car, every ray and the whole road came out
        // squashed horizontally by exactly a factor of two.
        width = element.clientWidth
        height = element.clientHeight

        element.width = Math.max(1, Math.round(width * devicePixelRatio))
        element.height = Math.max(1, Math.round(height * devicePixelRatio))

        // Every draw call after this keeps working in CSS pixels: the context
        // maps them onto the higher-resolution backing store for us.
        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    return {
        element,
        context,
        get width() {
            return width
        },
        get height() {
            return height
        },
        clear(): void {
            // Clear the full backing store regardless of the current transform,
            // so a leftover camera translation from a previous frame can never
            // leave a corner of the canvas undrawn.
            context.save()
            context.setTransform(1, 0, 0, 1, 0, 0)
            context.clearRect(0, 0, element.width, element.height)
            context.restore()
        },
        destroy(): void {
            observer.disconnect()
            element.remove()
        },
    }
}
