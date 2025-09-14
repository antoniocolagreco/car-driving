// Prefer public assets served from /audio; BASE_URL supports GitHub Pages base path
const base = (import.meta as ImportMeta).env.BASE_URL ?? '/'
const collisionSound = new Audio(`${base}audio/scratch.mp3`)
const gameoverSound = new Audio(`${base}audio/gameover.mp3`)

export default class AudioPlayer {
    private static instance: AudioPlayer | null = null

    private constructor() {}

    static play(): AudioPlayer {
        if (!AudioPlayer.instance) {
            AudioPlayer.instance = new AudioPlayer()
        }

        return AudioPlayer.instance
    }

    scratch = () => {
        collisionSound.play().catch(() => {})
    }
    gameover = () => {
        gameoverSound.play().catch(() => {})
    }
}
