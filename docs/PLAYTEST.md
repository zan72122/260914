# Playtest — "the moment before suction"

An independent review of the brief's one criterion:

> **The moment BEFORE a piece of debris is sucked in is the game.**

Method: for each of the six rooms this review covers (`intro kitchen paper toy
sand carpet`), on **iphone-portrait** and **iphone-landscape**, a slow approach
onto the room's main debris, frames 70 ms apart, read as a contact sheet — plus
the per-frame `state.json` to check that the reaction really grows with
proximity instead of snapping between poses:

```sh
node dev/shot.mjs --scene=<id> --device=iphone-<pose> \
     --target=<id> --gesture=approach-slow --every=70 --frames=24 --contact
```

Rooms that need travel before anything happens (a toy that has to be shoved, a
rug that has to be combed) also got a `--path` run, noted per room.

Five questions per room:

* **(a)** what a four-year-old sees happen before the capture, in one sentence
* **(b)** does the reaction grow *continuously* with proximity
* **(c)** is there a clear anticipation beat → snap → tube ride → cup
* **(d)** is the smallest interesting item ≥ 9 design px and high-contrast
* **(e)** verdict

---

## Verdict table

| room | pose | before | after | sheet (before → after) |
|------|------|--------|-------|------------------------|
| intro | portrait | strong | **strong** | `dev/out/pt-intro-p` → `dev/out/pt2-intro-p` |
| intro | landscape | **weak** | **strong** | `dev/out/pt-intro-l` → `dev/out/pt2-intro-l` |
| kitchen | portrait | strong | **strong** | `dev/out/pt-kitchen-p` → `dev/out/pt2-kitchen-p` |
| kitchen | landscape | **weak** | **strong** | `dev/out/pt-kitchen-l` → `dev/out/pt2-kitchen-l` |
| paper | portrait | strong | **strong** | `dev/out/pt-paper-p` → `dev/out/pt2-paper-p` |
| paper | landscape | ok | **ok** | `dev/out/pt-paper-l` → `dev/out/pt2-paper-l` |
| toy | portrait | **weak** | **strong** | `dev/out/pt-toy-p` → `dev/out/pt2-toy-p`, `dev/out/pt2-toy-p-shove` |
| toy | landscape | **weak** | **strong** | `dev/out/pt-toy-l` → `dev/out/pt2-toy-l`, `dev/out/pt2-toy-l-shove` |
| sand | portrait | strong | **strong** | `dev/out/pt-sand-p` → `dev/out/pt2-sand-p` |
| sand | landscape | ok | **strong** | `dev/out/pt-sand-l` → `dev/out/pt2-sand-l` |
| carpet | portrait | **weak** | **strong** | `dev/out/pt-carpet-p` → `dev/out/pt2-carpet-p`, `dev/out/pt2-carpet-p-rub` |
| carpet | landscape | **weak** | **strong** | `dev/out/pt-carpet-l` → `dev/out/pt2-carpet-l`, `dev/out/pt2-carpet-l-rub` |

`pt-*` sheets are the first pass, `pt2-*` the re-shoot after the fixes. Same
seed (1337), same device, same gesture, so the two are directly comparable.

---

## intro — wood floor, dust bunnies

### portrait — **strong** (was strong)

* **(a)** The fluff ball above the nozzle stops being a lump: its near fibers
  comb downward, it strains and lengthens, then it flinches *backwards* and is
  gone with a pop.
* **(b)** Yes, and the numbers say so — sampled field strength over the
  approach, from `dev/out/pt2-intro-p/state.json`: `0.04 → 0.11 → 0.19 → 0.31 →
  0.51 → 0.85 → 1.13 → 1.62`, never a step.
* **(c)** Yes. The cock-away is real: the piece moves from y −40 to y −47, i.e.
  *away* from the mouth, one frame before `pulled`.
* **(d)** Yes: bunnies are 50–66 design px across before their fibers.
* **(e)** strong.

**Fixed anyway:** the lit doorway was 17 px above the top of the screen at rest,
so the "where next" only existed during the exit camera move. The wall is now at
`-h*0.455`, the opening is filled with warm light (brightest where it meets the
floor, not darkest) and it throws a soft pool of light onto the boards.

### landscape — **strong** (was weak)

* Before: bare. No wall, no doorway (the wall was at `w*0.60`, half a screen off
  the right edge), and the nearest bunny sat far up and to the left of the
  parked nozzle, doing nothing until the finger had travelled most of the room.
* **Fixed by feel and composition, not features:**
  * the wall moved to `w*0.34` with a lit doorway and a light pool on the floor,
    so the destination is on screen in frame 0;
  * the very first bunny is now placed *from the parked mouth*
    (`parkPoint(78) + (18, −146)`) instead of from a normalized guess, so it
    sits one and a half heads ahead of the nozzle and is already in the idle
    airflow. At rest it samples `s ≈ 0.17` — enough for its near edge to lean,
    not enough to move anything (`dev/out/pt2-intro-l-idle`).
* **(a)** The ball of fluff sitting just in front of the vacuum is already
  waving its near fibers at it, and waves harder the moment the finger moves.
* **(b)** Yes: `0.36 → 0.78 → 0.92 → 1.05 → 1.13 → 1.58 → 2.15` (captured).
* **(c)** Yes. **(d)** Yes. **(e)** strong.

---

## kitchen — glossy tile, crumbs and rice

### portrait — **strong** (unchanged)

* **(a)** The grains under the tipped-over bowl start to shiver on the spot,
  then one lets go, skates across the shiny tile and disappears into the nozzle
  — and then the rest of the spill goes in a rush.
* **(b)** Yes — stiction, shiver, break-away and skate are four visibly
  different phases, and which one you get depends only on how close you are.
* **(c)** Yes: shiver (anticipation) → hop and skid streak (snap) → the grain is
  visible in the tube → the cup fills with little amber dots (frames 18–23).
* **(d)** Rice is 8.4–10.4 px long and cream on pale tile, which is the weakest
  contrast in the game, but each grain carries a skid streak and a drop shadow
  when it moves, and they are never alone.
* **(e)** strong.

### landscape — **strong** (was weak)

* Before: the counter was a 16 %-tall band along the top, the bowl and its spill
  were crowded into the top-left, and the right **60 %** of the screen was empty
  tile with one stray grain in it. Nothing to walk toward, nothing to look at.
* **Fixed (composition):** the counter now stops at `w*0.14` and a **fridge**
  stands at its end — with handles, a plinth, two magnets and a child's drawing,
  so it reads as a fridge from across the room. A **stool** is pulled out onto
  the floor with a **second, smaller spill** under it (11 real crumbs, clamped
  into `reachRect` so the room can always be finished), and a **rubber mat**
  gives the middle of the floor a centre. The second spill also gets its own
  dusting, wiped away by the completion bloom.
* **(a)** Same as portrait, twice: a spill under the bowl and a spill under the
  stool at the other end of the room, each one skating in as you arrive.
* **(b)** Yes. **(c)** Yes. **(d)** As portrait. **(e)** strong.
* Sheets: `dev/out/pt2-kitchen-l` (approach) and `dev/out/pt2-kitchen-l-tour`
  (crossing the room to the second spill).

---

## paper — scraps on a rug

### portrait — **strong**

* **(a)** The paper does not slide, it *flies*: corners lift, a scrap flips over
  on the gust coming off the side of the head, and the white one stretches out
  long and thin as it is drawn into the mouth.
* **(b)** Yes, and it is the best "wrong approach punishes you" in the game —
  come at a scrap from the wrong side and it flutters away instead.
* **(c)** Yes (frames 12–18 of `dev/out/pt2-paper-p`). **(d)** Yes: scraps are
  30–70 px and saturated. **(e)** strong.

### landscape — **ok**

* Read twice. With `--target=auto` the harness picks the little green scrap
  right next to the parked nozzle, which is eaten in a second and makes the
  sheet look static (`dev/out/pt-paper-l`). Aimed at a scrap across the room
  (`--target=paper#6`, `dev/out/pt2-paper-l`) the room comes alive: the plane
  and three scraps tumble as the head passes, and they go in one after another.
* **(b)** Yes. **(c)** Yes. **(d)** Yes.
* **(e)** ok — the reaction is excellent, but the *first* thing a landscape
  player meets is a scrap so close that it is gone before the flutter registers.
  Left alone this pass: it is a placement nicety, not a feel problem, and the
  rooms above were the weak ones.

---

## toy — the playroom

### portrait — **strong** (was weak) · landscape — **strong** (was weak)

* Before: the idea is right — you cannot suck a toy, so you shove it and find a
  year of grime underneath — but the *reward* did not read. The nest dust balls
  were 30–38 px (against 50–66 px in the intro), the crumbs were breakfast-
  coloured on a pale playroom mat, and the grime patch was a pale grey blur that
  looked like the toy's own soft shadow.
* **Fixed (scale and contrast):**
  * nest dust balls 15–19 → **23–28** radius, and the tuft poking out from under
    the rim 17 → **24**, so the sliver that invites the shove is visible from
    across the room;
  * nest crumbs are 1.5× bigger and repainted in **dark browns** (`#5a3d1c`–
    `#8a5c2a`) instead of cereal amber;
  * the grime patch is much darker (`rgba(104,97,84)` core instead of
    `rgba(146,139,126)`), has a **ragged dark outline**, and reaches 1.5×/1.6×
    the toy's half-extent instead of 1.3×/1.4× — so a rim of dirt shows around
    every toy *before* anything is moved. Its lint hairs and specks were
    darkened to match.
* **(a)** The bear will not go up the nozzle however hard you push it at — but
  push it *sideways* and it slides off a dirty grey patch full of fluff balls,
  dark crumbs and coloured beads, which then rattle round the mouth and go in.
* **(b)** Yes, once uncovered: the fluff leans, the crumbs shiver, the beads
  rock and rattle, all as a function of distance.
* **(c)** Yes — the beads have their own extra beat, running round the rim of
  the mouth before the clack.
* **(d)** Now yes: dust balls ~46–56 px, crumbs ~11–21 px and dark, beads
  ~11–15 px and saturated.
* **(e)** strong. Reveal sheets: `dev/out/pt2-toy-p-shove`,
  `dev/out/pt2-toy-l-shove`.

---

## sand — the entrance hall

### portrait — **strong**

* **(a)** The heap does not vanish, it *pours*: a rope of grains runs out of it
  into the nozzle, the surface slides down after them, a bay caves into the near
  edge and the pattern of the mat starts to show through.
* **(b)** Yes — it is a height field, so proximity literally sets the flow rate.
* **(c)** Yes: the shimmer over the surface is the anticipation, a whole chunk
  letting go is the snap, and the buried marble/shell/button surface and ride
  the tube. **(d)** Yes. **(e)** strong.

### landscape — **strong** (was ok)

* Before: it worked, but on a 390 px-tall screen the heap was small, the crater
  shallow, and half of a 24-frame approach was spent walking from `x = 0.12`
  across to the mat, so the sheet ended just as the interesting part began.
* **Fixed (scale and timing, both landscape-only):** the main heap is
  **114 px radius × 28 high** in landscape (100 × 25 in portrait), and the
  vacuum parks at `x = 0.20` instead of `0.12`. Same approach, same 24 frames:
  the grains now start streaming at frame 9 and there is a clear bay bitten out
  of the pile by frame 18.
* **(a)–(d)** as portrait. **(e)** strong.
* Also verified with a long hold: `dev/out/pt2-sand-l-hold` — the crater opens
  and the blue-and-orange mat pattern comes up out of the sand.

---

## carpet — the deep-pile rug

### portrait — **strong** (was weak) · landscape — **strong** (was weak)

* Before: the two things this room is *for* — the pile bending into the airflow,
  and the rug's true colours coming up where the roller has been — were both
  understated. The un-combed rug was a noisy mid-grey, the combed stripe lifted
  it by a barely perceptible amount, and the tuft fan around the mouth was a
  thin scribble.
* **Fixed (contrast and amplitude only, no new mechanics):**
  * **dull**: the wash over the hidden pattern went from `rgba(152,145,130,.78)`
    + `rgba(96,86,70,.16)` to `rgba(136,132,124,.88)` + `rgba(58,52,44,.26)`, so
    the un-combed rug is a flat, dark, colourless grey with only a ghost of the
    pattern in it — perceptual incompleteness you can actually perceive;
  * **bright**: the palette is fully saturated (`#12b49b #f4502c #ffc22e
    #1f6fbe`) and the combed canvas gets an `overlay` warm pass plus a light
    lift;
  * **per pass**: one sweep of the roller stamps at `alpha = amount * 2.8`
    (clamped 0.18–0.88) instead of `* 1.5` (0.08–0.6), so a single stripe is
    unmistakable rather than cumulative;
  * **the fan**: tufts sample out to `radius * 1.22` (was 1.12), bend at
    `strength * 1.55` (was 1.30), are 10.4–13.4 px long at rest (was 8.0–10.2)
    and stretch 62 % rather than 45 % when pulled, with heavier dark roots
    (2.9–4.1 px wide at 0.32–0.68 alpha) and brighter tips.
* **(a)** The carpet's hair all stands up and combs itself toward the nozzle in
  a big fan, and wherever the brush has been the grey rug turns into a bright
  orange-and-blue pattern.
* **(b)** Yes — every tuft samples the field at its own root, so the fan grows
  and tightens smoothly as the head comes down.
* **(c)** Yes: pile-bend (anticipation) → the buried thing is kicked to the
  surface by the roller (snap) → tube → cup.
* **(d)** Yes: the glitter patch and the bead pile are 40+ px clusters, and the
  combed stripe is roughly the width of the head.
* **(e)** strong. Comb sheets: `dev/out/pt2-carpet-p-rub`,
  `dev/out/pt2-carpet-l-rub`.

---

## Left alone

* **paper landscape** placement: the closest scrap to the parked nozzle is eaten
  almost immediately, so the *first* thing the player sees is a capture rather
  than a flutter. Everything after that is strong. Worth a look, but it is a
  layout nicety, not a feel problem.
* **rice contrast on kitchen tile** is the lowest-contrast debris in the game by
  design (pale grain, pale glossy floor). The skid streak and drop shadow carry
  it while it moves; it is only hard to see while it is still.
* This review covers `intro kitchen paper toy sand carpet` on the two iPhone
  poses. `thread` and `sofa`, and the two iPad poses, were not part of it.

---

# Phase A — the two new wordless chains

The hub and the cup limit are not debris, but they are the two places where the
game now has to explain something without words, so they are held to the same
five questions.

## Going through a door

Sheets: `dev/out/hall-p`, `dev/out/hall-clean-p`, `dev/out/hall-clean-l`,
`dev/out/hall-enter-p` (`--path="0.5,0.78;@bunny,5000"`),
`dev/out/hall-return-p` (`--scene=intro --complete`).

* **(a)** One door down the hallway is open a crack and a dust bunny has drifted
  out underneath it. It is already swaying before the child touches anything.
  They drive the head at it, it strains, and as it goes in they are in the room.
* **(b)** Yes — it is a real `DustBunny`, so it is the same continuous lean →
  strain → shed → snap it has everywhere else, and the door itself swings a
  little further open as the airflow reaches it.
* **(c)** Yes, and the capture and the room change are the same beat: the
  transition starts on the frame the fluff reaches the mouth (`hall-enter-p`
  state: `pulled` at 1.32 s, `enter=intro` at 1.57 s, veil at 2.32 s).
* **(d)** The bunny is 24 design px of body plus fibres, sitting on a warm patch
  of light spilling under the door; the door is 116 px tall. Both read.
* **(e)** strong. The return reads too: the head walks out of the doorway it
  went in at, the door swings shut behind it, its frame lights up and the floor
  in front of it is polished — and on the first return the other twelve doors
  creak open one after another in front of the child.

## The cup is full

Sheets: `dev/out/cupfull-kitchen-p` (46 items forced into the cup, then a slow
approach onto the rice), `dev/out/pour-kitchen-p` (the same, then driven to the
bin), `dev/out/cupzoom` (the cup itself at 3.2x).

* **(a)** The rice crowds up against the mouth in a ring and will not go in. The
  cup is packed to the lid with fluff poking out of the seam, the motor is
  labouring, and the only open thing in the room is the bin.
* **(b)** Yes, and it is gradual before it is absolute: the whole field fades
  from 0.8 (x0.91 at 0.85, x0.72 at 0.90), so the room gets sluggish before
  anything actually refuses.
* **(c)** Yes — the refusal has its own beat: the air drags a grain to the
  intake and puffs it back out, over and over, which is a "no" a four-year-old
  has seen before. Then the pour: the cup's bottom swings open, the whole lot
  arcs across in one rush, the lid claps, and the rice starts streaming in again
  on the very next frame.
* **(d)** The bin is 74x82 design px with a black open top and a rim that
  brightens and pulses as the cup fills.
* **(e)** strong, with one reservation: driving the head all the way onto the
  bin puts the machine on top of it, which muddles the pour. The trigger was
  pushed out to 92 px so the head is usually beside it, but a child who keeps
  pushing will still overlap it.

## The whole house, end to end

`node dev/playthrough.mjs --budget=250`, one finger, in real time — into the
hall, through every door, back out, until all thirteen are clean, then the
celebration and the reset:

| device | intro | kitchen | paper | toy | thread | sand | sofa | carpet | 5 stubs | hall (14 visits) | total | fps min/med | errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| iphone-portrait  | 5.4 | 6.4 | 8.1 | 8.6 | 7.5 | 12.5 | 15.5 | 82.6 | 2.8 each | 46.6 | 206.8s | 43.2 / 60 | 0 |
| iphone-landscape | 28.8 | 6.6 | 8.8 | 24.7 | 10.3 | 33.6 | 15.6 | 105.4 | 2.8 each | 47.6 | 295.0s | 47.5 / 60 | 0 |
| ipad-portrait    | 5.9 | 6.6 | 8.2 | 8.6 | 6.8 | 37.5 | 35.3 | 69.0 | 2.8 each | 48.4 | 240.2s | 24.4 / 39.2 | 0 |
| ipad-landscape   | 5.9 | 6.6 | 7.9 | 8.1 | 9.0 | 64.5 | 33.6 | 55.1 | 2.8 each | 48.7 | 253.6s | 20.8 / 47.5 | 0 |

The iPad fps column is the container's software rasteriser at 3.87 Mpx a frame,
not a prediction for a real iPad — see the performance section of
docs/ARCHITECTURE.md.

The spread in `sand`, `sofa` and `carpet` is the autopilot, not the game: those
rooms have pieces the head can only reach from one side, and how long the
driver spends on them depends on which one it happens to leave until last.

## Left alone (Phase A)

* The hallway is a corridor with parallel walls plus a depth haze, not a
  perspective one. It reads as "away" with the tilt, but it is not drawn in
  perspective and doors do not shrink into the distance.
* The five placeholder rooms finish after a beat with nothing to do in them.
  They exist so the hub and the harness are exercisable; they are not a feel
  claim of any kind.
