import { useEffect, useState } from "react";
import { MeshShell } from "@baditaflorin/mesh-common";
import { Mafia } from "./features/mafia/Mafia";
import { SettingsExtras } from "./features/settings/SettingsExtras";
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
    <MeshShell
      config={appConfig}
      roomId={roomId}
      onRoomChange={setRoomId}
      settingsExtras={
        <SettingsExtras
          myName={myName}
          onMyNameChange={setMyName}
          mafiaCount={mafiaCount}
          onMafiaCountChange={setMafiaCount}
        />
      }
    >
      <Mafia roomId={roomId} myName={myName || "Anonymous"} mafiaCount={mafiaCount} />
    </MeshShell>
  );
}
