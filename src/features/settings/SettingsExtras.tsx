type Props = {
  myName: string;
  onMyNameChange: (next: string) => void;
  mafiaCount: number;
  onMafiaCountChange: (next: number) => void;
};

export function SettingsExtras({ myName, onMyNameChange, mafiaCount, onMafiaCountChange }: Props) {
  return (
    <>
      <label>
        <span>Your name</span>
        <input
          value={myName}
          onChange={(e) => onMyNameChange(e.target.value)}
          placeholder="Anonymous"
        />
      </label>

      <label>
        <span>Mafia count (set on the host phone; players can ignore)</span>
        <input
          type="number"
          min={1}
          max={10}
          value={mafiaCount}
          onChange={(e) =>
            onMafiaCountChange(Math.max(1, Math.min(10, Number(e.target.value) || 2)))
          }
        />
      </label>
    </>
  );
}
