interface CanvasOptions {
    width?: number
    height?: number
    role?: string
    ariaLabel?: string
    contextType?: '2d' | 'webgl' | 'webgl2'
    contextOptions?: CanvasRenderingContext2DSettings
}

export default class Canvas {
    private container: HTMLElement
    private element: HTMLCanvasElement
    private context: CanvasRenderingContext2D | null

    constructor(container: HTMLElement, options: CanvasOptions = {}) {
        const {
            width = 300,
            height = 150,
            role = 'img',
            ariaLabel = 'Canvas element',
            contextOptions = { alpha: false },
        } = options

        this.container = container
        this.element = document.createElement('canvas')
        this.element.width = width
        this.element.height = height
        this.element.setAttribute('role', role)
        this.element.setAttribute('aria-label', ariaLabel)

        // Type-safe context creation
        this.context = this.element.getContext('2d', contextOptions)

        // Automatically append to container
        this.container.appendChild(this.element)
    }

    getElement(): HTMLCanvasElement {
        return this.element
    }

    getContainer(): HTMLElement {
        return this.container
    }

    getContext(): CanvasRenderingContext2D | null {
        return this.context
    }

    get2DContext(): CanvasRenderingContext2D | null {
        return this.context as CanvasRenderingContext2D | null
    }

    setSize(width: number, height: number): void {
        this.element.width = width
        this.element.height = height
    }

    getSize(): { width: number; height: number } {
        return {
            width: this.element.width,
            height: this.element.height,
        }
    }

    getWidth(): number {
        return this.element.width
    }

    getHeight(): number {
        return this.element.height
    }

    setWidth(width: number): void {
        this.element.width = width
    }

    setHeight(height: number): void {
        this.element.height = height
    }

    appendTo(container: HTMLElement): void {
        container.appendChild(this.element)
    }

    removeFrom(container: HTMLElement): void {
        try {
            container.removeChild(this.element)
        } catch {
            // Element might not be in container
        }
    }

    clear(): void {
        if (this.context && 'clearRect' in this.context) {
            const ctx = this.context as CanvasRenderingContext2D
            ctx.clearRect(0, 0, this.element.width, this.element.height)
        }
    }

    destroy(): void {
        if (this.element.parentNode) {
            this.element.parentNode.removeChild(this.element)
        }
    }
}
