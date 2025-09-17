export default class Controls {
    private forward: boolean = false
    private reverse: boolean = false
    private left: boolean = false
    private right: boolean = false
    private brake: boolean = false
    private active: boolean = false

    #handleKeyDown(key: string) {
        switch (key) {
            case 'ArrowUp':
                this.forward = true
                break
            case 'ArrowDown':
                this.reverse = true
                break
            case 'ArrowLeft':
                this.left = true
                break
            case 'ArrowRight':
                this.right = true
                break
            case 'w':
                this.forward = true
                break
            case 's':
                this.reverse = true
                break
            case 'a':
                this.left = true
                break
            case 'd':
                this.right = true
                break
        }
    }

    #handleKeyUp(key: string) {
        switch (key) {
            case 'ArrowUp':
                this.forward = false
                break
            case 'ArrowDown':
                this.reverse = false
                break
            case 'ArrowLeft':
                this.left = false
                break
            case 'ArrowRight':
                this.right = false
                break
            case 'w':
                this.forward = false
                break
            case 's':
                this.reverse = false
                break
            case 'a':
                this.left = false
                break
            case 'd':
                this.right = false
                break
        }
    }

    drive = () => {
        document.onkeydown = (event: KeyboardEvent) => this.#handleKeyDown(event.key)
        document.onkeyup = (event: KeyboardEvent) => this.#handleKeyUp(event.key)
        this.active = true
    }

    release = () => {
        document.onkeydown = (event: KeyboardEvent) => this.#handleKeyDown(event.key)
        document.onkeyup = (event: KeyboardEvent) => this.#handleKeyUp(event.key)
        this.active = false
    }

    // Getters
    getForward(): boolean {
        return this.forward
    }

    getReverse(): boolean {
        return this.reverse
    }

    getLeft(): boolean {
        return this.left
    }

    getRight(): boolean {
        return this.right
    }

    getBrake(): boolean {
        return this.brake
    }

    isActive(): boolean {
        return this.active
    }

    // Setters
    setForward(value: boolean): void {
        this.forward = value
    }

    setReverse(value: boolean): void {
        this.reverse = value
    }

    setLeft(value: boolean): void {
        this.left = value
    }

    setRight(value: boolean): void {
        this.right = value
    }

    setBrake(value: boolean): void {
        this.brake = value
    }

    setActive(value: boolean): void {
        this.active = value
    }
}
