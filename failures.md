# Tentativi di training falliti

Questo documento raccoglie i tentativi noti che non hanno migliorato in modo
ripetibile l'addestramento da zero. Lo scopo e evitare di ripetere esperimenti
gia smentiti da benchmark o prove interattive.

Ultimo aggiornamento: 6 agosto 2026.

## Criterio usato per dichiarare un miglioramento

Il problema da risolvere non e ottenere una singola vittoria fortunata, ma
ridurre la probabilita che una popolazione resti bloccata per centinaia di
corse.

Per l'ultimo intervento erano stati fissati questi gate:

- smoke test: almeno 2 seed riusciti su 3, con un massimo di 100 corse per seed;
- test completo, da eseguire solo dopo lo smoke: almeno 8 seed riusciti su 10,
  con un massimo di 200 corse per seed;
- una corsa e riuscita soltanto quando almeno una rete completa il percorso.

L'intervento non ha superato lo smoke test. Il test completo non e quindi stato
eseguito.

## 1. Valutazione della stessa popolazione su tre percorsi

### Ipotesi

La selezione su un solo percorso poteva promuovere una rete fortunata e perdere
una rete generalmente migliore. Per ridurre il rumore, la stessa identica
popolazione e stata valutata, senza mutazioni intermedie, su tre layout di
traffico prima di riprodursi.

La classifica aggregata era lessicografica:

1. numero di percorsi completati;
2. mediana dei sorpassi normalizzati per il traffico presente;
3. risultato sul layout peggiore;
4. tempo mediano di completamento;
5. uso del freno soltanto come ultimo spareggio;
6. ordine stabile della popolazione.

Sono stati inoltre separati gli esiti della guida manuale dalla valutazione
automatica: una dimostrazione manuale poteva essere promossa solo vincendo, e
non poteva costituire una prova parziale del batch automatico.

### Risultati

Lo smoke benchmark deterministico e fallito sui primi due seed, rendendo gia
impossibile il risultato minimo di 2 successi su 3:

| Seed |    Limite | Percorsi completati | Miglior numero di sorpassi |
| ---: | --------: | ------------------: | -------------------------: |
|    1 | 100 corse |                   0 |                         14 |
|    2 | 100 corse |                   0 |                         25 |

Le prove nell'interfaccia hanno confermato una varianza molto elevata:

| Prova                           | Esito osservato                                                    |
| ------------------------------- | ------------------------------------------------------------------ |
| Prima esecuzione                | vittoria intorno alla generazione 29, 40 sorpassi in 43,03 s       |
| Reset successivo                | nessuna vittoria dopo 200 corse, miglior risultato 28              |
| Prosecuzione dello stesso reset | vittoria solo intorno alla generazione 101, 40 sorpassi in 74,73 s |
| Reset piu recente               | nessuna vittoria dopo 359 corse, miglior risultato 32              |

Con tre layout per generazione, una vittoria alla generazione 101 richiede circa
300 corse. La valutazione multipla ha quindi rallentato di circa tre volte la
riproduzione, senza eliminare i plateau o rendere affidabile il training.

### Conclusione

Tentativo respinto e rimosso. Una vittoria isolata non compensa due reset capaci
di restare bloccati per 200 e 359 corse. La modifica riduceva il rumore della
valutazione, ma non creava un percorso evolutivo per uscire dai massimi locali.

## 2. Inizializzazione Xavier con bias a zero

### Ipotesi

Pesi iniziali scalati in funzione del fan-in e fan-out potevano evitare
saturazioni iniziali e produrre reti casuali con segnali piu utilizzabili.

### Risultato

La modifica e stata provata insieme alla valutazione multi-layout. Non ha
permesso ai primi due seed dello smoke test di completare il percorso e non ha
ridotto la varianza osservata nell'interfaccia.

### Conclusione

Tentativo respinto e rimosso. Non esiste evidenza A/B di un miglioramento
ripetibile; l'evidenza integrata e negativa.

## 3. Bias iniziale degli output verso la guida

### Ipotesi

Un bias iniziale degli output pari a `[0.5, -0.5, 0]` doveva favorire
accelerazione, assenza di frenata e sterzo neutro, evitando popolazioni iniziali
incapaci di partire.

### Risultati

- su una prova breve del seed 1, il massimo a 30 corse e salito da 12 a 20;
- nello smoke successivo, i primi due seed hanno comunque ottenuto zero
  completamenti, con picchi rispettivamente di 23 e 19 sorpassi.

### Conclusione

Il miglioramento locale sul primo seed non si e generalizzato. Il tentativo e
stato scartato e rimosso prima del rollback finale.

## 4. Rimozione del bonus numerico del freno

### Ipotesi

Il bonus del freno poteva premiare un'azione invece del risultato e promuovere
reti con meno sorpassi. E stato rimosso dal punteggio e mantenuto soltanto come
ultimo spareggio nella classifica aggregata.

### Risultato

I fallimenti dello smoke benchmark e i reset bloccati a 200 e 359 corse si sono
verificati con questa regola. La rimozione del bonus non ha reso affidabile il
training.

### Conclusione

Tentativo respinto e rimosso insieme alla valutazione multi-layout. Questo non
dimostra che il bonus corrente sia ottimale; dimostra soltanto che eliminarlo in
questa configurazione non risolve il problema.

## 5. Benchmark deterministico e modifiche di supporto

Per misurare l'esperimento era stato aggiunto un benchmark headless con seed
riproducibili, avanzamento frequente, stima del tempo residuo e arresto anticipato
quando il gate diventava irraggiungibile. Erano state aggiunte anche modifiche di
supporto:

- sorgente casuale iniettabile per inizializzazione e mutazione;
- persistenza versione 10 con numero di auto nel traffico per normalizzare i
  risultati storici;
- scarto dei batch parziali a reset, restart o cambio di architettura;
- callback separata per ogni layout e persistenza soltanto a batch completo;
- test unitari per aggregazione, migrazione e ciclo di simulazione.

I test tecnici, il typecheck, il lint e la build passavano, ma verificavano la
correttezza dell'implementazione, non l'efficacia evolutiva. Il benchmark
funzionale ha invece respinto l'ipotesi. Tutto il codice di supporto e stato
rimosso con l'esperimento; i risultati negativi restano documentati qui.

## 6. Reward shaping gia provato in precedenza

Questi tentativi erano gia documentati nel progetto e non vanno ripetuti:

- premio per ogni frame con il freno premuto vicino a un ostacolo: le auto si
  accodavano a un veicolo lento e coltivavano punti senza sorpassare;
- premio per sterzata intensa vicino a un ostacolo: le auto oscillavano il
  volante per accumulare ricompensa;
- malus d'impatto proporzionale alla velocita: selezionava una guida sempre piu
  timida;
- malus d'impatto a V, minimo alla velocita del traffico: selezionava auto che
  colpivano lateralmente il muro proprio a quella velocita;
- bonus del freno senza il requisito di almeno un sorpasso: collasso in una
  generazione su auto che frenavano alla partenza, non sorpassavano nessuno e
  morivano per idle timeout; furono osservate 24 generazioni consecutive con
  zero sorpassi nell'intera popolazione.

Il pattern comune e che l'evoluzione ottimizza letteralmente la ricompensa
laterale, non il comportamento di guida desiderato.

## 7. Mutazione e costruzione del percorso gia provate in precedenza

Anche questi tentativi erano gia stati misurati e scartati:

- interpolare ogni parametro verso un nuovo valore casuale: anche al 10% tutti
  i parametri si spostavano, impedendo la ricerca locale; il vincitore si
  bloccava entro circa tre generazioni;
- banda esplorativa indipendente dal mutation rate scelto: con slider al 2%, 22
  auto su 100 mutavano comunque oltre il 20% e una arrivava al 93%, diventando
  quasi casuale;
- mantenere per sempre lo stesso percorso: la rete memorizzava il layout; e
  stato osservato un plateau a 1935 px per nove generazioni consecutive;
- rimuovere la rampa di difficolta e mescolare tutto il percorso: ostacoli
  complessi comparivano troppo presto e le abilita elementari non riuscivano ad
  accumularsi tra una generazione e la successiva.

## 8. Tentativi non ricostruibili

Prima di questo intervento sono state eliminate cinque branch di esperimenti e
sono stati eseguiti almeno cinque tentativi di enhancement o refactoring con
Claude Opus 5.0. I branch e i relativi risultati dettagliati non sono disponibili
nel worktree corrente, quindi non e corretto attribuire loro modifiche o numeri
specifici senza artefatti. Il solo dato certo e che non hanno prodotto un
miglioramento ritenuto utile.

Se in futuro si recuperano commit, patch o log di quelle prove, vanno aggiunti a
questa sezione prima di riprendere una delle stesse direzioni.

## Diagnosi che resta aperta

I risultati sono bimodali: alcune inizializzazioni scoprono una sequenza utile e
vincono, altre convergono tra 20 e 32 sorpassi per centinaia di corse. Poiche una
rete ogni tanto completa il percorso, sensori, fisica e capacita della rete sono
sufficienti almeno in linea di principio. Il sospetto principale resta quindi
la convergenza prematura di linee genetiche troppo simili combinata con un
segnale di fitness discontinuo: una manovra preparatoria migliore non riceve
credito se l'auto muore comunque sullo stesso ostacolo.

Questa e una diagnosi da verificare, non un risultato. Prima di un altro refactor
servono misure sulla diversita delle linee, sul ricambio dei genitori, sulla
distanza genetica dalle reti parentali e sui risultati per singolo layout. Non
va avviato un altro benchmark lungo senza prima ottenere evidenza da queste
misure e da smoke test brevi con arresto anticipato.
