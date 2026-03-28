type CommandBarProps = {
  buildModeActive: boolean;
  onToggleBuildMode: () => void;
  disabled: boolean;
};

export function CommandBar({
  buildModeActive,
  onToggleBuildMode,
  disabled,
}: CommandBarProps) {
  return (
    <div className="cmd-bar">
      {/* Left panel: minimap placeholder */}
      <div className="cmd-bar__minimap">
        <span className="cmd-bar__minimap-label">Carte</span>
      </div>

      {/* Center panel: selected unit info (empty for now) */}
      <div className="cmd-bar__center">
        <span className="cmd-bar__center-empty">Aucune selection</span>
      </div>

      {/* Right panel: action grid */}
      <div className="cmd-bar__actions">
        <button
          type="button"
          className={`cmd-bar__action-btn ${buildModeActive ? "cmd-bar__action-btn--active" : ""}`}
          onClick={onToggleBuildMode}
          disabled={disabled}
          title="Construire Golem House (B)"
        >
          <img
            src="/sprites/JC/buildings/Golem_house.png"
            alt="Golem House"
            className="cmd-bar__action-icon"
          />
        </button>
        {/* Empty slots for future actions */}
        <div className="cmd-bar__action-slot" />
        <div className="cmd-bar__action-slot" />
        <div className="cmd-bar__action-slot" />
        <div className="cmd-bar__action-slot" />
        <div className="cmd-bar__action-slot" />
      </div>
    </div>
  );
}
