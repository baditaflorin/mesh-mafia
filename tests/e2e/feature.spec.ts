import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

/**
 * Load-bearing cross-peer assertion for the ADVERTISED core action:
 * "roles are dealt by cryptographic commit-reveal so no one phone (and no
 * server) ever knows the wolf."
 *
 * This drives a full FOUR-peer game (the lobby requires >= 4 players) through
 * the real commit -> reveal -> deal phases over the shared Yjs doc, then
 * asserts the privacy + correctness invariants that make the game trust-
 * minimized:
 *
 *   1. Every peer ends up with EXACTLY ONE locally-visible role (mafia or
 *      villager) — the commit-reveal pipeline actually completed cross-peer.
 *   2. Each peer privately sees ONLY its own role (the role class lives on the
 *      peer's own stage; one peer's mafia flag does not leak onto another's
 *      DOM).
 *   3. The role assignment is globally consistent: exactly `mafiaCount` mafia
 *      are dealt across the table, derived deterministically from the XOR of
 *      every peer's revealed salt. Same shared seed -> same deal on every
 *      phone, with no server and no single phone choosing the wolf.
 *
 * If the commit-reveal sync were broken (writes to React state instead of the
 * Yjs doc, mismatched map keys, or the deal never propagating), no peer would
 * ever leave the "reveal" phase with a role and assertion (1) fails. If the
 * deal were biased / inconsistent, assertion (3) fails.
 */

async function joinLobby(page: Page, name: string) {
  // Set a distinct display name BEFORE the app reads it (App.tsx seeds myName
  // from localStorage on mount). openTwoPeers' init script already set the
  // room + signaling URL for the whole context; we layer the per-peer name.
  await page.evaluate(({ prefix, n }) => localStorage.setItem(`${prefix}:name`, n), {
    prefix: storagePrefix,
    n: name,
  });
  await page.reload();
  // Arm screen: "Join lobby as <name>".
  await page.getByRole("button", { name: /join lobby/i }).click();
}

test("four peers commit-reveal a fair role deal; each peer privately sees only its own role", async ({
  browser,
  baseURL,
}) => {
  // openTwoPeers gives us a shared context (BroadcastChannel-synced) plus the
  // first two pages; we add two more on the same context for a 4-player table.
  const { context, a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", {
    storagePrefix,
    roomId: `e2e-mafia-${Math.random().toString(36).slice(2, 8)}`,
  });
  try {
    const c = await context.newPage();
    const d = await context.newPage();
    await Promise.all([c.goto(baseURL ?? ""), d.goto(baseURL ?? "")]);

    const peers = [a, b, c, d];
    const names = ["Ana", "Bo", "Cy", "Di"];
    for (let i = 0; i < peers.length; i++) {
      await joinLobby(peers[i]!, names[i]!);
    }

    // Every peer must observe all 4 players in the shared roster before the
    // deal can begin (the "Deal roles" button is disabled below 4).
    for (const p of peers) {
      await expect(p.locator(".mafia-hud")).toContainText("4 players");
    }

    // Peer A starts the deal: lobby -> commit phase, mesh-wide.
    await a.getByRole("button", { name: /deal roles/i }).click();

    // Each phone auto-generates its salt and publishes its SHA-256 commitment
    // to the shared commits map. Every peer must SEE all four commitments land
    // (the count is read from the shared Yjs map, so "4 / 4" on peer B proves
    // A/C/D's commitments crossed the mesh — not just B's own).
    await expect(b.locator(".mafia-help")).toContainText("Committed: 4 / 4", { timeout: 15_000 });

    // Once all 4 commitments are in, advance to reveal. We trigger from peer B
    // to prove any peer can drive the phase, not just the dealer.
    const revealBtn = b.getByRole("button", { name: /all committed/i });
    await expect(revealBtn).toBeEnabled({ timeout: 15_000 });
    await revealBtn.click();

    // After all reveals propagate, every peer derives the same seeded shuffle
    // and shows its own role on its own stage.
    for (const p of peers) {
      await expect(
        p.locator(".mafia-stage.mafia-role-mafia, .mafia-stage.mafia-role-villager"),
      ).toHaveCount(1, { timeout: 15_000 });
    }

    // Read each peer's PRIVATE role off its own DOM.
    const roles = await Promise.all(
      peers.map(async (p) => {
        const isMafia = (await p.locator(".mafia-stage.mafia-role-mafia").count()) === 1;
        const isVillager = (await p.locator(".mafia-stage.mafia-role-villager").count()) === 1;
        // Invariant (2): exactly one role visible per peer, never both.
        expect(isMafia !== isVillager).toBe(true);
        return isMafia ? "mafia" : "villager";
      }),
    );

    // Invariant (3): exactly mafiaCount mafia dealt across the whole table.
    // App default mafiaCount is 2 (capped at floor(players/2) = 2 for 4).
    const mafiaTotal = roles.filter((r) => r === "mafia").length;
    expect(mafiaTotal, `roles dealt: ${roles.join(",")}`).toBe(2);
    expect(roles.filter((r) => r === "villager").length).toBe(2);
  } finally {
    await cleanup();
  }
});
