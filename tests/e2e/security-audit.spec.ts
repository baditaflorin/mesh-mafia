import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openNPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

/**
 * Regression tests for two real bugs found in a 2026-08 TRL re-audit:
 *
 *  1. Role-secrecy leak: every peer independently *computed* the full
 *     `{ peerId: role }` map for the whole table (a pure function of PUBLIC
 *     commit-reveal data) and stored it in long-lived React state. Any
 *     player could read every other player's role — including who the
 *     other mafia are — straight out of their own browser's React state
 *     (React DevTools, or a breakpoint), without needing to see anyone
 *     else's screen. Fixed by only ever storing this peer's own role (plus
 *     mafia teammate ids, which mafia are meant to know) in state; the full
 *     map is now computed transiently and discarded.
 *
 *  2. mafiaCount desync: the number of mafia to deal was read from each
 *     phone's own local Settings-drawer value (`localStorage`), never
 *     synced over the shared Yjs doc. Two phones with different local
 *     settings computed a different number of mafia from the IDENTICAL
 *     public shuffle, so a player could be told "villager" by their own
 *     phone while the rest of the table's phones (using a different local
 *     count) would have dealt that same seat "mafia" -- silently breaking
 *     the game. Fixed by publishing the presser's `mafiaCount` into a
 *     shared `yConfig` map when "Deal roles" is pressed, and having every
 *     peer derive roles from that synced value.
 */

async function joinLobby(page: Page, name: string, mafiaCount?: number) {
  await page.evaluate(
    ({ prefix, n, mc }) => {
      localStorage.setItem(`${prefix}:name`, n);
      if (mc != null) localStorage.setItem(`${prefix}:mafiaCount`, String(mc));
    },
    { prefix: storagePrefix, n: name, mc: mafiaCount ?? null },
  );
  await page.reload();
  await page.getByRole("button", { name: /join lobby/i }).click();
}

/**
 * Pull every hook's `memoizedState` out of the WHOLE React fiber tree.
 *
 * `#root` itself only carries a `__reactContainer$…` key (the FiberRootNode
 * wrapper), not `__reactFiber$…` (that's attached to actual rendered DOM
 * nodes). So we grab the fiber off `.mafia-stage`/`.mafia-arm` -- the app's
 * own top-level rendered element -- and walk `.return` up to the true root
 * fiber before walking back down through every child/sibling, to make sure
 * we scan the entire tree, not just the Mafia subtree.
 */
async function collectAllHookStates(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const anchor = document.querySelector(".mafia-stage, .mafia-arm");
    if (!anchor) return [];
    const fiberKey = Object.keys(anchor).find((k) => k.startsWith("__reactFiber$"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rootFiber: any = fiberKey ? (anchor as unknown as Record<string, unknown>)[fiberKey] : null;
    while (rootFiber && rootFiber.return) rootFiber = rootFiber.return;

    const out: unknown[] = [];
    const seen = new Set<unknown>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function walk(fiber: any) {
      if (!fiber || seen.has(fiber)) return;
      seen.add(fiber);
      const firstHook = fiber.memoizedState;
      if (firstHook && typeof firstHook === "object" && "next" in firstHook) {
        let h = firstHook;
        while (h) {
          out.push(h.memoizedState);
          h = h.next;
        }
      }
      if (fiber.child) walk(fiber.child);
      if (fiber.sibling) walk(fiber.sibling);
    }
    walk(rootFiber);
    return out;
  });
}

/** True if `v` is a plain object mapping 2+ keys to ONLY "mafia" / "villager" strings. */
function isRoleRoster(v: unknown): boolean {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const values = Object.values(v as Record<string, unknown>);
  if (values.length < 2) return false;
  return values.every((x) => x === "mafia" || x === "villager");
}

test("no peer's in-memory React state ever holds another player's role (role-secrecy leak)", async ({
  browser,
  baseURL,
}) => {
  const { peers, cleanup } = await openNPeers(browser, baseURL ?? "", {
    storagePrefix,
    count: 4,
    roomId: `e2e-secrecy-${Math.random().toString(36).slice(2, 8)}`,
  });
  try {
    const names = ["Ana", "Bo", "Cy", "Di"];
    for (let i = 0; i < peers.length; i++) {
      await joinLobby(peers[i]!, names[i]!, 2);
    }
    for (const p of peers) {
      await expect(p.locator(".mafia-hud")).toContainText("4 players");
    }

    await peers[0]!.getByRole("button", { name: /deal roles/i }).click();
    await expect(peers[1]!.locator(".mafia-help")).toContainText("Committed: 4 / 4", {
      timeout: 15_000,
    });
    const revealBtn = peers[1]!.getByRole("button", { name: /all committed/i });
    await expect(revealBtn).toBeEnabled({ timeout: 15_000 });
    await revealBtn.click();
    for (const p of peers) {
      await expect(
        p.locator(".mafia-stage.mafia-role-mafia, .mafia-stage.mafia-role-villager"),
      ).toHaveCount(1, { timeout: 15_000 });
    }

    // The actual security assertion: scan EVERY peer's full React state tree
    // for anything shaped like a roster of >= 2 players' roles. None should
    // exist anywhere -- each peer must only ever hold its own role (and,
    // if mafia, teammate ids -- never role labels for non-teammates).
    for (const p of peers) {
      const hookStates = await collectAllHookStates(p);
      const leaks = hookStates.filter(isRoleRoster);
      expect(leaks, `peer state contained a role roster: ${JSON.stringify(leaks)}`).toHaveLength(0);
    }
  } finally {
    await cleanup();
  }
});

test("mafiaCount is synced from the presser's device to every peer, not read from each phone's own local Settings", async ({
  browser,
  baseURL,
}) => {
  // 6 players so floor(playerCount / 2) = 3, distinguishing a presser value
  // of 3 from a stale/different local value of 1 on another device.
  const { peers, cleanup } = await openNPeers(browser, baseURL ?? "", {
    storagePrefix,
    count: 6,
    roomId: `e2e-config-sync-${Math.random().toString(36).slice(2, 8)}`,
  });
  try {
    const names = ["Ana", "Bo", "Cy", "Di", "Ed", "Fi"];
    // Peer 0 (the presser) has mafiaCount=3 on its own device. Every other
    // peer has a DIFFERENT local value (1) -- e.g. left over from a smaller
    // game earlier that night. Before the fix, each peer would have used
    // its OWN local value to compute roles; after the fix, only the
    // presser's value (published to the shared yConfig map) matters.
    for (let i = 0; i < peers.length; i++) {
      await joinLobby(peers[i]!, names[i]!, i === 0 ? 3 : 1);
    }
    for (const p of peers) {
      await expect(p.locator(".mafia-hud")).toContainText("6 players");
    }

    await peers[0]!.getByRole("button", { name: /deal roles/i }).click();
    await expect(peers[1]!.locator(".mafia-help")).toContainText("Committed: 6 / 6", {
      timeout: 15_000,
    });
    const revealBtn = peers[1]!.getByRole("button", { name: /all committed/i });
    await expect(revealBtn).toBeEnabled({ timeout: 15_000 });
    await revealBtn.click();
    for (const p of peers) {
      await expect(
        p.locator(".mafia-stage.mafia-role-mafia, .mafia-stage.mafia-role-villager"),
      ).toHaveCount(1, { timeout: 15_000 });
    }

    // Every peer's own self-reported role must have been derived from the
    // SAME mafia count (3, the presser's), regardless of that peer's own
    // stale local Settings value (1). Summed across the whole table this
    // must land on exactly 3 -- deterministically, not "usually" -- because
    // every peer now truncates the identical shuffle at the identical
    // point.
    const roles = await Promise.all(
      peers.map(async (p) => {
        const isMafia = (await p.locator(".mafia-stage.mafia-role-mafia").count()) === 1;
        return isMafia ? "mafia" : "villager";
      }),
    );
    const mafiaTotal = roles.filter((r) => r === "mafia").length;
    expect(mafiaTotal, `roles dealt: ${roles.join(",")}`).toBe(3);
  } finally {
    await cleanup();
  }
});
