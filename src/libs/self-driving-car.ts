import { Car } from '../models/car'
import Features from '../models/features'
import Map from '../models/map'
import NeuralNetwork from '../models/neural-network'
import Point from '../models/point'
import Road from '../models/road'
import Sensor from '../models/sensor'
import Size from '../models/size'
import type Vehicle from '../models/vehicle'
import Visualizer from '../models/visualizer'
import { getTrafficRow } from './traffic'

const BEST_NETWORK_KEY = 'BestNetwork'
const BACKUP_NETWORK_KEY = 'BackupNetwork'
const MUTATION_RATE_KEY = 'MutationRate'
const NUMBER_OF_CARS_KEY = 'NumberOfCars'
const NEURONS_KEY = 'Neurons'
const DEATH_TIMER_SECONDS = 15000
const DEMERIT_TIMER_SECONDS = 10000
const WINNER_TIMER_SECONDS = 3000

export function init(container: HTMLElement) {
    const carCanvas = document.createElement('canvas')
    const networkCanvas = document.createElement('canvas')
    const carContext = carCanvas.getContext('2d', { alpha: false })
    const networkContext = networkCanvas.getContext('2d', { alpha: false })

    container.appendChild(carCanvas)
    container.appendChild(networkCanvas)

    window.onresize = () => resizeCanvas()

    function resizeCanvas() {
        container.style.display = 'grid'
        if (container.clientWidth > 699) {
            container.style.gridTemplateColumns = '1fr 1fr'
            carCanvas.width = container.clientWidth / 2
            carCanvas.height = container.clientHeight
            networkCanvas.width = container.clientWidth / 2
            networkCanvas.height = container.clientHeight
        } else {
            container.style.gridTemplateColumns = '1fr'
            carCanvas.width = container.clientWidth
            carCanvas.height = container.clientHeight / 2
            networkCanvas.width = container.clientWidth
            networkCanvas.height = container.clientHeight / 2
        }
    }

    resizeCanvas()

    const map = new Map({
        position: new Point(carCanvas.width / 2, carCanvas.height / 2),
        size: new Size(1000, 100000),
    })
    const road = new Road({
        position: new Point(carCanvas.width / 2, carCanvas.height / 2),
        size: new Size(240, map.size.height),
        lanesCount: 3,
    })

    let allCars: Array<Vehicle> = []
    let traffic: Array<Vehicle> = []
    let aliveCars: Array<Vehicle> = []
    let activeCar: Vehicle | undefined
    let bestCar: Vehicle | undefined
    let notIdleVehicleCheckInterval: ReturnType<typeof setTimeout> | undefined
    let mutationRate = loadMutationRate() ?? 0.2
    let numberOfCars = loadNumberOfCars() ?? 50
    let neurons: Array<number> = loadNeurons() ?? [4]
    let trafficCounter = 0
    let deathTimer: ReturnType<typeof setTimeout>
    let demeritTimer: ReturnType<typeof setTimeout>
    let gameover: boolean = false

    const mutationRange = document.querySelector('#mutation-rate') as HTMLInputElement
    const numberOfCarsRange = document.querySelector('#number-of-cars') as HTMLInputElement
    const mutationValue = document.querySelector('#mutation-rate-value') as HTMLSpanElement
    const numberOfCarsValue = document.querySelector('#number-of-cars-value') as HTMLSpanElement
    const neuronsInput = document.querySelector('#neurons') as HTMLInputElement

    mutationValue.innerText = `${Math.round(mutationRate * 100)}%`
    mutationRange.value = `${mutationRate * 100}`
    numberOfCarsValue.innerText = String(numberOfCars)
    numberOfCarsRange.value = `${numberOfCars}`

    neuronsInput.value = neurons.join(',')

    neuronsInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            saveNeurons(neuronsInput.value)
            neurons = neuronsInput.value.split(',').map((v) => Number(v))
            resetNetwork()
            restart()
        }
    })

    mutationRange.addEventListener('input', () => {
        const value = Number(mutationRange.value)
        mutationValue.innerText = `${value}%`
        mutationRate = value / 100
        saveMutationRate(mutationRate)
    })
    numberOfCarsRange.addEventListener('input', () => {
        numberOfCarsValue.innerText = numberOfCarsRange.value
        numberOfCars = Number(numberOfCarsRange.value)
        saveNumberOfCars(numberOfCars)
    })

    document.querySelector('#save-network')?.addEventListener('click', () => {
        if (!activeCar || !activeCar.network) return
        backupNetwork(activeCar.network)
    })
    document.querySelector('#restore-network')?.addEventListener('click', () => {
        restoreNetwork()
        restart()
    })
    document.querySelector('#reset-network')?.addEventListener('click', () => {
        resetNetwork()
        restart()
    })
    document.querySelector('#restart-network')?.addEventListener('click', () => {
        restart()
    })
    document.querySelector('#evolve-network')?.addEventListener('click', () => {
        if (!bestCar || !bestCar.network) return
        saveNetwork(bestCar.network)
        endRound()
    })

    const restart = () => {
        gameover = false
        let bestNetwork = loadNetwork()

        if (activeCar && activeCar.network && bestNetwork) {
            const activeCarPoints = activeCar.network.pointsRecord
            const bestNetworkPoints = bestNetwork.pointsRecord

            /**
             * Modifica effettuata successivamente per prova.
             * Se il puntenggio della rete che vince è inferiore al padre,
             * il modello delle reti suscessive sarà una media
             * tra la rete del vincitore e quella del padre.
             */
            if (bestNetworkPoints > activeCarPoints) {
                bestNetwork = NeuralNetwork.mergeNetworks(
                    bestNetwork,
                    activeCar.network,
                    Math.max(0.5, activeCarPoints / bestNetworkPoints),
                )
            }
        }

        clearTimeout(deathTimer)
        clearTimeout(demeritTimer)
        allCars = generateCars(numberOfCars, neurons, road)
        aliveCars = allCars
        activeCar = aliveCars[0]
        clearInterval(notIdleVehicleCheckInterval)
        notIdleVehicleCheckInterval = undefined
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

        traffic = generateTraffic(20, road)

        deathTimer = setTimeout(
            () => removeLateCars(aliveCars, traffic, trafficCounter, getActiveCar, deathTimer),
            DEATH_TIMER_SECONDS,
        )
        demeritTimer = setTimeout(
            () => giveDemerits(aliveCars, demeritTimer),
            DEMERIT_TIMER_SECONDS,
        )

        if (networkContext && activeCar.network) {
            Visualizer.drawNetworkIn(networkContext, activeCar.network)
        }
    }

    const endRound = () => {
        gameover = true
        setTimeout(() => {
            restart()
        }, WINNER_TIMER_SECONDS)
    }

    restart()

    let targetFPS = 60
    let framesInterval = 1000 / targetFPS
    let lastFrameTimestamp = 0

    let lastFpsCountTimestamp = 0
    let countedFrames = 0
    let currentFps = 0

    requestAnimationFrame(animate)

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
        if (aliveCars.length === 0 && !gameover) {
            if (bestCar && bestCar.network) {
                if (bestCar.network) {
                    saveNetwork(bestCar.network)
                }
            }
            endRound()
        }

        //Centra viewport su auto attiva
        const translateY = activeCar
            ? -activeCar.position.y + carCanvas.height * 0.7
            : traffic[0].position.y
        const translateX = carCanvas.width / 2
        carContext.translate(translateX, translateY)

        //Disegna mappa e strada
        map.drawIn(carContext)
        road.drawIn(carContext)

        //Aggiorna stato e disegna auto che corrono con AI
        for (let car of allCars) {
            car.updateStatus(traffic, road.borders)
            car.drawIn(carContext)
        }

        //Aggiorna stato e disegna traffico
        for (let vehicle of traffic) {
            vehicle.updateStatus(traffic, road.borders)
            vehicle.drawIn(carContext)
        }

        //Reset viewport
        carContext.translate(-translateX, -translateY)

        countedFrames += 1
        if (timestamp - lastFpsCountTimestamp > 1000) {
            lastFpsCountTimestamp = timestamp
            currentFps = countedFrames
            countedFrames = 0
        }

        //Disegna interfaccia
        if (activeCar) {
            carContext.fillStyle = '#fff'
            carContext.font = '20px monospace'
            carContext.textAlign = 'left'
            carContext.textBaseline = 'bottom'
            carContext.fillText(` ID: ${activeCar.network?.id}`, 10, carCanvas.height - 130)
            carContext.fillText(`PTS: ${activeCar.points}`, 10, carCanvas.height - 110)
            carContext.fillText(
                `SRS: ${activeCar.network?.survivedRounds}`,
                10,
                carCanvas.height - 90,
            )
            carContext.fillText(`CRS: ${aliveCars.length}`, 10, carCanvas.height - 70)
            carContext.fillText(
                `PPS: ${(activeCar.speed * currentFps).toFixed(2)}`,
                10,
                carCanvas.height - 50,
            )
            carContext.fillText(
                `RPS: ${(activeCar.steeringPower * currentFps).toFixed(2)}`,
                10,
                carCanvas.height - 30,
            )
        }
        carContext.fillText(`FPS: ${currentFps}`, 10, carCanvas.height - 10)

        if (gameover && bestCar) {
            carContext.font = '32px monospace'
            carContext.lineWidth = 3
            carContext.setLineDash([])
            carContext.textAlign = 'center'
            carContext.textBaseline = 'middle'

            const message1 = `${bestCar.network?.id}`
            const message2 = `WINS`
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

        //Disegna rete neurale auto attiva
        if (networkContext && activeCar && activeCar.network) {
            Visualizer.drawNetworkIn(networkContext, activeCar.network)
        }

        requestAnimationFrame((t) => animate(t))
    }
}

const generateCars = (n: number, neurons: Array<number>, road: Road) => {
    const cars = []

    const features = new Features({
        maxSpeed: 7,
        acceleration: 0.03,
        maxReverse: 1,
        breakPower: 0.2,
    })

    for (let index = 0; index < n; index++) {
        // const lane = Math.floor(Math.random() * 4)
        const lane = 1
        const position = road.getLanePosition(lane)
        const sensor = new Sensor({ rayCount: 7, rayLength: 500, raySpread: Math.PI })
        const network = new NeuralNetwork(sensor.rayCount + 1, ...neurons, 4)
        const car = new Car({ position, features, sensor, network, ghost: true })
        cars.push(car)
    }
    return cars
}

const getAliveCars = (cars: Array<Vehicle>) => cars.filter((c) => !c.damaged)

const getActiveCar = (cars: Array<Vehicle>, currentActiveCar?: Vehicle) => {
    const car = cars.find((car) => car.position.y === Math.min(...cars.map((c) => c.position.y)))
    if (car && currentActiveCar) {
        currentActiveCar.setGhost(true)
        car.setGhost(false)
    }
    return car
}

const getBestCar = (cars: Array<Car>) => {
    const carsWithMostPoints = cars.filter(
        (car) =>
            car.points ===
            Math.max(
                ...cars.map((c) => {
                    c.winner = false
                    return c.points
                }),
            ),
    )
    const carThatDiedLast = carsWithMostPoints.find(
        (car) => car.position.y === Math.min(...carsWithMostPoints.map((c) => c.position.y)),
    )
    if (carThatDiedLast) {
        carThatDiedLast.winner = true
    }
    return carThatDiedLast
}

const removeLateCars = (
    cars: Array<Car>,
    traffic: Array<Car>,
    trafficCounter: number,
    getActiveCar: (cars: Array<Vehicle>) => Vehicle | undefined,
    deathTimer: ReturnType<typeof setTimeout>,
) => {
    const firstCar = getActiveCar(cars)

    cars.forEach((car) => {
        if (car.position.y > traffic[trafficCounter].position.y) car.crash()
        if (firstCar) {
            if (car.position.y - 5000 > firstCar.position.y) car.crash()
        }
        if (car.meritPoints === car.checkPoints) {
            car.demeritPoints += 1
        } else {
            car.demeritPoints = 0
        }
        car.checkPoints = car.meritPoints
    })
    trafficCounter += 1
    deathTimer = setTimeout(
        () => removeLateCars(cars, traffic, trafficCounter, getActiveCar, deathTimer),
        DEATH_TIMER_SECONDS,
    )
}

const giveDemerits = (aliveCars: Array<Car>, demeritTimer: ReturnType<typeof setTimeout>) => {
    aliveCars.forEach((car) => {
        if (car.meritPoints <= car.checkPoints) {
            car.demeritPoints += 1
        } else {
            car.demeritPoints = 0
        }
        car.checkPoints = car.meritPoints
    })
    demeritTimer = setTimeout(() => giveDemerits(aliveCars, demeritTimer), DEMERIT_TIMER_SECONDS)
}

const saveNetwork = (newNetwork: NeuralNetwork, _lastNework?: NeuralNetwork) => {
    newNetwork.survivedRounds += 1
    localStorage.setItem(BEST_NETWORK_KEY, JSON.stringify(newNetwork))
}

const backupNetwork = (network: NeuralNetwork) => {
    localStorage.setItem(BACKUP_NETWORK_KEY, JSON.stringify(network))
}

const restoreNetwork = () => {
    const networkString = localStorage.getItem(BACKUP_NETWORK_KEY)
    if (networkString) {
        const network = JSON.parse(networkString)
        saveNetwork(network)
    }
}

const resetNetwork = () => {
    localStorage.removeItem(BEST_NETWORK_KEY)
}

/**
 * Carica la rete neurale salvata nel localStorage.
 */
const loadNetwork = (): NeuralNetwork | undefined => {
    const network = localStorage.getItem(BEST_NETWORK_KEY)
    if (!network) return undefined
    return JSON.parse(network)
}

/**
 * Genera il traffico per la strada specificata.
 */
const generateTraffic = (rowsOfCar: number, road: Road): Array<Vehicle> => {
    let traffic: Array<Vehicle> = []
    const offset = -400

    for (let i = 0; i < rowsOfCar; i++) {
        // const func = fixedRows.shift()
        // if (func) {
        //     traffic.push(...func(road, offset * i))
        // }
        const carsRow = getTrafficRow(road, offset * i + offset)
        traffic.push(...carsRow)
    }

    for (let vehicle of traffic) {
        vehicle.controls.forward = true
    }

    return traffic
}

/**
 * Genera una fila di veicoli per la strada specificata in posizioni casuali.
 * @param road - L'oggetto strada su cui generare il traffico.
 * @returns Un array di veicoli che rappresentano una fila di traffico.
 */
/* const generateUsedLanesPerRow = (n: number, road: Road) => {
    const lanes: Array<number> = []
    let lanesToAdd = 0
    while (lanesToAdd < n) {
        const lane = Math.floor(Math.random() * road.lanesCount)
        if (!lanes.includes(lane)) {
            lanes.push(lane)
            lanesToAdd += 1
        }
    }
    return lanes
} */

const loadMutationRate = (): number | undefined => {
    const mutationRate = localStorage.getItem(MUTATION_RATE_KEY)
    if (!mutationRate) return undefined
    return JSON.parse(mutationRate)
}

const saveMutationRate = (mutationRate: number) => {
    localStorage.setItem(MUTATION_RATE_KEY, mutationRate.toString())
}

const loadNumberOfCars = (): number | undefined => {
    const mutationRate = localStorage.getItem(NUMBER_OF_CARS_KEY)
    if (!mutationRate) return undefined
    return JSON.parse(mutationRate)
}

const saveNumberOfCars = (numberOfCars: number) => {
    localStorage.setItem(NUMBER_OF_CARS_KEY, numberOfCars.toString())
}

const loadNeurons = (): Array<number> | undefined => {
    const json = localStorage.getItem(NEURONS_KEY)
    if (!json) return undefined
    const parsedString: string = JSON.parse(json)
    const result = parsedString.split(',').map((v) => Number(v))
    return result
}

const saveNeurons = (numberOfNeurons: string) => {
    localStorage.setItem(NEURONS_KEY, `"${numberOfNeurons}"`)
}
