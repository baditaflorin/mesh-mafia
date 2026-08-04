import { describe, expect, it } from "vitest";
import { assignRoles, computeMafiaCount } from "../../src/features/mafia/roles";

describe("computeMafiaCount", () => {
  it("clamps to floor(playerCount / 2)", () => {
    expect(computeMafiaCount(4, 2)).toBe(2);
    expect(computeMafiaCount(4, 3)).toBe(2); // requested 3, but 4 players caps at 2
    expect(computeMafiaCount(4, 10)).toBe(2);
  });

  it("never goes below 1, even for a tiny/zero request", () => {
    expect(computeMafiaCount(4, 0)).toBe(1);
    expect(computeMafiaCount(4, -5)).toBe(1);
  });

  it("scales with player count", () => {
    expect(computeMafiaCount(6, 3)).toBe(3);
    expect(computeMafiaCount(7, 3)).toBe(3); // floor(7/2) = 3
    expect(computeMafiaCount(9, 5)).toBe(4); // floor(9/2) = 4 caps the request
  });
});

describe("assignRoles", () => {
  it("assigns exactly computeMafiaCount(...) mafia, rest villagers, no duplicates", () => {
    const ids = ["p0", "p1", "p2", "p3", "p4", "p5"];
    const roles = assignRoles(ids, 2);
    const values = Object.values(roles);
    expect(values.filter((r) => r === "mafia")).toHaveLength(2);
    expect(values.filter((r) => r === "villager")).toHaveLength(4);
    expect(Object.keys(roles).sort()).toEqual([...ids].sort());
  });

  it("assigns the first m shuffled ids as mafia (order-dependent, deterministic)", () => {
    const ids = ["a", "b", "c", "d"];
    const roles = assignRoles(ids, 2);
    expect(roles["a"]).toBe("mafia");
    expect(roles["b"]).toBe("mafia");
    expect(roles["c"]).toBe("villager");
    expect(roles["d"]).toBe("villager");
  });

  /**
   * Regression test for the cross-peer desync bug: Mafia.tsx used to feed
   * each PEER'S OWN local `mafiaCount` (a per-device Settings-drawer value,
   * never synced over Yjs) directly into this computation. Two peers who
   * observe the identical shuffled id list (as every peer does, since the
   * shuffle is a pure function of the publicly-revealed commit-reveal
   * entropy) but who have different local `mafiaCount` settings end up
   * disagreeing about who is mafia for the SAME room / SAME deal.
   *
   * This test documents why `mafiaCount` must be published once (by
   * whoever presses "Deal roles") to a shared Yjs value and READ from
   * there by every peer, rather than sourced from each phone's own
   * Settings drawer — see the `yConfig` map in `Mafia.tsx`.
   */
  it("diverges across peers when fed different (unsynced) mafiaCount values for the same shuffle", () => {
    const shuffledIds = ["p0", "p1", "p2", "p3"]; // identical on every peer once revealed
    const hostView = assignRoles(shuffledIds, 2); // host's own local setting: 2
    const staleDeviceView = assignRoles(shuffledIds, 1); // a peer whose device still has 1 from a prior smaller game

    // p1 is dealt mafia under the host's intended count, but the peer with a
    // stale local mafiaCount computes p1 as a villager for the exact same
    // shuffle -- a real player would be told the wrong role.
    expect(hostView["p1"]).toBe("mafia");
    expect(staleDeviceView["p1"]).toBe("villager");
    expect(hostView).not.toEqual(staleDeviceView);
  });
});
