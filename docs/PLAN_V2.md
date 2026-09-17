# Expansion plan v2 (approved by the owner, 2026-09-17)

Everything in docs/BRIEF.md still applies (wordless, one finger, suction-only
phenomena, pre-suction moment is the game, cup is the counter, no text/HUD).

## Structure change: the hallway hub
- A new `hall` scene replaces the linear chain. Doors along a hallway lead to rooms;
  entering a door (driving the head into it) starts that room; finishing a room
  returns to the hall (camera walks out of the door).
- Wordless state on the doors: an unclean room's door has a dust bunny edge peeking
  out under it and swaying in the idle airflow (the existing invitation grammar);
  a clean room's door is bright / glows softly and the floor in front is shiny.
- First launch: only the intro door is open; the other doors open (creak ajar with
  dust visible) once the child has finished the intro. All rooms are then free order.
- All rooms done → the whole house brightens, a final big bin pour, then the hall
  resets dirty (no persistence across page loads: the owner chose "fresh every time").
- Portrait: the hallway recedes away from the viewer and scrolls; landscape: a long
  hallway scrolling sideways.
- Rooms: intro, kitchen, paper, toy, thread, sand, sofa, carpet (existing 8) +
  pantry, stairs, window, veranda, bedroom (new 5) = 13 doors.

## Mechanic: cup full → weaker suction → empty it at a bin
- Cup capacity ≈ two rooms' worth. As it fills past ~80%, suction visibly weakens:
  debris leans less (field power scales down), motor pitch lowers and labours, cup
  contents jiggle and press against the lid, fluff pokes out.
- A small bin stands near the entrance of every room and in the hall. Bringing the
  head close to a bin opens the cup bottom: everything pours out in one rush
  ("zazaa"), lid claps, suction is back. No text: the causal chain is the teaching.
- The carpet finale's pour is folded into this mechanic.

## New rooms (each with separate portrait/landscape layouts)
A. pantry — flour cloud. Powder is a density grid; airflow is visible in the powder:
   it streams and swirls into the mouth, rushes away if approached fast, is drawn in
   as streaks on a hold. The head leaves clean tracks; the tile pattern shows through.
   A tipped flour bag is the source.
B. stairs — debris on the step edges tumbles down toward the mouth (gravity +
   suction); big bits catch on the lip and need a hold to clear it; a bunny on the
   landing bounces down step by step. Camera climbs one step at a time (portrait);
   landscape shows a long diagonal stair with a gap under the banister.
C. window — curtain hem gets sucked in and flaps, exposing dust behind; motes in the
   light shafts stream toward the mouth. A narrow gap between bookshelf and wall
   morphs the nozzle into a crevice tool automatically (thin, long cone); the debris
   deep in the gap comes out in a single-file "shoo".
D. veranda — dry leaves crumble at the mouth into fragments that race up the tube;
   a leaf pile scatters on the side gust; wet leaves are heavy, stuck, need a hold to
   peel; a drain grate pattern hidden under the leaves; a plant pot to go around.
E. bedroom — part 1: cushion fabric bulges into the mouth and pet hair lifts out of
   the weave and streams; part 2: under the bed, the giant dust bunny boss — too big
   to swallow, a hold strips fibres off it a few at a time, it thins, and finally pops.
   Reuses the sofa's dark/light. This is the grand finale room.

## Core work needed (Phase A)
- Hub scene + room state (in memory) + door transitions in main.js.
- Cup capacity, power scaling by fullness, bin prop + pour (shared), audio labouring.
- Air-borne particle layer with height (flour, leaves, boss fibres).
- Powder density grid (reuse HeightField ideas).
- Nozzle morph (crevice tool) with a narrow cone in `field()`.
- Stepped camera follow for stairs.
- Harness: playthrough drives the hub (enter each door, finish, return), fps probe per room.

## Phases
A (1 agent): core + hall + cup/bin + migrate the 8 rooms + playthrough → review.
B (5 agents in parallel, file ownership rules from docs/SCENE_AGENT_GUIDE.md): new rooms.
C (2 agents): integration/perf + independent feel audit; then final review.
