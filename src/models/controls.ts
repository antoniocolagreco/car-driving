export default class Controls {
    private acceleration: number = 0
    private steering: number = 0
    private braking: boolean = false
    private active: boolean = false

    private handleKeyDown(key: string) {
        switch (key) {
            case 'ArrowUp':
            case 'w':
                this.acceleration = 1.0 // Full forward
                break
            case 'ArrowDown':
            case 's':
                this.acceleration = -1.0 // Full reverse
                break
            case 'ArrowLeft':
            case 'a':
                this.steering = -1.0 // Full left
                break
            case 'ArrowRight':
            case 'd':
                this.steering = 1.0 // Full right
                break
            case ' ':
                this.braking = true
                break
        }
    }

    private handleKeyUp(key: string) {
        switch (key) {
            case 'ArrowUp':
            case 'ArrowDown':
            case 'w':
            case 's':
                this.acceleration = 0 // No acceleration
                break
            case 'ArrowLeft':
            case 'ArrowRight':
            case 'a':
            case 'd':
                this.steering = 0 // Center steering
                break
            case ' ':
                this.braking = false
                break
        }
    }

    drive = () => {
        document.onkeydown = (event: KeyboardEvent) => this.handleKeyDown(event.key)
        document.onkeyup = (event: KeyboardEvent) => this.handleKeyUp(event.key)
        this.active = true
    }

    release = () => {
        document.onkeydown = (event: KeyboardEvent) => this.handleKeyDown(event.key)
        document.onkeyup = (event: KeyboardEvent) => this.handleKeyUp(event.key)
        this.active = false
    }

    // New analog getters
    getAcceleration(): number {
        return this.acceleration
    }

    getSteering(): number {
        return this.steering
    }

    isBreaking(): boolean {
        return this.braking
    }

    // Legacy boolean getters for backward compatibility
    getForward(): boolean {
        return this.acceleration > 0
    }

    getReverse(): boolean {
        return this.acceleration < 0
    }

    getLeft(): boolean {
        return this.steering < 0
    }

    getRight(): boolean {
        return this.steering > 0
    }

    isActive(): boolean {
        return this.active
    }

    // New analog setters
    setAcceleration(value: number): void {
        this.acceleration = value
    }

    setSteering(value: number): void {
        this.steering = value
    }

    setBraking(value: boolean): void {
        this.braking = value
    }

    // Legacy boolean setters for backward compatibility
    setForward(value: boolean): void {
        this.acceleration = value ? 1.0 : 0
    }

    setReverse(value: boolean): void {
        this.acceleration = value ? -1.0 : 0
    }

    setLeft(value: boolean): void {
        this.steering = value ? -1.0 : 0
    }

    setRight(value: boolean): void {
        this.steering = value ? 1.0 : 0
    }

    setActive(value: boolean): void {
        this.active = value
    }
}
