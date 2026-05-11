import { useEffect, useState } from "react";
import { Mafia } from "./features/mafia/Mafia";
import { SettingsDrawer } from "./features/settings/SettingsDrawer";
import { appConfig } from "./shared/config";

const STORAGE = {
  room: `${appConfig.storagePrefix}:room`,
  name: `${appConfig.storagePrefix}:name`,
  mafiaCount: `${appConfig.storagePrefix}:mafiaCount`,
};

export function App() {
  const [roomId, setRoomId] = useState(() => localStorage.getItem(STORAGE.room) ?? "default");
  const [myName, setMyName] = useState(() => localStorage.getItem(STORAGE.name) ?? "");
  const [mafiaCount, setMafiaCount] = useState(() =>
    Math.max(1, Number(localStorage.getItem(STORAGE.mafiaCount) ?? "2")),
  );
  const [settingsOpen, setSettingsOpen] = useState(!myName);

  useEffect(() => {
    localStorage.setItem(STORAGE.room, roomId);
  }, [roomId]);
  useEffect(() => {
    localStorage.setItem(STORAGE.name, myName);
  }, [myName]);
  useEffect(() => {
    localStorage.setItem(STORAGE.mafiaCount, String(mafiaCount));
  }, [mafiaCount]);

  return (
    <div className="app-root">
      <Mafia roomId={roomId} myName={myName || "Anonymous"} mafiaCount={mafiaCount} />

      <button
        type="button"
        className="settings-fab"
        onClick={() => setSettingsOpen(true)}
        aria-label="Open settings"
      >
        ⚙
      </button>

      <div className="self-ref">
        <a href={appConfig.repositoryUrl} target="_blank" rel="noreferrer">
          source
        </a>
        <span aria-hidden="true">·</span>
        <a href={appConfig.paypalUrl} target="_blank" rel="noreferrer">
          tip ♥
        </a>
        <span aria-hidden="true">·</span>
        <span>
          v{appConfig.version} · {appConfig.commit}
        </span>
      </div>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        roomId={roomId}
        onRoomChange={setRoomId}
        myName={myName}
        onMyNameChange={setMyName}
        mafiaCount={mafiaCount}
        onMafiaCountChange={setMafiaCount}
      />
    </div>
  );
}
