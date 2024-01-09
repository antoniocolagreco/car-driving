export default class Controls {
    forward: boolean = false
    reverse: boolean = false
    left: boolean = false
    right: boolean = false
    brake: boolean = false

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
            case ' ':
                this.brake = true
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
            case ' ':
                this.brake = false
                break
        }
    }

    drive = () => {
        document.onkeydown = (event: KeyboardEvent) => this.#handleKeyDown(event.key)
        document.onkeyup = (event: KeyboardEvent) => this.#handleKeyUp(event.key)
    }

    release = () => {
        document.onkeydown = (event: KeyboardEvent) => this.#handleKeyDown(event.key)
        document.onkeyup = (event: KeyboardEvent) => this.#handleKeyUp(event.key)
    }
}