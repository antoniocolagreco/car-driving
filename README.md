# 🚗 Self-Driving Car: a readable genetic algorithm

A population of cars learns to drive a three-lane road by natural selection. The autonomous
search needs no training data or gradients: every car has a small feed-forward neural
network, the ones that drive best father the next generation, and after a few dozen
generations they overtake traffic on their own. Manual driving adds a second learning path:
real-time backpropagation from the player's controls.

Built with **Astro**, **TypeScript** and a plain **HTML5 canvas**. No game engine, no ML
library.

## 🎮 [Live demo](https://antoniocolagreco.github.io/car-driving)

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![Astro](https://img.shields.io/badge/Astro-FF5D01?logo=astro&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)

## Quick start

```bash
pnpm install
pnpm dev        # http://localhost:4321/car-driving
```

```bash
pnpm test       # unit tests for the whole simulation core
pnpm validate   # astro check + typecheck + lint + test
pnpm build      # production build
```

Requires Node 24+ and pnpm.

## Architecture

The codebase is split by _dependency direction_, which is what keeps it testable:

```
src/
├── core/     pure simulation: no DOM, no canvas, no localStorage, fully unit tested
├── render/   draws a given state onto a canvas; reads state, mutates nothing
├── ui/       DOM widgets, HUD, keyboard, persistence
├── app.ts    the only module that knows about all three
└── components/ layouts/ pages/   Astro presentation
```

That rule earns its keep: because `core/` has no browser dependencies, the physics, the
sensors, the network and the reward system are all directly unit-testable, and the
simulation could run headless without touching a line of it.

| Module                   | Responsibility                                               |
| ------------------------ | ------------------------------------------------------------ |
| `core/geometry.ts`       | Immutable `Vec2`/`Segment`/`Polygon`, intersections          |
| `core/math.ts`           | `lerp`, `clamp`, `normalize`, `tanh`                         |
| `core/random.ts`         | Seeded RNG, so a given course is reproducible                |
| `core/neural-network.ts` | The network as plain data: forward pass, mutation, save/load |
| `core/sensor.ts`         | Eleven perception areas plus temporal front-closing sensing  |
| `core/car.ts`            | Car state and time-based physics, analog throttle and brake  |
| `core/road.ts`           | Lane geometry and guard rails                                |
| `core/traffic.ts`        | The course, as data: row patterns ramped by difficulty       |
| `core/fitness.ts`        | **The reward system**                                        |
| `core/population.ts`     | Generation building, elitism, mutation tiers                 |
| `core/simulation.ts`     | The step loop and the generation lifecycle                   |
| `core/config.ts`         | Every tunable number, each with its rationale                |

## How a car drives

Each step, for every living car:

1. **Sense**. Eleven fixed areas surround the front and flanks: three 15° triangles per side
   through ±45°, one wider lateral triangle per side from ±45° through ±90°, plus a
   car-width front rectangle and one full-length side area projected laterally on each
   flank. Each returns `0` clear to `1` touching. The front rectangle looks 700 px ahead
   and each step outwards looks 100 px less, down to 200 px at the doors.
2. **Think**. Those readings plus the car's normalized speed are fed forward through the
   network. The architecture is always `[12, ...hiddenLayers, 3]`: eleven areas followed
   by car speed.
3. **Act**. The three outputs are `[throttle, brake, steering]`. Throttle and steering are
   analog in `[-1, 1]`; brake is binary, fully off through `0.5` and fully on above it.
   The car physics still accepts pressure in `[0, 1]`, but the neural autopilot deliberately
   supplies only the two physical commands `0` and `1`.
4. **Score**. Every new overtake is worth one point, plus one flat bonus the first time
   the brake is used while moving, and only for a car that passed somebody. Nothing else
   adds or removes any.

Physics runs on a **fixed 60 Hz timestep** with an accumulator, so behaviour is identical
regardless of display refresh rate: a slow frame simply runs the steps it owes, back to
back. The catch-up is capped at `SIMULATION.maxStepsPerFrame`, and time beyond the cap is
dropped rather than banked, because a tab left in the background must not come back and
fast-forward a whole round in one frame.

## How a generation evolves

Two networks are worth naming, and they are not the same one.

The **Winner** is the white car: whoever won the previous successful race, and the network
every other car in the field is a mutation of. Every completed race elects its own best
eligible result as the next Winner, by most overtakes and then by the time it took to
reach that total. It changes almost every generation, and nothing shields an incumbent:
the round's winner takes the seat even when it passed fewer cars than the network it
replaces, because counts earned on different course layouts were never comparable in the
first place.

The **Champion** is the record holder: the fastest network ever to finish the whole course.
It is saved with the run that earned it, its time and its overtake count, and only a
strictly faster finish replaces it. Nothing else can: not more overtakes, not a longer
survival, not a Reset. It takes no part in the race until you press **Load Champion**, which loads it as the
Winner and breeds the next generation from it.

The field itself is built from the Winner like this:

| Share of the population | Mutation rate                   | Purpose                          |
| ----------------------- | ------------------------------- | -------------------------------- |
| car 0 (elite)           | none, the Winner itself         | the Winner races again untouched |
| 25 %                    | 1 %                             | refine what already works        |
| 35 %                    | between 1 % and the chosen rate | small variations                 |
| 25 %                    | exactly the chosen rate         | the main search                  |
| 15 %                    | up to 4× the chosen rate        | explorers that find new tactics  |

A single mutation rate is a bad bet: too low and the population never explores, too high
and it forgets what the Winner already knew. Spreading the budget across bands hedges
both ways in every generation, with the weight on the refining side, because the point
of a generation is to improve on the Winner, not to re-roll it.

Every band is expressed as a multiple of the rate on the slider, and that matters: the
explorers used to be mutated somewhere between the slider and 100 %, so asking for a 2 %
mutation still produced 22 near-random cars out of 100. The slider has to mean something.

Every competitor, the player car included, starts from the same spot in the middle lane.
They used to be spread across the lanes round-robin (`0, 1, 2, 0, ...`), and that quietly
made the start lane part of the score. These networks drive a learned trajectory rather
than a lane-aware policy, so the weights that pass eight cars from lane 1 drive straight
into the right-hand rail from lane 0. The elite is always car 0 and therefore always
restarted in lane 0, while the winner it carries had almost never won there: measured over
21 generations it scored nothing in 9 of them, and every one of those 9 followed a winner
that had come from lane 1 or 2, never from lane 0. Ranking a field whose members ran from
different lanes also compares them on different tasks, so the best network was partly
whoever drew the lane that suited its trajectory. With one start line the elite matched or
beat its previous score in 22 of 29 generations instead of almost never, and the seven
exceptions were all the opening round of a new course layout.

The next generation is bred from the best few networks (`PARENT_COUNT`), not only from
the winner: a field that is entirely variations of one network is a hill climber wearing
a genetic algorithm's clothes, and it stalls as soon as that one network sits in a local
optimum. The refining quarter is the exception, since those cars always descend from the
Winner itself, because their job is to improve on the best network there is, and handing
a quarter of the field to a weaker parent only dilutes the line that is winning. Everybody
else is spread across the parents round-robin, which is what keeps rival strategies alive.

One thing overrides all of it: a round won by a human demonstration hands the **whole**
parent pool to the network that was just taught (see below).

## The reward system

This is where the interesting failure modes live, so it is worth reading
`src/core/fitness.ts` in full. The guiding rule:

> **Reward outcomes, never actions.**

An earlier version of this project paid a car per frame for having the brake pressed
near an obstacle, and per frame for steering hard near an obstacle. Both sound like
"good driving". Evolution found the exploit immediately: the best strategy became
tucking in behind a slow traffic car and staying there forever, pumping the brake and
wiggling the wheel, farming reward frames without ever overtaking.

That lesson was learned twice more before the whole idea of side incentives was dropped.
A crash malus that scaled with impact speed promoted, at equal overtakes, whichever car
had hit softest, so the population evolved towards timid driving. Reshaping that malus
into a V, cheapest at the traffic's own speed, produced cars that drove into the wall
sideways at exactly that speed. Each fix was reasonable, each was gamed, and each took a
few dozen generations to be found. A reward is an instruction, and the population follows
the instruction rather than the intention behind it.

So the instruction is the goal itself, plus one ignition that is built to expire:

| Event                                                      | Score effect     |
| ---------------------------------------------------------- | ---------------- |
| Overtaking one traffic car                                 | +1 point         |
| Having braked while moving, if at least one car was passed | +10 points, once |

Nothing else scores: not progress, speed, survival, steering, staying alive, and not
crashing either. A wreck is not fined, it simply stops overtaking while everybody else
keeps going, which costs it the only currency there is.

The brake bonus (`BRAKE_DISCOVERY_BONUS`) exists because half the row-to-row transitions
in a course cannot be taken at full throttle, so a car that never finds the pedal has a
ceiling it cannot pass, and the first press pays nothing by itself. Ten points is more
than a typical round's overtake count, so while braking is rare a braking car outranks a
non-braking one; once the whole field brakes, every car carries the same +10 and the
ranking is decided by overtakes again. Its two guards are what make it survivable rather
than another exploited knob: it pays once per race, never per frame, and it needs at
least one real overtake. Ungated it was measured collapsing the population in a single
generation onto cars that braked at the start line, passed nobody, scored 10 and died on
the idle timeout, with zero overtakes in the whole field for 24 generations straight.
Gated, the same run climbed from 8 to 17 overtakes while braking cars went from 1 in 81
to 45 in 81. It never counts towards clearing the course, which still means passing every
traffic car for real.

The ranking is the same sentence read twice: **more overtakes wins, and at an equal count
the car that got there first wins**. That is "pass every traffic car, as soon as possible"
with nothing added. Cars with zero overtakes are not eligible, and so are cars that missed
the overtake deadline, which is an elimination rather than a malus: their score stays
exactly as earned, they simply can no longer win or breed.

Progress still exists internally, but only to drive the idle death timeout. It is worth no
points. This distinction keeps the anti-stall and anti-loitering safety valves without
quietly reintroducing progress as a second evolutionary objective.

## How the search works

Three details of the genetic algorithm matter as much as the reward, and all three were
measured the same way:

- **`mutationRate` is a probability per parameter, not a blend factor.** The earlier
  version blended _every_ weight with a fresh random value at `rate`: a 10 % mutation
  moved all ~200 weights at once, which in weight space is a long jump in a random
  direction rather than a small step. There was no local search at any rate, and the
  Winner plateaued within three generations. A mutated weight now moves by at most
  `MUTATION.perturbation`, and the rest are left alone.
- **The course changes every few generations** (`SIMULATION.generationsPerCourse`).
  One fixed course makes results beautifully comparable and teaches memorisation:
  measured, the Winner stalled at 1935 px for nine generations in a row, hitting the
  same wall every time. Inside a block the layout is identical, so a Winner can only
  be dethroned by a car that genuinely out-drove it; across blocks it has to re-earn
  its place on obstacles it has never seen.
- **The course ramps by difficulty, one quarter at a time**, easy first, each quarter
  drawn from its own difficulty or anything easier. Removing the ramp was tried and it
  is worse: a lane change at top speed costs 80 steps and 400 px of closing distance, a
  two-lane change costs 114, and the real gap between two rows is only 284 to 404 px, so
  in a shuffled course the first transition that cannot be taken at full throttle lands
  around row 2. A population that has not yet learned to hold the road meets it there,
  and what it learns cannot stack: it evolves a two-lane weave in one round and forgets
  the plain single-lane one in the next, dying against the guard rail before reaching
  any traffic at all. Two rules still hold across the whole course, section boundaries
  included: every pattern appears at least once, and no row leaves the same gap open as
  the row before it (`TrafficPattern.kind`), since two such rows in a row are one
  obstacle with a hole in it and are cleared by driving straight.

## Reading the screen

The page is two canvases: the race on the left, the followed car's network on the right,
redrawn eight times a second with every connection's opacity showing how much it actually
contributed to the last decision. The overlay panel lists the live telemetry, including
`Overtakes`, which is the whole score, and `Race time`, the round clock the champion's
record is measured on: while a car is still running you can read one against the other and
see whether the record is still within reach.

Under it sits the **Champion** block: the network that holds the record, the time it took
to finish the course and how many cars it passed doing it. It is grouped separately from
the live numbers because it is not live at all: it comes from localStorage, and it changes
only when somebody finishes faster.

| What you see      | What it is                                                         |
| ----------------- | ------------------------------------------------------------------ |
| **White car**     | The Winner: last generation's best, running its network as-is      |
| Coloured cars     | Its mutated offspring, one colour each                             |
| **Blue car**      | The player's car, only while manual driving is on                  |
| **Dark grey car** | A car eliminated by a crash or a timeout                           |
| Near-black cars   | Traffic: rolling obstacles, not learners, always the same colour   |
| `WINNER` badge    | Whoever currently holds the best race result of the round          |
| Red rear lights   | The binary brake is engaged                                        |
| Yellow polygon    | Closed outline of the followed car's current free-space readings   |
| Yellow zones      | The same free space area by area, in the Radar's zones mode        |
| Red / green dots  | Collision contacts / clear outer-edge samples for each sensor zone |
| Green `VICTORY!`  | Somebody just passed every traffic car; the course is solved       |

The camera follows the leader, or the player's car while a human is driving it, or the
winner once nobody is left racing.

A round ends when every car is out. A car is out when it crashes, when it fails to
cover `SIMULATION.idleProgressThreshold` px within `idleTimeoutSeconds` (a minimum
average speed, not merely "some movement": see the comment on those two values), or
when it goes 12 seconds without a new overtake. Neither timeout takes points away, because
nothing does: missing the overtake deadline makes the car ineligible as winner or parent
and leaves its score exactly as it was earned.
The final `maxRoundSeconds` ceiling costs nothing and only exists because the road past the
last traffic row is empty and infinite.

Clearing the course is the one ending that does not wait for an empty field. A five-second
victory banner, animated fireworks and a one-shot victory sound appear while the simulation,
traffic and competitors keep moving. The camera stays on the winner, which continues under
its network (or the player's controls) and is protected from collision and timeout retirement
during the parade. When the round closes, the other competitors are retired while the winner
remains alive and keeps driving until the next generation replaces the field.

## Controls

| Button             | Effect                                                                    |
| ------------------ | ------------------------------------------------------------------------- |
| **Load Champion**  | Race on from the record holder. Disabled until one exists                 |
| **Reset**          | Forget the Winner and start from random networks. The Champion survives   |
| **Restart**        | New generation from the current Winner                                    |
| **Evolve**         | Promote the current best car immediately                                  |
| **Manual driving** | Start a fresh manual round, paused until the first driving input          |
| **Traffic**        | Show or hide the obstacle cars: paint only, the simulation is untouched   |
| **Radar**          | Cycle free-area polygon → the eleven zones → hidden; sensing is untouched |

These controls say which state they are in and change colour with it, because what they
toggle is otherwise invisible: manual driving does nothing until a key is pressed, and
hiding the traffic changes nothing but the picture. The cars still sense and hit the cars
you cannot see. The radar likewise only ever changes rendering, never neural inputs, and
because it has three states rather than two it is a cycling button, not a switch. Its
first mode draws the free-area polygon, the second draws the eleven perception zones that
polygon summarises, each one cut back to whatever it ran into, so a zone ends where the
car would hit something, and the third draws nothing. Both views paint free space in the
same yellow and keep red for the contact points themselves; the zone view is the one that
shows _which_ of the eleven inputs is firing, and how deep into its area the obstacle is.

| Setting        | Effect                                                                       |
| -------------- | ---------------------------------------------------------------------------- |
| Number of cars | 10 to 100, default 80. Applies when the drag ends, starting a new generation |
| Mutation       | Base rate in percent, default 10 %. Applies to the **next** generation only  |
| Hidden layers  | Comma-separated neuron counts, default `16, 12, 8`; press Enter to apply     |

Every numeric setting is offered twice, as a slider to sweep and a field to type into,
clamped to the same limits. The mutation rate is the one setting that deliberately never
restarts the round: it belongs to the next generation, and interrupting the round you are
watching to change it would throw the round away.

Press **M** to toggle manual driving without leaving the keyboard controls.

## Driving it yourself

Your car is **always in the race**, alongside the white Winner. While its own network is
driving, it has a normal random colour and the same paint priority as every other evolved
car. Switch **Manual driving** on (or press **M**) and it becomes blue, moves to the top paint
layer, and a fresh round is prepared with the world frozen. The round begins on the first
arrow, `WASD` or `Space` input. Switch manual driving off at any point and the same car
continues from the same position under its trained neural network; disabling it does not
restart the round.

`↑`/`W` accelerate, `↓`/`S` reverse, `←→`/`AD` steer, `Space` brakes, held as intents, so
releasing one key while another is still down does the right thing instead of zeroing the
input, and losing window focus releases everything rather than leaving the car pinned at
full throttle.

It is not a toy feature, and it is not just a way to measure the course: **the car you
drive learns from you.** The first driving command starts a recording, then every state and
action, including deliberate coasting, is retained for the rest of the run. Realtime
training always includes the current observation plus seven older examples selected in a
deterministic rotation, so the UI stays responsive while the network rehearses its past.

If the player wins, the green five-second celebration also becomes a consolidation phase.
Each epoch accumulates gradients over **every recorded frame at unchanged weights**, then
applies their exact average only after the full dataset has been processed. Sixty complete
epochs run before persistence; no experience is sampled away or omitted. Your car starts as
a copy of the current Winner, so this process corrects what the population already knows
rather than teaching it from scratch.

And your car competes. It is scored like every other, so **if a round you drove is won by
your car, the network you taught becomes the Winner, the whole parent pool, not one seat
in it**, and every car in the next generation is a variation of your driving. Show it one
winning lap and evolution carries on from there.

That makes the project two learning methods side by side, and the contrast is the lesson:
evolution searches blindly and needs a whole population and a whole generation to find out
whether a change helped; a gradient step knows exactly which way every weight should move,
because when a human drives there is an answer to compare against. The same network,
`Layer` for `Layer`, is improved by both.

Changing the hidden layers changes the network's shape, so a Winner or a Champion
saved under a different architecture can no longer be used and is discarded rather than
loaded into a mismatched body.

## Tech stack

[Astro 7](https://astro.build/) · [TypeScript](https://www.typescriptlang.org/) ·
[Tailwind CSS 4](https://tailwindcss.com/) ·
[Canvas 2D](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) ·
[Vitest](https://vitest.dev/) · [pnpm](https://pnpm.io/)
