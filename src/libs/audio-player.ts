const collisionSound = new Audio('./../../audio/scratch.mp3')
const gameoverSound = new Audio('./../../audio/gameover.mp3')

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
        collisionSound.play()
    }
    gameover = () => {
        gameoverSound.play()
    }
}
