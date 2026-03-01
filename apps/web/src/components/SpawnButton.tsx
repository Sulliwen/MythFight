type SpawnButtonProps = {
  onSpawn: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
};

export function SpawnButton({
  onSpawn,
  disabled = false,
  label = "Spawn unit",
  className,
}: SpawnButtonProps) {
  return (
    <button onClick={onSpawn} disabled={disabled} className={className}>
      {label}
    </button>
  );
}
