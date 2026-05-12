# Privacy threat model — mesh-mafia

## What other peers in the same room can see

- Your **player name** (you choose it).
- Your **commitment** `SHA-256(seed)` and later your **revealed seed**.
- The **phase** state.

## What other peers CANNOT see

- **Your role.** The role assignment is derived locally on every phone from the combined entropy. Your phone never publishes "I am the mafia" — every phone runs the same shuffle on the same inputs and locally reads its own slot. The only way to know your role is to look at your phone.

If you turn your phone to show another player, you've disclosed it. That's a social-engineering issue, not a protocol issue.

## What the signaling server sees

The room name (`mesh-mafia:<roomId>`) and encrypted SDP offers/answers.

## What the TURN server sees

Encrypted DTLS/SRTP bytes if peers can't connect directly.

## What stays local

- Your role assignment.
- Your raw 32-byte secret (it's revealed _during_ the reveal phase, but it never leaves your device before that — Yjs publishes only when you `set()`).

## Out of scope for v1

- **Active dishonest peers** — a peer that publishes `c_i` for `s_i` and then refuses to reveal `s_i` can deadlock the round. The game can be restarted, but the malicious peer learned no roles (they don't know the entropy without seeing the other reveals too). We accept this denial-of-service in exchange for keeping the protocol simple.
- **Network observers** — TLS + WebRTC's DTLS protect the wire, but a determined observer on your local network can see _that_ you're playing (room name in SDP exchanges). The room name is not secret.
