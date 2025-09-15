import Map from '@models/map'
import NeuralNetwork from '@models/neural-network'
import Point from '@models/point'
import Road from '@models/road'
import Size from '@models/size'
import type Vehicle from '@models/vehicle'
import Visualizer from '@models/visualizer'
import { DISPLAY, SIMULATION, TIMERS } from './config'
import { persistence } from './persistence'
import { generateCars, getActiveCar, getAliveCars, getBestCar } from './simulation-engine'
import { generateTraffic } from './traffic'

// Configuration and state management moved to dedicated services

export type SimulationControls = {
    start: () => void
    stop: () => void
    destroy: () => void
}

export function createSimulation(container: HTMLElement): SimulationControls {
    const abortController = new AbortController()
    let animationId: number | undefined
    let lastNetworkDrawAt = 0

    const carCanvas = document.createElement('canvas')
    carCanvas.setAttribute('role', 'img')
    carCanvas.setAttribute('aria-label', 'Simulation view: road and cars')
    const networkCanvas = document.createElement('canvas')
    networkCanvas.setAttribute('role', 'img')
    networkCanvas.setAttribute('aria-label', 'Neural network visualization of the active car')
    const carContext = carCanvas.getContext('2d', { alpha: false })
    const networkContext = networkCanvas.getContext('2d', { alpha: false })

    container.appendChild(carCanvas)
    container.appendChild(networkCanvas)

    window.addEventListener('resize', () => resizeCanvas(), { signal: abortController.signal })

    function resizeCanvas() {
        container.style.display = 'grid'
        const twoCols = container.clientWidth > 699
        container.style.gridTemplateColumns = twoCols ? '1fr 1fr' : '1fr'

        const desiredCarWidth = twoCols ? container.clientWidth / 2 : container.clientWidth
        const desiredCarHeight = twoCols ? container.clientHeight : container.clientHeight / 2
        const desiredNetWidth = desiredCarWidth
        const desiredNetHeight = desiredCarHeight

        if (carCanvas.width !== desiredCarWidth) carCanvas.width = desiredCarWidth
        if (carCanvas.height !== desiredCarHeight) carCanvas.height = desiredCarHeight
        if (networkCanvas.width !== desiredNetWidth) networkCanvas.width = desiredNetWidth
        if (networkCanvas.height !== desiredNetHeight) networkCanvas.height = desiredNetHeight
    }

    resizeCanvas()

    // World setup
    const worldMap = new Map({
        position: new Point(carCanvas.width / 2, carCanvas.height / 2),
        size: new Size(1000, 100000),
    })
    const road = new Road({
        position: new Point(carCanvas.width / 2, carCanvas.height / 2),
        size: new Size(240, worldMap.size.height),
        lanesCount: 3,
    })

    let allCars: Array<Vehicle> = []
    let traffic: Array<Vehicle> = []
    let aliveCars: Array<Vehicle> = []
    let activeCar: Vehicle | undefined
    let bestCar: Vehicle | undefined
    let deathCheckInterval: ReturnType<typeof setInterval> | undefined
    let demeritCheckInterval: ReturnType<typeof setInterval> | undefined
    let mutationRate = persistence.loadMutationRate()
    let numberOfCars = persistence.loadCarsQuantity()
    let neurons: Array<number> = persistence.loadNeurons()
    let trafficCounter = 0
    let gameover: boolean = false
    let gameoverAt: number | null = null

    // Setup UI event handlers
    const setupUI = () => {
        // Get DOM elements
        const mutationRange = document.querySelector('#mutation-rate') as HTMLInputElement | null
        const numberOfCarsRange = document.querySelector(
            '#number-of-cars',
        ) as HTMLInputElement | null
        const mutationValue = document.querySelector(
            '#mutation-rate-value',
        ) as HTMLSpanElement | null
        const numberOfCarsValue = document.querySelector(
            '#number-of-cars-value',
        ) as HTMLSpanElement | null
        const neuronsInput = document.querySelector('#neurons') as HTMLInputElement | null

        // Initialize UI values
        if (mutationValue) mutationValue.innerText = `${Math.round(mutationRate * 100)}%`
        if (mutationRange) mutationRange.value = `${mutationRate * 100}`
        if (numberOfCarsValue) numberOfCarsValue.innerText = String(numberOfCars)
        if (numberOfCarsRange) numberOfCarsRange.value = `${numberOfCars}`
        if (neuronsInput) neuronsInput.value = neurons.join(',')

        // Mutation rate slider
        mutationRange?.addEventListener(
            'input',
            () => {
                if (!mutationRange || !mutationValue) return
                const value = Number(mutationRange.value)
                mutationValue.innerText = `${value}%`
                mutationRate = value / 100
                persistence.saveMutationRate(mutationRate)
            },
            { signal: abortController.signal },
        )

        // Number of cars slider
        numberOfCarsRange?.addEventListener(
            'input',
            () => {
                if (!numberOfCarsRange || !numberOfCarsValue) return
                numberOfCarsValue.innerText = numberOfCarsRange.value
                numberOfCars = Number(numberOfCarsRange.value)
                persistence.saveCarsQuantity(numberOfCars)
            },
            { signal: abortController.signal },
        )

        // Neurons input
        neuronsInput?.addEventListener(
            'keypress',
            (event: Event) => {
                const e = event as KeyboardEvent
                if (e.key !== 'Enter' || !neuronsInput) return
                const values = neuronsInput.value
                    .split(',')
                    .map((v) => Number(v))
                    .filter((n) => Number.isFinite(n))
                persistence.saveNeurons(values.join(','))
                neurons = values
                persistence.clearBestNetwork()
                restart()
            },
            { signal: abortController.signal },
        )

        // Control buttons
        document.querySelector('#save-network')?.addEventListener(
            'click',
            () => {
                if (!activeCar || !activeCar.network) return
                persistence.saveNetworkBackup(activeCar.network)
            },
            { signal: abortController.signal },
        )

        document.querySelector('#restore-network')?.addEventListener(
            'click',
            () => {
                const restored = persistence.loadNetworkBackup()
                if (restored) persistence.saveBestNetwork(restored)
                restart()
            },
            { signal: abortController.signal },
        )

        document.querySelector('#reset-network')?.addEventListener(
            'click',
            () => {
                persistence.clearBestNetwork()
                restart()
            },
            { signal: abortController.signal },
        )

        document
            .querySelector('#restart-network')
            ?.addEventListener('click', () => restart(), { signal: abortController.signal })

        document.querySelector('#evolve-network')?.addEventListener(
            'click',
            () => {
                if (!bestCar || !bestCar.network) return
                persistence.saveBestNetwork(bestCar.network)
                endRound()
            },
            { signal: abortController.signal },
        )
    }

    setupUI()

    // Helpers
    const computeViewport = () => {
        const x = carCanvas.width / 2
        const fallbackY = traffic[0]?.position.y ?? 0
        const y = activeCar
            ? -activeCar.position.y + carCanvas.height * DISPLAY.viewportYFactor
            : fallbackY
        return { x, y }
    }

    const drawHud = () => {
        if (!activeCar || !carContext) return
        const infoId = document.querySelector('#info-id')
        if (infoId) infoId.innerHTML = `${activeCar.network?.id}`
        const infoPts = document.querySelector('#info-pts')
        if (infoPts) infoPts.innerHTML = `${activeCar.points}`
        const infoSrs = document.querySelector('#info-srv')
        if (infoSrs) infoSrs.innerHTML = `${activeCar.network?.survivedRounds}`
        const infoCrs = document.querySelector('#info-crs')
        if (infoCrs) infoCrs.innerHTML = `${aliveCars.length}`
        const infoPps = document.querySelector('#info-pps')
        if (infoPps) infoPps.innerHTML = `${(activeCar.speed * currentFps).toFixed(2)}`
        const infoFps = document.querySelector('#info-fps')
        if (infoFps) infoFps.innerHTML = `${currentFps}`
    }
    const drawGameOverOverlay = () => {
        if (!gameover || !bestCar || !carContext) return
        carContext.font = '32px monospace'
        carContext.lineWidth = 3
        carContext.setLineDash([])
        carContext.textAlign = 'center'
        carContext.textBaseline = 'middle'
        const message1 = `${bestCar.network?.id}`
        const message2 = 'WINS'
        const message3 = `with ${bestCar.points} points`
        carContext.fillStyle = '#fff'
        carContext.strokeStyle = 'black'
        carContext.strokeText(message1, carCanvas.width / 2, carCanvas.height / 2 - 80)
        carContext.fillText(message1, carCanvas.width / 2, carCanvas.height / 2 - 80)
        carContext.strokeText(message2, carCanvas.width / 2, carCanvas.height / 2 - 40)
        carContext.fillText(message2, carCanvas.width / 2, carCanvas.height / 2 - 40)
        carContext.strokeText(message3, carCanvas.width / 2, carCanvas.height / 2)
        carContext.fillText(message3, carCanvas.width / 2, carCanvas.height / 2)
    }

    const restart = () => {
        gameover = false
        gameoverAt = null
        let bestNetwork = persistence.loadBestNetwork()

        if (activeCar && activeCar.network && bestNetwork) {
            const activeCarPoints = activeCar.network.pointsRecord
            const bestNetworkPoints = bestNetwork.pointsRecord

            /**
             * Adaptive network merging strategy.
             * If the winning network's score is lower than the parent,
             * the model for successive networks will be an average
             * between the winner's network and the parent's network.
             */
            if (bestNetworkPoints > activeCarPoints) {
                bestNetwork = NeuralNetwork.mergeNetworks(
                    bestNetwork,
                    activeCar.network,
                    Math.max(0.5, activeCarPoints / bestNetworkPoints),
                )
            }
        }

        if (deathCheckInterval) clearInterval(deathCheckInterval)
        if (demeritCheckInterval) clearInterval(demeritCheckInterval)
        allCars = generateCars(numberOfCars, neurons, road)
        aliveCars = allCars
        activeCar = aliveCars[0]
        trafficCounter = 0
        activeCar.fillStyle = 'white'

        if (bestNetwork) {
            activeCar.network = bestNetwork
            if (activeCar.network) {
                for (let index = 1; index < allCars.length; index++) {
                    aliveCars[index].network = NeuralNetwork.getMutatedNetwork(
                        bestNetwork,
                        mutationRate,
                    )
                }
            }
        }

        traffic = generateTraffic(SIMULATION.initialTrafficRows, road)

        // State-based interval timers
        deathCheckInterval = setInterval(() => {
            const firstCar = getActiveCar(aliveCars)
            for (const car of aliveCars) {
                const t = traffic[trafficCounter]
                if (t && car.position.y > t.position.y) car.crash()
                if (firstCar && car.position.y - SIMULATION.trafficCrashLead > firstCar.position.y)
                    car.crash()
                if (car.meritPoints === car.checkPoints) {
                    car.demeritPoints += 1
                } else {
                    car.demeritPoints = 0
                }
                car.checkPoints = car.meritPoints
            }
            trafficCounter += 1
        }, TIMERS.deathMs)

        demeritCheckInterval = setInterval(() => {
            for (const car of aliveCars) {
                if (car.meritPoints <= car.checkPoints) {
                    car.demeritPoints += 1
                } else {
                    car.demeritPoints = 0
                }
                car.checkPoints = car.meritPoints
            }
        }, TIMERS.demeritMs)

        if (networkContext && activeCar.network) {
            Visualizer.drawNetworkIn(networkContext, activeCar.network)
        }
    }

    const endRound = () => {
        gameover = true
        gameoverAt = performance.now()
    }

    restart()

    let targetFPS = DISPLAY.targetFps
    let framesInterval = 1000 / targetFPS
    let lastFrameTimestamp = 0

    let lastFpsCountTimestamp = 0
    let countedFrames = 0
    let currentFps = 0

    const start = () => {
        if (animationId) cancelAnimationFrame(animationId)
        animationId = requestAnimationFrame(animate)
    }

    function animate(timestamp: number) {
        if (!carContext) return

        if (timestamp - lastFrameTimestamp < framesInterval) {
            requestAnimationFrame(animate)
            return
        }
        lastFrameTimestamp = timestamp

        resizeCanvas()

        aliveCars = getAliveCars(allCars)
        bestCar = getBestCar(allCars)
        activeCar = gameover ? bestCar : getActiveCar(aliveCars, activeCar)
        // If we are in gameover state, restart after the winner timeout using RAF time
        if (gameover && gameoverAt !== null && timestamp - gameoverAt >= TIMERS.winnerMs) {
            restart()
            gameoverAt = null
        }
        if (aliveCars.length === 0 && !gameover) {
            if (bestCar?.network) persistence.saveBestNetwork(bestCar.network)
            endRound()
        }

        // Center viewport on active car
        const { x: translateX, y: translateY } = computeViewport()
        carContext.save()
        carContext.translate(translateX, translateY)

        // Draw map and road
        worldMap.drawIn(carContext)
        road.drawIn(carContext)

        // Update and draw AI-controlled cars
        for (let car of allCars) {
            car.updateStatus(traffic, road.borders)
            car.drawIn(carContext)
        }

        // Update and draw traffic vehicles
        for (let vehicle of traffic) {
            vehicle.updateStatus(traffic, road.borders)
            vehicle.drawIn(carContext)
        }

        // Reset viewport
        carContext.restore()

        countedFrames += 1
        if (timestamp - lastFpsCountTimestamp > 1000) {
            lastFpsCountTimestamp = timestamp
            currentFps = countedFrames
            countedFrames = 0
        }

        drawHud()
        drawGameOverOverlay()

        // Draw neural network visualization for active car
        if (networkContext && activeCar && activeCar.network) {
            if (timestamp - lastNetworkDrawAt > DISPLAY.networkDrawThrottleMs) {
                // Clear once per redraw to avoid ghosting without flicker
                networkContext.clearRect(0, 0, networkCanvas.width, networkCanvas.height)
                Visualizer.drawNetworkIn(networkContext, activeCar.network)
                lastNetworkDrawAt = timestamp
            }
        }

        animationId = requestAnimationFrame(animate)
    }
    const stop = () => {
        if (animationId) cancelAnimationFrame(animationId)
        animationId = undefined
        if (deathCheckInterval) clearInterval(deathCheckInterval)
        if (demeritCheckInterval) clearInterval(demeritCheckInterval)
    }
    const destroy = () => {
        stop()
        abortController.abort()
        try {
            container.removeChild(carCanvas)
            container.removeChild(networkCanvas)
        } catch {}
    }

    // kick things off by default; caller can stop/start as needed
    start()
    return { start, stop, destroy }
}
