import { CONSTANTS } from '../constants'
import Persistence from '../libs/persistence'
import { generateCars, getBestCar, getLeadingCar, getRemainingCars } from '../libs/simulation'
import { generateTraffic } from '../libs/traffic'
import NeuralNetwork from './neural-network'
import type { SimulationConfig } from './simulation-config'
import { SimulationState } from './simulation-state'
import type World from './world'

/**
 * Gestisce l'intera simulazione di auto a guida autonoma
 * Coordina la generazione delle auto, il traffico, l'evoluzione delle reti neurali
 * e il ciclo di vita della simulazione (restart, game over, evoluzione)
 */
export class Simulation {
    /** Il mondo virtuale contenente la mappa e la strada */
    private world: World
    /** Configurazione della simulazione (numero auto, tasso mutazione, ecc.) */
    private config: SimulationConfig
    /** Stato corrente della simulazione (auto attiva, traffico, punteggi, ecc.) */
    private state: SimulationState

    /**
     * Crea una nuova simulazione e la avvia immediatamente
     * @param world - Il mondo in cui far girare la simulazione
     * @param config - La configurazione iniziale della simulazione
     */
    constructor(world: World, config: SimulationConfig) {
        this.world = world
        this.config = config
        this.state = new SimulationState()
        this.restart()
    }

    /** Restituisce lo stato corrente della simulazione */
    getState(): SimulationState {
        return this.state
    }

    /** Aggiorna la configurazione della simulazione */
    updateConfig(config: SimulationConfig): void {
        this.config = config
    }

    /**
     * Riavvia completamente la simulazione:
     * - Resetta lo stato di game over
     * - Carica la migliore rete neurale salvata
     * - Genera nuove auto con mutazioni della rete migliore
     * - Crea nuovo traffico casuale
     */
    restart(): void {
        this.state.setGameover(false)
        this.state.setGameoverAt(null)

        // Carica la migliore rete neurale salvata in precedenza
        const bestNetwork = Persistence.loadBestNetwork()

        // Confronta la rete neurale dell'auto attiva con quella salvata
        // Se l'auto attiva ha ottenuto un punteggio migliore, la usa come base
        // const activeNetwork = this.state.getActiveCar()?.getNetwork()

        // if (activeNetwork && bestNetwork) {
        //     const activeNetworkPoints = activeNetwork.getBestScore()
        //     const bestNetworkPoints = bestNetwork.getBestScore()

        //     if (activeNetworkPoints > bestNetworkPoints) {
        //         bestNetwork = activeNetwork
        //     }
        // }

        // Genera una nuova popolazione di auto basata sulla migliore rete neurale
        this.state.setAllCars(
            generateCars(
                this.config.getCarsQuantity(),
                this.config.getNetworkArchitecture(),
                this.world.getRoad(),
                bestNetwork,
                this.config.getMutationRate(),
                this.config.getSensorCount(),
                this.config.getSensorSpread(),
            ),
        )

        // Inizializza lo stato delle auto
        this.state.setRemainingCars(this.state.getAllCars())
        // Tutte le auto iniziano inattive (come "fantasmi")
        this.state.getRemainingCars().forEach((c) => c.setActive(false))
        // La prima auto diventa quella attiva (quella che seguiamo)
        this.state.setActiveCar(this.state.getRemainingCars()[0])
        this.state.setTrafficCounter(0)

        // Configura l'auto attiva (quella che seguiamo con la telecamera)
        if (this.state.getActiveCar()) {
            this.state.getActiveCar()!.setFillStyle('white') // Colore bianco per distinguerla
            this.state.getActiveCar()!.setActive(true)
        }

        // Assegna le reti neurali alle auto
        if (bestNetwork && this.state.getActiveCar()) {
            // L'auto attiva usa la migliore rete neurale senza mutazioni
            this.state.getActiveCar()!.setNetwork(bestNetwork)

            if (this.state.getActiveCar()!.getNetwork()) {
                // Tutte le altre auto ricevono versioni mutate della rete migliore
                // Questo crea diversità genetica nella popolazione
                for (let index = 1; index < this.state.getAllCars().length; index++) {
                    this.state
                        .getRemainingCars()
                        [
                            index
                        ].setNetwork(NeuralNetwork.getMutatedNetwork(bestNetwork, this.config.getMutationRate()))
                }
            }
        }

        // Genera il traffico casuale sulla strada
        this.state.setTraffic(generateTraffic(CONSTANTS.trafficRows, this.world.getRoad()))
    }

    /**
     * Termina il round corrente e avvia il timer per il game over
     * Dopo alcuni secondi la simulazione si riavvierà automaticamente
     */
    endRound(): void {
        this.state.setGameover(true)
        this.state.setGameoverAt(performance.now())
    }

    /**
     * Aggiorna lo stato della simulazione ad ogni frame:
     * - Calcola quali auto sono ancora vive
     * - Identifica l'auto con il punteggio migliore
     * - Aggiorna l'auto attiva (quella seguita dalla telecamera)
     * - Mantiene aggiornato il record di punteggio della rete neurale
     */
    update(): void {
        // Filtra le auto ancora in gioco (non morte)
        this.state.setRemainingCars(getRemainingCars(this.state.getAllCars()))
        // Trova l'auto con il punteggio più alto
        this.state.setBestCar(getBestCar(this.state.getAllCars()))
        // Seleziona quale auto seguire: la migliore se è game over, altrimenti una viva
        if (this.state.isGameover() && this.state.getBestCar()) {
            this.state.setActiveCar(this.state.getBestCar())
        } else {
            // Solo se ci sono auto rimaste, altrimenti mantieni l'active car precedente
            const remainingCars = this.state.getRemainingCars()
            if (remainingCars.length > 0) {
                this.state.setActiveCar(getLeadingCar(remainingCars))
            }
            // Se remainingCars.length === 0, activeCar resta quella precedente (bestCar)
        }

        // Aggiorna continuamente il record di punti della rete neurale attiva
        // Questo serve per tenere traccia del miglior punteggio mai raggiunto
        const activeCar = this.state.getActiveCar()
        if (!activeCar) {
            return
        }

        const network = activeCar.getNetwork()
        if (!network) {
            return
        }

        const currentPoints = activeCar.getStats().getTotalScore()
        network.updatePointsRecordIfBetter(currentPoints)
    }

    /**
     * Controlla le condizioni di game over e gestisce il riavvio automatico:
     * 1. Se è già game over, aspetta il tempo di visualizzazione e poi riavvia
     * 2. Se non ci sono più auto vive, salva la migliore rete e termina il round
     *
     * @param currentTimestamp - Timestamp corrente per calcolare la durata del game over
     * @returns true se la simulazione è stata riavviata, false altrimenti
     */
    checkGameOver(currentTimestamp: number): boolean {
        const isGameover = this.state.isGameover()
        const gameoverTimestamp = this.state.getGameoverAt()

        // Se è game over e sono passati abbastanza secondi, riavvia la simulazione
        if (
            isGameover &&
            gameoverTimestamp &&
            currentTimestamp - gameoverTimestamp >= CONSTANTS.gameoverDuration
        ) {
            this.restart()
            this.state.setGameoverAt(null)
            return true
        }

        const remainingCars = this.state.getRemainingCars()
        const bestCar = this.state.getBestCar()

        // Se tutte le auto sono morte, gestisci il risultato del round
        if (remainingCars.length === 0 && !isGameover) {
            if (bestCar) {
                // C'è una vincitrice: salva la sua rete e continua l'evoluzione
                const bestNetwork = bestCar.getNetwork()
                if (bestNetwork) {
                    bestNetwork.setSurvivedRounds(bestNetwork.getSurvivedRounds() + 1)
                    const currentPoints = bestCar.getStats().getTotalScore()
                    bestNetwork.updatePointsRecordIfBetter(currentPoints)
                    Persistence.saveBestNetwork(bestNetwork)
                }
            }
            this.endRound()
            return true
        }

        return false
    }

    updateVehicles(): void {
        // Update AI-controlled cars
        for (const car of this.state.getAllCars()) {
            car.updateStatus(this.state.getTraffic(), this.world.getRoad().getBorders())
        }

        // Update traffic vehicles
        for (const vehicle of this.state.getTraffic()) {
            vehicle.updateStatus(this.state.getTraffic(), this.world.getRoad().getBorders())
        }
    }

    /**
     * Salva un backup della rete neurale dell'auto attiva
     * Utile per fare un "salvataggio manuale" prima di sperimentare
     * @returns true se il salvataggio è riuscito, false altrimenti
     */
    saveNetwork(): boolean {
        if (this.state.getActiveCar()?.getNetwork()) {
            Persistence.saveNetworkBackup(this.state.getActiveCar()!.getNetwork()!)
            return true
        }
        return false
    }

    /**
     * Ripristina l'ultimo backup della rete neurale salvato
     * Lo imposta come nuova "migliore rete" per la prossima generazione
     * @returns true se il ripristino è riuscito, false se non c'era alcun backup
     */
    restoreNetwork(): boolean {
        const restored = Persistence.loadNetworkBackup()
        if (restored) {
            Persistence.saveBestNetwork(restored)
            return true
        }
        return false
    }

    /**
     * Cancella completamente la migliore rete neurale salvata
     * La prossima simulazione ripartirà da zero con reti casuali
     */
    resetNetwork(): void {
        Persistence.clearBestNetwork()
    }

    /**
     * Forza l'evoluzione salvando manualmente la rete dell'auto migliore
     * Incrementa i round sopravvissuti e aggiorna il record di punteggio
     * Utile quando l'utente vuole "promuovere" una rete promettente
     * @returns true se l'evoluzione è riuscita, false altrimenti
     */
    evolveNetwork(): boolean {
        if (this.state.getBestCar()?.getNetwork()) {
            const bestCar = this.state.getBestCar()
            if (!bestCar) {
                return false
            }
            const bestNetwork = bestCar.getNetwork()
            if (!bestNetwork) {
                return false
            }
            const bestNetworkPoints = bestCar.getStats().getTotalScore()

            // Incrementa i survived rounds quando si evolve manualmente
            bestNetwork.setSurvivedRounds(bestNetwork.getSurvivedRounds() + 1)

            // Aggiorna il record di punti se è maggiore
            bestNetwork.updatePointsRecordIfBetter(bestNetworkPoints)

            Persistence.saveBestNetwork(bestNetwork)
            return true
        }
        return false
    }
}
