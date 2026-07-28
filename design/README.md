# Design reference — Claude Design handoff bundle

This is the original **handoff bundle** from Claude Design (claude.ai/design), kept in the
app repo per the Build Guide's own advice: "keep the prototype in the repo... describing a
layout in prose is the single biggest waste of time available." Point Claude Code at these
files directly rather than describing a screen from memory.

- `chats/chat1.md` — the full design conversation. This is where the *intent* behind a
  decision lives; the prototype is just the output of it.
- `prototype/Golf Scorecard.dc.html` — the full clickable prototype, all ten screens (iOS
  and Android), plus the spectator web view. Follow its imports
  (`prototype/_ds/.../styles.css`, `prototype/_ds/.../_ds_bundle.js`, `prototype/*.jsx`,
  `prototype/support.js`) to see how the pieces fit together.
- `prototype/Build Guide.dc.html` — the phased plan for building this out for real, from
  "one screen, no backend" through the tournament layer and the app stores. `CLAUDE.md` at
  the repo root pulls the load-bearing rules out of this into something Claude Code reads
  every session.

These are prototypes (HTML/CSS/JS), not production code — the job is to recreate them
pixel-perfectly in the app's actual stack (React Native here), matching the visual output
rather than copying the prototype's internal markup.
