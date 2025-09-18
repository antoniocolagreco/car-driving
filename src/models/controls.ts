export default class Controls {
    private acceleration: number = 0 // -1 (reverse) to +1 (forward)
    private steering: number = 0 // -1 (left) to +1 (right)
    private brake: number = 0 // 0 (no brake) to 1 (full brake)
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
                this.brake = 1.0 // Full brake with spacebar
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
                this.brake = 0 // Release brake
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

    getBrake(): number {
        return this.brake
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
        this.acceleration = Math.max(-1, Math.min(1, value)) // Clamp to [-1, 1]
    }

    setSteering(value: number): void {
        this.steering = Math.max(-1, Math.min(1, value)) // Clamp to [-1, 1]
    }

    setBrake(value: number): void {
        this.brake = Math.max(0, Math.min(1, value)) // Clamp to [0, 1]
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
