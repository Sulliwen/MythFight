type SpawnButtonProps = {
    onSpawn: () => void;
    disabled?: boolean;
  };
  
  export function SpawnButton({ onSpawn, disabled = false }: SpawnButtonProps) {
    return (
      <button onClick={onSpawn} disabled={disabled} style={{ marginTop: 12, padding: "8px 12px" }}>
        Spawn unit
      </button>
    );
  }  