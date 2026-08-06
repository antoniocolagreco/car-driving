# Tentativi di training: risultati negativi e prove incomplete

Questo documento raccoglie soltanto ciò che è sostenuto da almeno una delle
seguenti fonti:

- un benchmark o una prova interattiva di cui è stato annotato il risultato;
- un commit che descrive esplicitamente l'esperimento e il suo esito;
- un comportamento ancora documentato nel codice o nel README.

Un'implementazione senza una misura non dimostra né che l'idea funzioni né che
non funzioni. Le ipotesi sono quindi tenute separate dai risultati.

Ultimo aggiornamento: 6 agosto 2026.

## Problema da risolvere

Partendo da reti casuali, alcune esecuzioni arrivano a completare il percorso,
mentre altre restano ferme per centinaia di gare fra circa 20 e 32 sorpassi.
L'obiettivo non è ottenere una singola vittoria fortunata, ma aumentare in modo
ripetibile la percentuale di esecuzioni che completano almeno un percorso entro
un limite prestabilito.

Con la configurazione predefinita la rete ha 12 ingressi, livelli nascosti
`16, 12, 8` e 3 uscite: 504 pesi e 39 bias, per un totale di 543 parametri.
Questo numero descrive la dimensione della ricerca, ma da solo non dimostra che
l'evoluzione non possa apprendere da un obiettivo scalare.

## Criterio usato nell'ultimo esperimento

Per la valutazione multi-layout erano stati stabiliti questi gate prima di
eseguire il benchmark:

- smoke test: almeno 2 seed riusciti su 3 entro 100 gare per seed;
- test completo: almeno 8 seed riusciti su 10 entro 200 gare per seed;
- il test completo sarebbe partito soltanto dopo il superamento dello smoke;
- un seed era riuscito soltanto quando almeno una rete completava il percorso.

Lo smoke test è fallito; il test completo non è stato eseguito.

# Esperimenti con un risultato negativo documentato

## 1. Valutare la stessa popolazione su tre layout

### Modifica

La stessa popolazione, con pesi immutati, correva su tre layout di traffico
prima della selezione e della riproduzione. La classifica aggregata considerava,
nell'ordine, layout completati, mediana dei sorpassi normalizzati, risultato
peggiore, tempo di completamento, uso del freno e ordine stabile.

### Risultati

I primi due seed deterministici dello smoke test hanno reso matematicamente
impossibile raggiungere il gate di 2 successi su 3:

| Seed |   Limite | Completamenti | Miglior risultato |
| ---: | -------: | ------------: | ----------------: |
|    1 | 100 gare |             0 |       14 sorpassi |
|    2 | 100 gare |             0 |       25 sorpassi |

Le prove interattive hanno mostrato la stessa forte variabilità:

| Prova                           | Esito osservato                                               |
| ------------------------------- | ------------------------------------------------------------- |
| Prima esecuzione                | vittoria intorno alla generazione 29; 40 sorpassi in 43,03 s  |
| Reset successivo                | nessuna vittoria dopo 200 gare; massimo 28 sorpassi           |
| Prosecuzione dello stesso reset | vittoria intorno alla generazione 101; 40 sorpassi in 74,73 s |
| Reset più recente               | nessuna vittoria dopo 359 gare; massimo 32 sorpassi           |

Con tre layout per generazione, arrivare alla generazione 101 richiedeva circa
300 gare. La modifica ha rallentato la riproduzione senza rendere affidabile il
training ed è stata rimossa.

## 2. Inizializzazione Xavier con bias a zero

L'inizializzazione Xavier è stata provata insieme alla valutazione multi-layout.
I primi due seed non hanno completato il percorso e non è stato osservato un
miglioramento ripetibile nell'interfaccia.

Non è stato eseguito un confronto A/B isolato. La conclusione corretta è quindi
limitata: la combinazione provata ha fallito; non è dimostrato che Xavier, preso
da solo, peggiori il training.

## 3. Bias iniziale degli output `[0.5, -0.5, 0]`

L'obiettivo era far partire le reti orientate verso accelerazione, assenza di
frenata e sterzo neutro.

- in una prova breve, il massimo entro 30 gare è salito da 12 a 20 sorpassi;
- nei due seed successivi non ci sono stati completamenti, con massimi di 23 e
  19 sorpassi.

Il miglioramento del primo seed non si è generalizzato. La modifica è stata
rimossa.

## 4. Eliminare il bonus numerico del freno

Nell'esperimento multi-layout il freno era soltanto l'ultimo spareggio, senza
bonus numerico. Le esecuzioni bloccate a 200 e 359 gare usavano questa regola.

Questo dimostra soltanto che togliere il bonus nella combinazione provata non ha
risolto il problema. Non dimostra che il bonus corrente sia ottimale né isola
l'effetto della sua rimozione.

## 5. Ricompense per azioni vicino agli ostacoli

Tentativi storici documentati in `README.md` e in `src/core/fitness.ts`:

- punti per ogni frame con il freno premuto vicino a un ostacolo: le auto si
  accodavano al traffico e pompavano il freno senza sorpassare;
- punti per ogni frame di sterzata intensa vicino a un ostacolo: le auto
  oscillavano lo sterzo per accumulare ricompensa;
- malus proporzionale alla velocità d'impatto: selezionava auto che si
  schiantavano più lentamente;
- malus a V, minimo alla velocità del traffico: selezionava auto che colpivano
  lateralmente il muro a quella velocità;
- bonus del freno senza richiedere almeno un sorpasso: la popolazione collassò
  sulle auto che frenavano alla partenza e morivano per inattività. Furono
  annotate 24 generazioni consecutive con zero sorpassi nell'intero campo.

Questi risultati mostrano che quelle specifiche ricompense erano sfruttabili.
Non autorizzano la conclusione più ampia che qualunque reward shaping sia
necessariamente inutile.

## 6. Credito parziale per la distanza dalla prossima auto

La distanza minima dalla successiva auto da superare fu usata per ordinare le
reti a pari sorpassi. Su tre prove da 40 gare, i picchi passarono da
`20 / 23 / 18` a `17 / 10 / 14`.

La misura premiava anche chi caricava frontalmente un ostacolo e moriva pochi
pixel più avanti. Il risultato e la motivazione della rimozione sono ancora
documentati in `src/core/fitness.ts` e nel commit `c3c5fbb`.

## 7. Usare il tempo come spareggio prima del traguardo

Quando più reti morivano sullo stesso ostacolo con gli stessi sorpassi, il tempo
premiava chi raggiungeva prima quel punteggio, cioè spesso chi arrivava più
veloce contro il muro. Il commit `c3c5fbb` ha limitato lo spareggio temporale
alle sole reti che completano il percorso.

Questa voce documenta un criterio di selezione ritenuto dannoso e poi rimosso;
non prova, da sola, che la modifica abbia risolto i plateau complessivi.

## 8. Interpolare tutti i parametri verso nuovi valori casuali

La vecchia mutazione spostava ogni parametro verso un valore casuale. Al 10%,
tutti i parametri cambiavano un poco invece di modificarne localmente una parte.
È stato annotato un plateau a 1935 px: la generazione 3 lo raggiunse e le
generazioni dalla 4 alla 12 non migliorarono.

La strategia è stata sostituita con perturbazioni locali applicate a una
probabilità per parametro. Il risultato storico è documentato in
`src/core/neural-network.ts` e nel README.

## 9. Esploratori quasi casuali indipendenti dallo slider

Una fascia della popolazione usava tassi di mutazione fino al 100% anche con lo
slider molto basso. Con lo slider al 2%, furono annotate 22 reti su 100 mutate
oltre il 20% e una al 93%.

Il limite degli esploratori è stato poi legato al valore dello slider. Questo
esperimento dimostra che il vecchio controllo non rappresentava il tasso
richiesto; non dimostra quale distribuzione sia globalmente ottimale.

## 10. Un solo genitore

Con tutta la popolazione derivata da una sola rete, fu annotato un plateau a 6
sorpassi per circa dodici generazioni consecutive. La configurazione corrente
usa quattro genitori. Il dato e la motivazione sono documentati in
`src/core/config.ts`.

## 11. Partenze distribuite sulle tre corsie

Le auto partivano a rotazione dalle corsie `0, 1, 2`. In 21 generazioni, l'élite
ottenne zero sorpassi in 9 casi; tutti e 9 seguivano un vincitore partito dalla
corsia 1 o 2, mentre l'élite veniva poi riposizionata nella corsia 0.

La partenza unica dalla corsia centrale ha eliminato questa differenza di
compito fra concorrenti. Il risultato è documentato in `README.md` e in
`src/core/population.ts`.

## 12. Tenere fisso per sempre lo stesso layout

Un layout fisso rendeva i risultati confrontabili, ma favoriva la
memorizzazione. È stato annotato un plateau a 1935 px per nove generazioni sullo
stesso ostacolo. Il progetto è quindi passato a cambiare layout ogni gruppo di
generazioni.

Non è disponibile una misura multi-seed che quantifichi quanto questa modifica
abbia inciso sul tasso finale di completamento.

## 13. Rimuovere la progressione di difficoltà

Mescolando fin dall'inizio tutti i pattern, gli ostacoli complessi comparivano
prima che la popolazione accumulasse abilità elementari. La variante è descritta
come peggiore nel README ed è stata rimossa.

Non è disponibile nel repository un benchmark multi-seed completo; va quindi
considerata evidenza osservativa, non una stima quantitativa dell'effetto.

## 14. Portare tutti i sensori a 700 px

Il commit `750f72c` assegnava 700 px a tutte le zone percettive. Il revert
`0ba95b7` registra che, durante una prova, la popolazione non sceglieva meglio il
lato da cui passare e perdeva risoluzione sui fianchi.

La prova giustifica il revert di quella configurazione. Non dimostra che le
portate attuali siano ottimali.

# Esperimenti implementati ma senza un esito verificabile

## Quattro linee genetiche separate

Il commit `a3a86da` implementò quattro linee indipendenti (`Igni`, `Aqua`,
`Terra`, `Aer`) e una reinizializzazione parziale delle linee ferme. Il commit fu
poi escluso da `master` tramite reset.

Non è stato trovato un benchmark dell'esperimento. Non va quindi usato per
affermare che quattro linee siano inefficaci o che la diversità non sia il
problema.

## Roster permanente

La branch `roster` contiene i commit `798aec7`, `b4a9008` e `06eddc9`. La
popolazione diventava un roster persistente, con protezione iniziale delle reti
giovani e ricambio di una parte delle reti consolidate.

Nel repository non sono stati trovati log che sostengano i numeri aggiunti nella
precedente versione di questo documento: massimo 20, mediana 10, risultati a
148, 206 o 521 gare, oppure la tabella sul ricambio effettivo. Questi numeri sono
stati rimossi. Senza la fonte originale, il roster non può essere classificato
come successo o fallimento e non consente di escludere la diversità come causa.

## Malus d'impatto e azzeramento degli eliminati

Il commit `2013c8a` reintrodusse un malus proporzionale alla velocità d'impatto e
rimosse il bonus del freno. Il suo stesso messaggio annota sia il precedente
comportamento di “schiantarsi piano” sia una nuova scappatoia: fermarsi e farsi
ritirare dall'idle timeout.

Il commit `11700ab` azzera invece il risultato di chi manca uno dei due timeout.
Questa seconda variante esiste sulla branch `impact-malus` e corrisponde anche
alle modifiche applicative non committate presenti mentre questo documento viene
revisionato. Non è stato trovato un risultato prestazionale, quindi non viene
classificata qui come fallita. Il codice non è stato modificato durante la
revisione del documento.

# Informazioni non ricostruibili

Prima dell'esperimento multi-layout erano state eliminate cinque branch di
prove ed erano stati eseguiti vari tentativi di enhancement o refactoring con
Claude Opus 5.0. Non sono disponibili abbastanza artefatti per descriverne
modifiche e risultati senza inventare dettagli.

Se vengono recuperati commit, screenshot o log, questi tentativi potranno essere
aggiunti indicando esplicitamente la fonte.

# Cosa si può concludere oggi

- Il compito è almeno risolvibile: più reti hanno completato un percorso.
- Il training da zero non è affidabile: esistono reset rimasti senza vittoria
  per 200 e 359 gare.
- Diverse ricompense intermedie hanno creato incentivi ingannevoli, ma non è
  dimostrato che ogni possibile segnale intermedio fallisca.
- La valutazione su tre layout non ha superato il gate concordato e ha ridotto
  di tre volte la frequenza di riproduzione.
- Xavier e rimozione del bonus del freno non sono stati isolati dal resto
  dell'esperimento multi-layout.
- Gli esperimenti disponibili non dimostrano che la diversità genetica sia
  irrilevante: i risultati quantitativi attribuiti al roster non sono
  verificabili.
- Il fatto che la rete abbia 543 parametri e riceva un risultato complessivo non
  rende matematicamente impossibile l'ottimizzazione evolutiva.

Restano ipotesi da verificare, non diagnosi acquisite: convergenza prematura,
fitness raro o ingannevole, perdita di linee utili, rumore dovuto al layout e
mutazioni che rompono abilità coordinate.

# Regole per aggiungere una nuova prova

Ogni nuova voce deve riportare:

1. commit o patch esatta;
2. configurazione usata;
3. seed, numero massimo di gare e criterio di successo;
4. risultati di ogni seed, non soltanto il migliore;
5. indicazione delle altre modifiche attive nello stesso test;
6. distinzione fra osservazione e spiegazione ipotizzata.

Una singola vittoria dimostra che una configurazione può riuscire, non che sia
più affidabile. Un singolo fallimento dimostra che può fallire, non ne stima la
probabilità. I benchmark lunghi vanno eseguiti soltanto dopo smoke test brevi con
output frequente e arresto anticipato.
