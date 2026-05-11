# mesh-mafia

[![Live](https://img.shields.io/badge/live-baditaflorin.github.io%2Fmesh--mafia-C45E5E?style=flat-square)](https://baditaflorin.github.io/mesh-mafia/)
[![Version](https://img.shields.io/github/package-json/v/baditaflorin/mesh-mafia?style=flat-square&color=6e6058)](https://github.com/baditaflorin/mesh-mafia/blob/main/package.json)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![No backend](https://img.shields.io/badge/backend-none-1a160a?style=flat-square)](docs/adr/0001-deployment-mode.md)

> Peer-to-peer Werewolf. Phones are role cards. No moderator-with-cards needed; roles are dealt by cryptographic commit-reveal so no one phone (and no server) ever knows the wolf.

**Live:** https://baditaflorin.github.io/mesh-mafia/

Werewolf / Mafia / Loup Garou — pick your local name. Each player joins the lobby on their phone, hits **Deal roles**, and their phone reveals whether they're the wolf. During the "night" phase, every mafia phone flashes red so wolves can identify each other; villager phones stay dark. Voting happens around the table by raised hand.

## How the role assignment is trust-minimized

The classic problem with "phone-as-role-card" is: somebody has to write the role-dealing code, and you have to trust it. We use **commit-reveal** so no phone can grind a favorable outcome.

1. **Lobby** — everyone joins. Yjs syncs the player roster.
2. **Commit** — each phone generates a random 32-byte secret and publishes only its `SHA-256(secret)` to a shared `Y.Map<peerId, hash>`. At this point no one knows the secrets, but every phone is bound to its own.
3. **Reveal** — once all commitments are visible, phones publish their actual secrets.
4. **Verify** — every phone independently checks `SHA-256(revealed) == commitment` for every other phone. Any mismatch aborts.
5. **Combine** — the collective entropy is `XOR(all secrets)`. Every phone derives the same value.
6. **Deal** — every phone runs the same seeded Fisher-Yates shuffle on the player list and assigns the first `mafiaCount` slots to mafia. Same input, same output, on every phone.

To bias the draw, a player would need a SHA-256 preimage attack on a 256-bit hash _and_ a 256-bit-secret-grind targeted at making their own ID land in the mafia bucket. We're safe.

## Privacy threat model

See [docs/privacy.md](docs/privacy.md). After role assignment, **only your phone knows your role.** Other phones know your _commitment_ and _revealed seed_, neither of which reveals your role.

## Architecture

- **Mode A** — pure GitHub Pages.
- **WebRTC** — Yjs + y-webrtc with self-hosted signaling and TURN.
- **Crypto** — WebCrypto SubtleCrypto (`crypto.subtle.digest("SHA-256", ...)`). No external crypto library.

## Run it locally

```bash
git clone https://github.com/baditaflorin/mesh-mafia.git
cd mesh-mafia
npm install
npm run dev
```

## Self-hosted infrastructure

| Repo                                                                   | Endpoint                               | Role                      |
| ---------------------------------------------------------------------- | -------------------------------------- | ------------------------- |
| [signaling-server](https://github.com/baditaflorin/signaling-server)   | `wss://turn.0docker.com/ws`            | y-webrtc protocol fan-out |
| [turn-token-server](https://github.com/baditaflorin/turn-token-server) | `https://turn.0docker.com/credentials` | HMAC TURN creds           |
| [coturn-hetzner](https://github.com/baditaflorin/coturn-hetzner)       | `turn:turn.0docker.com:3479`           | TURN relay                |

## ADRs

- [0001 — Deployment mode](docs/adr/0001-deployment-mode.md)
- [0002 — Commit-reveal role assignment](docs/adr/0002-commit-reveal.md)
- [0003 — Phase state machine](docs/adr/0003-phase-machine.md)
- [0010 — GitHub Pages publishing](docs/adr/0010-pages-publishing.md)

## License

[MIT](LICENSE) © 2026 Florin Badita
