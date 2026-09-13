# Mirror Cake 🍰

A one-finger, no-words mirror-glaze cake toy for small children (designed for a 4-year-old) on iPhone and iPad Safari.

**Play:** open `index.html` in a browser (or serve the folder with any static server and open it on the phone).
Add it to the Home Screen for a full-screen, toy-like experience.

## The loop

1. **Unmold** – a chilled cake sits under a silicone mold with a pull tab. Drag it up (or tap it to see it hop).
2. **Glaze** – a pitcher of coloured glaze appears. Drag it over the cake: it tips and pours, the pool spreads across the top and runs down the sides, turning the matte cake glossy. Drips form, fall through the rack, and pool on the tray.
3. **Move** – a cake stand glows. Drag the cake onto it (or tap the stand).
4. **Decorate** – drag berries, macarons, gold leaf… from the tray onto the cake. They snap into place.
5. **Slice** – once something is on top, a knife appears. Drag it down through the cake.
6. **Reveal** – the cake splits and turns to show the hidden inside: rainbow layers, a heart, strawberries, checkerboard, funfetti, matcha crêpe layers, a star, or ombré.
7. Tap anything to start the next cake. Shape, glaze colour, marbling, decorations and interior change every round.

## Design rules honoured

- One finger, no multi-touch, no text, no menus, no timers, no fail states, no tutorial.
- Every object invites its action by looking like it (pull tab, tipping pitcher, glowing stand, bobbing tray items, glinting knife).
- If the child pauses for a few seconds, a translucent "ghost" of the right object performs the motion once, then fades.
- Touching anywhere reasonable does the expected thing: touching the cake during glazing summons the pitcher, touching the stand brings the cake over, and so on.
- Works in portrait and landscape and re-lays out live on rotation.
- Sound is optional decoration (WebAudio); the game reads fully with the phone muted.

## Tech

Vanilla JavaScript + Canvas 2D, no dependencies, no build step. The glaze is faked cheaply: a set of spreading pool
blobs on the top face drive per-column "curtains" that flow down the sides, plus a handful of drip sprites. Everything else is
procedural vector drawing, so it stays crisp on Retina screens and light on mobile Safari.

`window.__cake` exposes a small hook used by the Playwright smoke test that plays through the whole loop in portrait and landscape.
