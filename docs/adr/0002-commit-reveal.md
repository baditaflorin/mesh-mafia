---
status: accepted
date: 2026-05-11
---

# 0002 — Commit-reveal role assignment

## Context

A trustworthy phone-based Werewolf needs to deal roles such that:

1. No single phone can bias the draw.
2. No server learns who's the wolf.
3. The protocol works even if some phones are adversarial.

A simple `Math.random()` on one designated phone fails (1) and (2). A seeded shuffle with a published seed lets the seed-chooser grind for favorable outcomes.

## Decision

Two-phase **commit-reveal**:

- **Commit**: each phone generates a 32-byte uniformly-random secret `s_i`. It publishes only `c_i = SHA-256(s_i)` to a shared `Y.Map<peerId, commitment>`. Phones do NOT publish `s_i` yet.
- **Reveal**: once every player's `c_i` is visible, every phone publishes its `s_i` to a shared `Y.Map<peerId, seed>`.
- **Verify**: each phone independently checks `SHA-256(s_i) == c_i` for every peer. Any mismatch aborts the draw.
- **Combine**: entropy `E = s_0 ⊕ s_1 ⊕ … ⊕ s_n` (XOR over 32-byte vectors).
- **Deal**: every phone runs the same Fisher-Yates shuffle of the sorted player-id list with `E` as the seed. The first `mafiaCount` after shuffling are mafia.

Because everyone publishes their commitment before any seed is revealed, no peer can grind `s_i` to influence `E` — they're locked into `s_i` before they see anyone else's. The hash binds `c_i ↔ s_i` (preimage-resistance).

The shuffle uses `SHA-256(E ‖ counter)` as a pseudo-random byte stream for Fisher-Yates indices. Deterministic across phones.

## Consequences

- Anyone can verify the draw was fair — `s_i` for every peer is published, `c_i` is published, the deal is a pure function of the seeds.
- Adversarial phones can refuse to reveal. We surface this in the UI ("waiting for N peers to reveal"). The game stalls but cannot be unfairly completed.
- The randomness quality is as good as the worst-case `s_i`, which is fine because we XOR — one honest random `s_j` makes `E` look uniformly random regardless of the others.
- 32 bytes × N peers is trivial for Yjs.

## Alternatives considered

- **Single phone deals.** Rejected — requires trusting that phone.
- **Coin-flipping protocol with bit commitment but no XOR.** Same idea; XOR is the clean composition for n-party.
- **VRF (Verifiable Random Function).** Overkill. Our setting allows everyone to publish their seed without losing security.
- **Threshold signing for the seed.** Overkill — that gets you fault tolerance for malicious peers that won't reveal, but the cost (BLS or DKG implementation) isn't worth it for a party game.

## Caveat

If a peer's phone dies between commit and reveal, the entire round stalls and must be restarted. That's acceptable for a party game. A more sophisticated protocol could tolerate up to t < n/2 dropped peers via secret sharing, but is not in scope.
