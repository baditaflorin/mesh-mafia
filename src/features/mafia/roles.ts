export type Role = "mafia" | "villager";

/**
 * Number of mafia to deal for a given table size, given a requested count.
 * Clamped to [1, floor(playerCount / 2)] so mafia never form a majority and
 * there's always at least one wolf.
 *
 * IMPORTANT: every peer in a room must call this with the SAME
 * `requestedMafiaCount`. It must come from a value synced over the shared
 * Yjs doc (see `Mafia.tsx`'s `yConfig` map), never from each phone's own
 * local Settings-drawer value — those are per-device and are NOT
 * guaranteed to agree across peers, which previously caused different
 * phones to deal a different number of mafia from the identical shuffle.
 */
export function computeMafiaCount(playerCount: number, requestedMafiaCount: number): number {
  return Math.max(1, Math.min(Math.floor(playerCount / 2), requestedMafiaCount));
}

/**
 * Assign roles to every id in `shuffledIds` (already seeded-shuffled via the
 * commit-reveal entropy). The first `computeMafiaCount(...)` ids are mafia.
 *
 * This returns the FULL roster's roles because the shuffle + count are both
 * public (every peer needs to run this to find its own role). Callers MUST
 * NOT persist the full return value in long-lived UI state — only the
 * caller's own role (and, if the caller is mafia, its teammates' ids, which
 * mafia are meant to know) should be kept. Storing the whole map in React
 * state makes every player's role trivially readable from any other peer's
 * own browser (React DevTools / console), defeating hidden-role secrecy.
 */
export function assignRoles(
  shuffledIds: string[],
  requestedMafiaCount: number,
): Record<string, Role> {
  const m = computeMafiaCount(shuffledIds.length, requestedMafiaCount);
  const roles: Record<string, Role> = {};
  shuffledIds.forEach((id, i) => {
    roles[id] = i < m ? "mafia" : "villager";
  });
  return roles;
}
