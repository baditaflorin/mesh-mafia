import { useEffect, useMemo, useRef, useState } from "react";
import { createRoomSync } from "../sync/yjsRoom";
import { createClockSync } from "../sync/clockSync";
import { maybeFetchTurnCredentials } from "../sync/iceConfig";
import { combineSeeds, commitSeed, randomSeedHex, seededShuffle, verifyCommit } from "./crypto";

export type Role = "mafia" | "villager";
export type Phase = "lobby" | "commit" | "reveal" | "night" | "day";

type Player = { id: string; name: string };
type Commit = { commitment: string };
type Reveal = { seed: string };

type Props = {
  roomId: string;
  myName: string;
  mafiaCount: number;
};

export function Mafia({ roomId, myName, mafiaCount }: Props) {
  const [armed, setArmed] = useState(false);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [commitments, setCommitments] = useState<Record<string, Commit>>({});
  const [reveals, setReveals] = useState<Record<string, Reveal>>({});
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [myId, setMyId] = useState("");
  const seedRef = useRef<string>("");

  const mesh = useMemo(() => {
    if (!armed) return null;
    const room = createRoomSync(roomId);
    const clock = createClockSync(room.provider);
    const yPlayers = room.doc.getMap<Player>("players");
    const yCommits = room.doc.getMap<Commit>("commits");
    const yReveals = room.doc.getMap<Reveal>("reveals");
    const yPhase = room.doc.getMap<{ phase: Phase }>("phase");
    const id = crypto.randomUUID();
    return { room, clock, yPlayers, yCommits, yReveals, yPhase, id };
  }, [armed, roomId]);

  useEffect(() => {
    if (!armed) return;
    void maybeFetchTurnCredentials();
  }, [armed]);

  useEffect(() => {
    if (!mesh) return;
    setMyId(mesh.id);
    mesh.yPlayers.set(mesh.id, { id: mesh.id, name: myName });

    const refresh = () => {
      setPlayers(Array.from(mesh.yPlayers.values()).sort((a, b) => a.id.localeCompare(b.id)));
      setCommitments(Object.fromEntries(mesh.yCommits.entries()));
      setReveals(Object.fromEntries(mesh.yReveals.entries()));
      const p = mesh.yPhase.get("current")?.phase ?? "lobby";
      setPhase(p);
    };

    mesh.yPlayers.observe(refresh);
    mesh.yCommits.observe(refresh);
    mesh.yReveals.observe(refresh);
    mesh.yPhase.observe(refresh);
    refresh();

    return () => {
      mesh.yPlayers.unobserve(refresh);
      mesh.yCommits.unobserve(refresh);
      mesh.yReveals.unobserve(refresh);
      mesh.yPhase.unobserve(refresh);
    };
  }, [mesh, myName]);

  useEffect(() => {
    return () => {
      mesh?.clock.destroy();
      mesh?.room.provider?.destroy();
    };
  }, [mesh]);

  // When entering commit phase, generate seed + commitment
  useEffect(() => {
    if (!mesh || phase !== "commit") return;
    if (mesh.yCommits.has(mesh.id)) return;
    const seed = randomSeedHex();
    seedRef.current = seed;
    void (async () => {
      const commitment = await commitSeed(seed);
      mesh.yCommits.set(mesh.id, { commitment });
    })();
  }, [mesh, phase]);

  // When all commits in and phase is reveal, publish seed
  useEffect(() => {
    if (!mesh || phase !== "reveal") return;
    if (mesh.yReveals.has(mesh.id)) return;
    if (!seedRef.current) return;
    mesh.yReveals.set(mesh.id, { seed: seedRef.current });
  }, [mesh, phase]);

  // When all reveals in, derive role assignment
  useEffect(() => {
    if (!mesh || phase !== "reveal") return;
    const ids = players.map((p) => p.id);
    if (ids.length === 0) return;
    if (!ids.every((id) => mesh.yReveals.has(id))) return;
    if (!ids.every((id) => mesh.yCommits.has(id))) return;
    void (async () => {
      // Verify each commit
      for (const id of ids) {
        const c = mesh.yCommits.get(id)?.commitment ?? "";
        const r = mesh.yReveals.get(id)?.seed ?? "";
        if (!(await verifyCommit(r, c))) {
          console.error(`[mafia] BAD COMMIT from ${id}`);
          return;
        }
      }
      const seeds = ids.map((id) => mesh.yReveals.get(id)!.seed);
      const entropy = combineSeeds(seeds);
      const shuffled = await seededShuffle(ids, entropy);
      const m = Math.max(1, Math.min(Math.floor(ids.length / 2), mafiaCount));
      const next: Record<string, Role> = {};
      shuffled.forEach((id, i) => {
        next[id] = i < m ? "mafia" : "villager";
      });
      setRoles(next);
    })();
  }, [mesh, phase, players, mafiaCount, reveals, commitments]);

  const advance = (next: Phase) => mesh?.yPhase.set("current", { phase: next });
  const restart = () => {
    if (!mesh) return;
    mesh.room.doc.transact(() => {
      mesh.yCommits.clear();
      mesh.yReveals.clear();
      mesh.yPhase.set("current", { phase: "lobby" });
    });
    setRoles({});
    seedRef.current = "";
  };

  if (!armed) {
    return (
      <div className="mafia-arm">
        <h1>mesh-mafia</h1>
        <p>
          Werewolf with phones as role cards. Roles are dealt by cryptographic commit-reveal, so no
          one phone (and no server) chooses who's the wolf.
        </p>
        <p>
          Open this link on every phone in your group — you need <strong>at least 4 players</strong>
          in the same room. Each player sets their name and joins the lobby; once 4+ are in, anyone
          can press <em>Deal roles</em> to start.
        </p>
        <button type="button" className="mafia-arm-button" onClick={() => setArmed(true)}>
          Join lobby as {myName || "(set name in Settings)"}
        </button>
      </div>
    );
  }

  const myRole = roles[myId];
  const allCommitted = players.length > 0 && players.every((p) => p.id in commitments);
  const allRevealed = players.length > 0 && players.every((p) => p.id in reveals);
  const waitingOnCommit = players.filter((p) => !(p.id in commitments)).map((p) => p.name);
  const waitingOnReveal = players.filter((p) => !(p.id in reveals)).map((p) => p.name);

  return (
    <div className={`mafia-stage mafia-phase-${phase} ${myRole ? `mafia-role-${myRole}` : ""}`}>
      <div className="mafia-hud">
        Phase: <strong>{phase}</strong> · {players.length} players
      </div>

      {phase === "lobby" && (
        <div className="mafia-panel">
          <h2>Lobby</h2>
          <ul className="mafia-players">
            {players.map((p) => (
              <li key={p.id} className={p.id === myId ? "me" : ""}>
                {p.name}
                {p.id === myId ? " (you)" : ""}
              </li>
            ))}
          </ul>
          <p className="mafia-help">Need ≥ 4 players. {mafiaCount} mafia, rest villagers.</p>
          <button type="button" disabled={players.length < 4} onClick={() => advance("commit")}>
            Deal roles
          </button>
        </div>
      )}

      {phase === "commit" && (
        <div className="mafia-panel">
          <h2>Committing entropy…</h2>
          <p>
            Every phone has generated a secret seed. Each phone publishes the
            <em> SHA-256 hash</em> of its seed first (commitment), then everyone reveals. That's why
            no peer can grind their seed to influence the role draw.
          </p>
          <p className="mafia-help">
            Committed: {Object.keys(commitments).length} / {players.length}
            {!allCommitted && waitingOnCommit.length > 0
              ? ` · waiting on ${waitingOnCommit.join(", ")}`
              : ""}
          </p>
          <button type="button" disabled={!allCommitted} onClick={() => advance("reveal")}>
            All committed → reveal
          </button>
        </div>
      )}

      {phase === "reveal" && (
        <div className="mafia-panel">
          <h2>Revealing seeds…</h2>
          <p className="mafia-help">
            Revealed: {Object.keys(reveals).length} / {players.length}
            {allRevealed && myRole ? " · roles dealt" : ""}
            {!allRevealed && waitingOnReveal.length > 0
              ? ` · waiting on ${waitingOnReveal.join(", ")}`
              : ""}
          </p>
          {myRole && (
            <>
              <p className="mafia-role-label">Your role:</p>
              <p className="mafia-role-big">{myRole === "mafia" ? "🐺 MAFIA" : "🌾 VILLAGER"}</p>
              <button type="button" onClick={() => advance("night")}>
                Begin night
              </button>
            </>
          )}
        </div>
      )}

      {phase === "night" && (
        <div className="mafia-night">
          {myRole === "mafia" ? (
            <>
              <h2>👁 Eyes open, mafia.</h2>
              <p>
                Look around the table — every red-glowing phone is a fellow mafia. Agree on a target
                silently. When everyone has seen, hit <em>Morning</em>.
              </p>
            </>
          ) : (
            <>
              <h2>Heads down.</h2>
              <p>If your phone is dark, you're a villager. Keep it face-down.</p>
            </>
          )}
          <button type="button" onClick={() => advance("day")}>
            Morning
          </button>
        </div>
      )}

      {phase === "day" && (
        <div className="mafia-panel">
          <h2>Day phase — discuss + vote</h2>
          <p>
            Talk it out, point fingers, lynch one player. (Voting happens by raised hand around the
            table, not on the phones.) When done, hit <em>Next night</em> — or
            <em> Restart</em> if the game is over.
          </p>
          <p className="mafia-role-big">{myRole === "mafia" ? "🐺 MAFIA" : "🌾 VILLAGER"}</p>
          <button type="button" onClick={() => advance("night")}>
            Next night
          </button>
          <button type="button" onClick={restart} className="mafia-restart">
            Restart game
          </button>
        </div>
      )}
    </div>
  );
}
