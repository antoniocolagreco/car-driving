# 🚗 Self-Driving Car — a readable genetic algorithm

A population of cars learns to drive a three-lane road by natural selection. The autonomous
search needs no training data or gradients: every car has a small feed-forward neural
network, the ones that drive best father the next generation, and after a few dozen
generations they overtake traffic on their own. Manual driving adds a second learning path:
real-time backpropagation from the player's controls.

Built with **Astro**, **TypeScript** and a plain **HTML5 canvas** — no game engine, no ML
library. The whole thing is meant to be _read_: every non-obvious number is explained
where it is defined, and the interesting logic is pure functions with unit tests.

## 🎮 [Live demo](https://antoniocolagreco.github.io/car-driving)

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![Astro](https://img.shields.io/badge/Astro-FF5D01?logo=astro&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)

## What you can learn from this repository

- How a **feed-forward network** turns sensor readings into steering and throttle
  (`src/core/neural-network.ts`)
- How a **genetic algorithm** improves a policy without gradients, and why elitism and a
  spread of mutation rates matter (`src/core/population.ts`)
- Why **reward design** is the hardest part of the whole exercise, and how a badly shaped
  reward teaches exactly the wrong lesson (`src/core/fitness.ts`)
- How fixed **eleven-zone perception** and polygon collision work from first principles
  (`src/core/sensor.ts`, `src/core/geometry.ts`)
- How **backpropagation** teaches the very same network by imitation when a human drives
  it, and why a full-batch average is not the same update as sixty single frames
  (`src/core/neural-network.ts`)

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
├── core/     pure simulation — no DOM, no canvas, no localStorage, fully unit tested
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
| `core/sensor.ts`         | Eleven fixed perception areas and nearest-obstacle queries   |
| `core/car.ts`            | Car state and time-based physics, analog throttle and brake  |
| `core/road.ts`           | Lane geometry and guard rails                                |
| `core/traffic.ts`        | The course, as data: patterns grouped by difficulty          |
| `core/fitness.ts`        | **The reward system**                                        |
| `core/population.ts`     | Generation building, elitism, mutation tiers                 |
| `core/simulation.ts`     | The step loop and the generation lifecycle                   |
| `core/config.ts`         | Every tunable number, each with its rationale                |

## How a car drives

Each step, for every living car:

1. **Sense** — eleven fixed areas surround the front and flanks: three 15° triangles per side
   through ±45°, one wider lateral triangle per side from ±45° through ±90°, plus a
   car-width front rectangle and one full-length side area projected laterally to the
   common sensor range on each flank. Each returns `0` clear to `1` touching.
2. **Think** — those readings plus the car's normalized speed are fed forward through the
   network. The architecture is always `[12, ...hiddenLayers, 3]` (eleven areas plus speed).
3. **Act** — the three outputs are `[throttle, brake, steering]`, all analog: throttle and
   steering in `[-1, 1]`, while brake is always a non-negative pressure in `[0, 1]`.
4. **Score** — the reward system folds that one observation into the car's running fitness.

Physics runs on a **fixed 60 Hz timestep** with an accumulator, so behaviour is identical
regardless of display refresh rate: a slow frame simply runs the steps it owes, back to
back. The catch-up is capped at `SIMULATION.maxStepsPerFrame`, and time beyond the cap is
dropped rather than banked — a tab left in the background must not come back and
fast-forward a whole round in one frame.

## How a generation evolves

The white champion is the winner of the previous successful race. Every completed race
elects its best race result as the next champion: most overtakes, then fitness, followed by
furthest progress and the time needed to reach that overtake total.
The next generation is built from it even when its fitness is below an older record:

| Share of the population | Mutation rate                   | Purpose                         |
| ----------------------- | ------------------------------- | ------------------------------- |
| car 0 (elite)           | none — the champion itself      | a generation can never regress  |
| 25 %                    | 1 %                             | refine what already works       |
| 35 %                    | between 1 % and the chosen rate | small variations                |
| 25 %                    | exactly the chosen rate         | the main search                 |
| 15 %                    | up to 4× the chosen rate        | explorers that find new tactics |

A single mutation rate is a bad bet: too low and the population never explores, too high
and it forgets what the champion already knew. Spreading the budget across bands hedges
both ways in every generation — with the weight on the refining side, because the point
of a generation is to improve on the champion, not to re-roll it.

Every band is expressed as a multiple of the rate on the slider, and that matters: the
explorers used to be mutated somewhere between the slider and 100 %, so asking for a 2 %
mutation still produced 22 near-random cars out of 100. The slider has to mean something.

The next generation is bred from the best few networks (`PARENT_COUNT`), not only from
the winner: a field that is entirely variations of one network is a hill climber wearing
a genetic algorithm's clothes, and it stalls as soon as that one network sits in a local
optimum. The refining quarter is the exception — those cars always descend from the
champion itself, because their job is to improve on the best network there is, and handing
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

So the current system pays only for results, and charges for bad states:

| Reward                                      | Value      |
| ------------------------------------------- | ---------- |
| Overtaking a traffic car                    | +50 each   |
| Ground gained **on the traffic**            | +0.05 / px |
| Speed used **while the road ahead is free** | +3.0 / s   |
| Staying alive                               | +0.5 / s   |

| Penalty                                 | Value                                               |
| --------------------------------------- | --------------------------------------------------- |
| Crashing                                | −10 % to −100 % of what you earned, by impact speed |
| **Unsafe speed for the available path** | −30 / s, graded by closeness                        |
| Standing still with nothing in the way  | −5 / s                                              |
| Driving in reverse                      | −0.05 / px                                          |
| No new overtake within 10 seconds       | Eliminated; the run can no longer win or breed      |

The hazard judges the resulting state rather than the chosen control. Steering clears it
only when the swept path really becomes free; braking clears it by reducing the stopping
distance. An ineffective steering command therefore no longer excuses an unsafe trajectory.

"In the path" is literal: the corridor the car's own body sweeps along its current
heading, guard rails included. A forward cone — which is what this used to use — calls the
rail beside an outer lane an obstacle 105 px away at all times, so a car driving perfectly
straight down that lane reads as permanently about to crash, and every judgement built on
top inherits the error.

Every coefficient above was set by measuring, not by taste. Four of them were wrong
in a way you could watch on screen, and each fix is documented where the number lives:

- **Progress is measured against the traffic, not the tarmac.** Traffic rolls
  forward, so a car that tucks in behind the pack is _carried_ down the road. One
  measured champion covered 9930 px with two overtakes by braking 98 % of the time
  and riding the convoy for a full minute. Subtracting how far the course itself
  moved makes that ride worth exactly what it earned: nothing.
- **Crashing costs a share of the run, not a flat number.** A flat penalty has to be
  large to teach anything (at 50, a run holding 300 points of overtakes lost only 50
  by wrecking, and the champion pressed the brake in **0 %** of its steps) and once it
  is large it starts erasing results — at a flat 200, a car that overtook someone and
  then crashed finished on zero, its one achievement deleted. As a fraction it cannot
  do that, and the cost still grows with how good the run was.
- **Speed pays only where it is safe, and costs where it is not.** A flat average-speed
  reward paid for flooring the throttle into the first obstacle; removing it entirely
  was worse, because the population settled on crawling everywhere, which dodges every
  speed penalty and never needs the brake. The pair `REWARD.pace` / `PENALTY.hazard` is
  what makes modulation the winning policy, and the hazard charge deliberately does not
  look at the brake pedal — only at the excess speed itself, which the network is free to
  shed however it likes.
- **There is no penalty for going slowly behind traffic.** There used to be one
  (−2/s "tailgating") and it punished the exact behaviour the simulation is trying to
  teach. Loitering is already fatal: the idle timeout kills anyone who stops making
  progress, so charging for it twice only taught the cars that braking is for losers.

The score floor is zero: a car that crashed away everything it gained has earned nothing,
not a debt. Zero is a legitimate result though, so **being eligible to win is a separate
question from scoring well**. A run counts if it moved forward — or overtook somebody — and
was not eliminated by the overtake deadline. Requiring a positive score instead would let a
barely-moving early wreck outrank a car that drove half the course and then paid all of it
back in hazard and crash penalties. When nobody moved forward at all there is no winner,
and the reigning champion keeps its place.

## How the search works

Two details of the genetic algorithm matter as much as the reward, and both were
measured the same way:

- **`mutationRate` is a probability per parameter, not a blend factor.** The earlier
  version blended _every_ weight with a fresh random value at `rate`: a 10 % mutation
  moved all ~200 weights at once, which in weight space is a long jump in a random
  direction rather than a small step. There was no local search at any rate, and the
  champion plateaued within three generations. A mutated weight now moves by at most
  `MUTATION.perturbation`, and the rest are left alone.
- **The course changes every few generations** (`SIMULATION.generationsPerCourse`).
  One fixed course makes fitness beautifully comparable and teaches memorisation:
  measured, the champion stalled at 1935 px for nine generations in a row, hitting the
  same wall every time. Inside a block the layout is identical, so a champion can only
  be dethroned by a car that genuinely out-drove it; across blocks it has to re-earn
  its place on obstacles it has never seen.

## Reading the screen

The page is two canvases: the race on the left, the followed car's network on the right,
redrawn eight times a second with every connection's opacity showing how much it actually
contributed to the last decision. The overlay panel lists the live telemetry and, below the
divider, the **full fitness breakdown** term by term — rewards green, penalties red — so the
reward system is readable while it runs instead of only in the source.

| What you see           | What it is                                                        |
| ---------------------- | ----------------------------------------------------------------- |
| **White car**          | The champion: last generation's winner, running its network as-is |
| Coloured cars          | Its mutated offspring, one colour each                            |
| **Blue car**           | The player's car, only while manual driving is on                 |
| **Dark grey car**      | A car eliminated by a crash or a timeout                          |
| Near-black cars        | Traffic: rolling obstacles, not learners, always the same colour  |
| `WINNER` badge         | Whoever currently holds the best race result of the round         |
| Red rear lights        | The brake, which is analog pressure — bright means hard braking   |
| Yellow areas, red dots | The followed car's eleven perception areas and closest contacts   |
| Green `VICTORY!`       | Somebody just passed every traffic car; the course is solved      |

The camera follows the leader, or the player's car while a human is driving it, or the
winner once nobody is left racing.

A round ends when every car is out. A car is out when it crashes, when it fails to
cover `SIMULATION.idleProgressThreshold` px within `idleTimeoutSeconds` (a minimum
average speed, not merely "some movement" — see the comment on those two values), or
when it goes 10 seconds without a new overtake. Missing that deadline eliminates the car
and makes it ineligible as winner or parent, while leaving its score visible as telemetry.
The final `maxRoundSeconds` ceiling costs nothing and only exists because the road past the
last traffic row is empty and infinite.

Clearing the course is the one ending that does not wait for an empty field: the round
freezes into a five-second victory banner instead, and only then retires everyone —
deliberately without a crash penalty, so the winner cannot lose what it just achieved by
drifting into a rail during its own celebration.

## Controls

| Button             | Effect                                                                   |
| ------------------ | ------------------------------------------------------------------------ |
| **Backup**         | Save the followed car's network to a slot you can return to              |
| **Restore**        | Load that slot and use it as the champion                                |
| **Reset**          | Forget the champion and start from random networks                       |
| **Restart**        | New generation from the current champion                                 |
| **Evolve**         | Promote the current best car immediately                                 |
| **Manual driving** | Start a fresh manual round, paused until the first driving input         |
| **Traffic**        | Show or hide the obstacle cars — paint only, the simulation is untouched |

Both switches say which state they are in and change colour with it, because what they
toggle is otherwise invisible: manual driving does nothing until a key is pressed, and
hiding the traffic changes nothing but the picture. The cars still sense and hit the cars
you cannot see.

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

Your car is **always in the race**, alongside the white champion. While its own network is
driving, it has a normal random colour and the same paint priority as every other evolved
car. Switch **Manual driving** on (or press **M**) and it becomes blue, moves to the top paint
layer, and a fresh round is prepared with the world frozen. The round begins on the first
arrow, `WASD` or `Space` input. Switch manual driving off at any point and the same car
continues from the same position under its trained neural network; disabling it does not
restart the round.

`↑`/`W` accelerate, `↓`/`S` reverse, `←→`/`AD` steer, `Space` brakes — held as intents, so
releasing one key while another is still down does the right thing instead of zeroing the
input, and losing window focus releases everything rather than leaving the car pinned at
full throttle.

It is not a toy feature, and it is not just a way to measure the course: **the car you
drive learns from you.** The first driving command starts a recording, then every state and
action — including deliberate coasting — is retained for the rest of the run. Realtime
training always includes the current observation plus seven older examples selected in a
deterministic rotation, so the UI stays responsive while the network rehearses its past.

If the player wins, the green five-second celebration also becomes a consolidation phase.
Each epoch accumulates gradients over **every recorded frame at unchanged weights**, then
applies their exact average only after the full dataset has been processed. Sixty complete
epochs run before persistence; no experience is sampled away or omitted. Your car starts as
a copy of the current champion, so this process corrects what the population already knows
rather than teaching it from scratch.

And your car competes. It is scored like every other, so **if a round you drove is won by
your car, the network you taught becomes the champion — the whole parent pool, not one seat
in it** — and every car in the next generation is a variation of your driving. Show it one
winning lap and evolution carries on from there.

That makes the project two learning methods side by side, and the contrast is the lesson:
evolution searches blindly and needs a whole population and a whole generation to find out
whether a change helped; a gradient step knows exactly which way every weight should move,
because when a human drives there is an answer to compare against. The same network,
`Layer` for `Layer`, is improved by both.

Changing the hidden layers changes the network's shape, so a champion
saved under a different architecture can no longer be used and is discarded rather than
loaded into a mismatched body.

## Tech stack

[Astro 7](https://astro.build/) · [TypeScript](https://www.typescriptlang.org/) ·
[Tailwind CSS 4](https://tailwindcss.com/) ·
[Canvas 2D](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) ·
[Vitest](https://vitest.dev/) · [pnpm](https://pnpm.io/)
