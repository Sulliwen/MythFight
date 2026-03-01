type SpawnButtonProps = {
  onSpawn: () => void;
  disabled?: boolean;
  label?: string;
};

export function SpawnButton({ onSpawn, disabled = false, label = "Spawn unit" }: SpawnButtonProps) {
  return (
    <button onClick={onSpawn} disabled={disabled} style={{ marginTop: 12, padding: "8px 12px" }}>
      {label}
    </button>
  );
}
