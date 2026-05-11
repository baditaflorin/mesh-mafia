---
status: accepted
date: 2026-05-11
---

# 0003 — Phase state machine

## Context

The game has a small phase machine. Phases need to be agreed across all phones because some phases trigger crypto work (commit, reveal) and some change the UI (night → mafia phones glow).

## Decision

Phases: `lobby` → `commit` → `reveal` → `night` → `day` → `night` → … (loop).

Phase is stored in a single Yjs `Map<string, { phase: Phase }>` with a single key `current`. Any phone can advance it by `set("current", { phase: nextPhase })`.

This is permissive: anyone can advance, anyone can rewind, anyone can restart. For a party game played in person, social pressure handles abuse. We don't ship moderator-only controls.

Phase transitions trigger automatic side effects:

- **commit**: each phone, on first observation, computes a fresh seed + commitment and publishes its commitment.
- **reveal**: each phone publishes its seed.
- **reveal + all-revealed**: each phone derives roles locally.
- **night**: UI flips per role (mafia red, villager black).

## Consequences

- Phase advancement is a one-liner — `mesh.yPhase.set("current", { phase: "X" })`.
- No designated host. Any phone can press the button. If two phones press simultaneously, Yjs's last-write-wins on a single key resolves cleanly.
- A phone joining mid-game sees the current phase and acts accordingly. If they join after `commit` but before `reveal`, they miss their chance to commit; we surface this in the UI ("you weren't in this round — wait for restart").

## Alternatives considered

- **One designated moderator phone with the advance button.** Rejected — adds a single point of failure and a "moderator betrayal" attack. Permissive transitions match the party-game vibe.
- **Server-side state machine.** Rejected — see ADR 0001 (this is Mode A).
