/** Creates and sizes one canvas backing store to its CSS box and device pixel ratio. */

export type CanvasLayer = {
    readonly element: HTMLCanvasElement
    readonly context: CanvasRenderingContext2D
    /** CSS pixel dimensions. */
    readonly width: number
    readonly height: number
    clear(): void
    destroy(): void
}

/** Appends a canvas and keeps all callers drawing in CSS pixels. */
export const createCanvasLayer = (container: HTMLElement, label: string): CanvasLayer => {
    const element = document.createElement('canvas')
    element.setAttribute('role', 'img')
    element.setAttribute('aria-label', label)
    // CSS owns layout; intrinsic backing-store dimensions must not feed back into it.
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
        // Measure the canvas, not the multi-column parent, to avoid horizontal squashing.
        width = element.clientWidth
        height = element.clientHeight

        element.width = Math.max(1, Math.round(width * devicePixelRatio))
        element.height = Math.max(1, Math.round(height * devicePixelRatio))

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
            // Clear in device pixels, independent of a leftover camera transform.
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
