# Software Quality Evaluation Report — Car Driving

Ultimo aggiornamento: 2025-09-13

## 1. Project Overview

- Nome: Car Driving
- Descrizione: Simulazione browser-based di guida autonoma con rete neurale feed-forward, rendering su canvas 2D, UI in Astro + Tailwind.
- Dominio / Scopo: Didattico/sperimentale (evoluzione di reti neurali semplici per evitare ostacoli/traffico).
- Funzionalità principali:
  - Simulazione con veicoli “AI” e traffico su strada a più corsie
  - Visualizzazione della rete neurale attiva (pesi, input/output)
  - Evoluzione del modello: mutazione, merge, salvataggio/restore da localStorage
  - Controlli UI: mutation rate, numero di auto, layers/neuroni, round/backup/restore
  - Layout Astro con Tailwind e Client Router (transitions)
- Caratteristiche:
  - Stack: Astro 5, TypeScript, Tailwind, ESLint + Prettier
  - Canvas rendering 2D; nessuna libreria esterna per la fisica

## 2. Technical Quality

- Architettura: 6/10 — Struttura semplice e funzionale; logica simulazione/UI/persistenza accorpate in `libs/self-driving-car.ts`. Margini per separazione dei ruoli e servizi dedicati.
- Scalabilità: 5/10 — Single-thread sul main thread; gestione FPS artigianale; mancano astrazioni per parallelizzare o ridurre il carico (p.es. web worker) in futuro.
- Performance: 6/10 — Canvas con `requestAnimationFrame`, ma throttle fisso e molte operazioni per frame (drawing NN). Ottimizzabile con cache, save/restore del contesto e riduzione della frequenza di rendering secondario.
- Affidabilità: 5/10 — Timer ricorsivi legati a snapshot di array; rischio di riferimenti obsoleti. Mancano cleanup su unmount/navigazione.
- Sicurezza: 6/10 — App client-side, nessun input esterno critico. Uso di `localStorage` limitato a parametri/modelli. Nessun segreto hardcoded.

## 3. Code Quality

- Manutenibilità: 5/10 — File corposi e responsabilità miste (SRP violato in punti). Costanti e magic number locali.
- Testabilità: 3/10 — Assenza di test. Logica accoppiata a DOM e Canvas rende difficile testare core logico.
- Riutilizzo & Modularità: 5/10 — Buona suddivisione dei model, ma orchestrazione e servizi accorpati. Alias parziali (mancano `@models`).
- Type Safety: 7/10 — TypeScript ovunque, lint severo su `any`. Persistenza via JSON perde i prototype (ok per ora, ma migliorabile con factory).
- Pattern: 5/10 — Esistono classi chiare (NeuralNetwork, Layer, Sensor, Vehicle), ma mancano pattern per lifecycle/persistenza/eventi.
- Consistenza: 6/10 — Stile coerente; qualche import relativo vs alias. Convenzioni file rispettate.
- Documentazione interna: 3/10 — Pochi commenti esplicativi/README minimale.

## 4. User Experience (se applicabile)

- Usabilità / DX: 6/10 — UI semplice e chiara; controlli essenziali presenti. Manca feedback su errori/stati e help testuale.
- Accessibilità (UX/UI): 4/10 — Label ok, ma contrasti/ARIA e focus management non trattati. Canvas privo di alternative.

## 5. Process & Operations

- Deployment & CI/CD: 7/10 — Config Astro con `base` per GitHub Pages e script `deploy:github`. CI non visibile nel repo.
- Monitoring & Observability: N/A — Non applicabile lato client; nessun tracing/telemetria.
- Supporto & Tooling: 6/10 — ESLint/Prettier/Tailwind impostati; mancano task di test e check di qualità automatizzati.

## 6. Overall Value

- Aderenza ai requisiti: 7/10 — Copre obiettivo educativo/sperimentale.
- Costo di gestione: 8/10 — Semplice, poche dipendenze, hosting statico.
- Flessibilità: 6/10 — Struttura pronta a estensioni, ma necessita refactor per crescere in modo pulito.

---

### Note finali

- Punti di forza:
  - Codice TypeScript pulito e leggibile nei model; visualizzazione rete utile
  - Setup Astro moderno con Tailwind, lint e formattazione
  - Parametri di simulazione esposti via UI e persistenza `localStorage`
- Debolezze:
  - Orchestrazione monolitica in `self-driving-car.ts` (UI + simulazione + persistenza)
  - Timer ricorsivi con riferimenti a snapshot di array (rischio logico)
  - Mancanza di cleanup su unmount e di test automatici
  - Asset audio fuori da `public/` e path non robusti per build
- Punteggio complessivo: 5.9/10

---

## Refactor Roadmap (prioritizzata)

Legenda:

- [ ] To do  - [x] Done  - [~] In progress

### Fase 1 — Fondamenta (stabilità, SRP, build)

- [~] Spostare gli asset audio in `public/audio/` e aggiornare `AudioPlayer` per usare `/audio/scratch.mp3` e `/audio/gameover.mp3` (compatibile con build Astro)
  - Codice aggiornato per usare `BASE_URL` e path pubblici; resta da spostare fisicamente i file `audio/*.mp3` in `public/audio/`.
- [x] Introdurre cleanup del lifecycle: esporre `createSimulation(container)` che ritorna `{ start, stop, destroy }`; chiamare `destroy` su eventi Astro Transitions (`astro:before-swap`) per rimuovere listeners, timers e canvas
- [x] Estrarre costanti e chiavi di storage da `libs/self-driving-car.ts` in `libs/config.ts` (DEATH_TIMER_SECONDS, ecc.)
- [ ] Correggere i timer ricorsivi:
  - [ ] Evitare di passare snapshot di array a `removeLateCars`/`giveDemerits`; usare funzioni selettori o leggere dallo stato corrente al momento del tick
  - [ ] Consolidare la logica di “demerits” e “late cars” in un singolo scheduler con `setInterval`/`requestAnimationFrame` tick-based
- [ ] Canvas state: sostituire `translate` + anti-translate con `ctx.save()`/`ctx.restore()` per garantire ripristino anche su errori
- [ ] Aggiungere alias `@models/*` in `tsconfig.json` e aggiornare import relativi (coerenza con convenzioni esistenti)

- [x] Suddividere `libs/self-driving-car.ts` in moduli:
  - [x] `simulation-engine.ts` (game loop, integrazione fisica, collisioni, punti)
  - [x] `traffic-service.ts` (generazione traffico e aggiornamento)
  - [x] `persistence.service.ts` (save/restore/mutate/merge rete neurale + typed storage)
  - [x] `ui-controller.ts` (binding dei controlli DOM; nessuna logica di simulazione)
- [ ] Definire piccole interfacce (contratti) per engine e servizi: input/output, errori, eventi
- [ ] Introdurre un oggetto `SimulationState` come singola fonte di verità per auto, traffico e parametri

### Fase 3 — Persistenza e modelli

- [ ] Implementare `NeuralNetwork.toJSON()` e `NeuralNetwork.fromJSON()` per reidratare istanze con prototype corretto
- [ ] Creare un wrapper type-safe su `localStorage` (e.g., `storage.get<T>(key)` / `storage.set(key, value)`)
- [ ] Validare input utente (neuroni, mutation rate, numero auto) con parsing sicuro e fallback

### Fase 4 — Rendering e performance

- [ ] Sostituire la logica FPS target con delta-time nel game loop (accumulo/step)
- [ ] Ridurre la frequenza di redraw della rete neurale (p.es. ogni N ms o al cambio di auto attiva)
- [ ] Introdurre piccoli cache per geometrie statiche (strada, map) ed evitare ricostruzioni costose
- [ ] Opzionale: valutare un Web Worker per calcoli NN/traffico su dataset grandi

### Fase 5 — Qualità, test e DX

- [ ] Introdurre Vitest + jsdom per test unitari dei modelli: `utils`, `trigonometry`, `neural-network` (feedForward invariants)
- [ ] Aggiungere check CI (lint, typecheck, test) su PR
- [ ] ESLint: aggiungere `import/order`, `no-floating-promises`; mantenere `no-explicit-any`
- [ ] Documentazione: arricchire README (how to run, hotkeys, parametri, troubleshooting)

### Fase 6 — Accessibilità e UX

- [ ] Migliorare labels/ARIA dei controlli; focus state visibili
- [ ] Fornire feedback utente (toast/testo) al salvataggio/restore rete e su “round end”
- [x] Fornire testo alternativo e descrizione per le canvas (per screen reader)

---

## Rischi e mitigazioni

- Persistenza JSON delle classi: mitigare con factory `fromJSON` e type guards
- Timer e memory leak: introdurre `destroy()` e usare `AbortController` per listeners
- Asset path in produzione: migrare in `public/` per URL stabili

## Metriche di successo (DoD)

- Build/lint/test verdi in CI
- Nessun memory leak navigando tra pagine/round (profiling devtools > timeline)
- 80%+ coverage su `utils`, `neural-network`, `sensor`
- Nessuna regressione percepibile di FPS con 50-100 auto
