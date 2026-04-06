import type { PlayerId, SelectionTarget, SnapshotMsg } from "../types";

type CommandBarProps = {
  buildModeActive: boolean;
  onToggleBuildMode: () => void;
  disabled: boolean;
  selection: SelectionTarget;
  snapshots: SnapshotMsg[];
  controlledPlayer: PlayerId;
  onToggleProduction: (buildingId: string) => void;
  onForceSpawn: (buildingId: string) => void;
};

const CASTLE_HP_MAX = 1000;

function hpColor(ratio: number): string {
  if (ratio > 0.6) return "#22c55e";
  if (ratio > 0.3) return "#f59e0b";
  return "#ef4444";
}

function HpBar({ hp, maxHp, label }: { hp: number; maxHp: number; label?: string }) {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const pct = Math.round(ratio * 100);
  return (
    <div className="cmd-bar__stat-row">
      {label && <span className="cmd-bar__stat-label">{label}</span>}
      <div className="cmd-bar__stat-bar">
        <div
          className="cmd-bar__stat-bar-fill"
          style={{ width: `${pct}%`, background: hpColor(ratio) }}
        />
      </div>
      <span className="cmd-bar__stat-value">{Math.round(hp)}/{Math.round(maxHp)}</span>
    </div>
  );
}

function CastleInfo({ owner, hp }: { owner: string; hp: number }) {
  const label = owner === "player1" ? "Chateau J1" : "Chateau J2";
  return (
    <div className="cmd-bar__info">
      <strong className="cmd-bar__info-title">{label}</strong>
      <HpBar hp={hp} maxHp={CASTLE_HP_MAX} label="PV" />
    </div>
  );
}

function SpawnProgress({ remaining, total }: { remaining: number; total: number }) {
  const elapsed = total - remaining;
  const ratio = total > 0 ? Math.max(0, Math.min(1, elapsed / total)) : 0;
  const pct = Math.round(ratio * 100);
  const seconds = (remaining / 20).toFixed(1);
  return (
    <div className="cmd-bar__stat-row">
      <span className="cmd-bar__stat-label">Spawn</span>
      <div className="cmd-bar__stat-bar">
        <div
          className="cmd-bar__stat-bar-fill cmd-bar__stat-bar-fill--spawn"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="cmd-bar__stat-value">{seconds}s</span>
    </div>
  );
}

function BuildingInfo({ building }: { building: { creatureId: string; hp: number; maxHp: number; owner: string; spawnTicksRemaining: number; spawnIntervalTicks: number } }) {
  const ownerLabel = building.owner === "player1" ? "J1" : "J2";
  return (
    <div className="cmd-bar__info">
      <strong className="cmd-bar__info-title">Golem House ({ownerLabel})</strong>
      <HpBar hp={building.hp} maxHp={building.maxHp} label="PV" />
      <SpawnProgress remaining={building.spawnTicksRemaining} total={building.spawnIntervalTicks} />
    </div>
  );
}

function UnitInfo({
  unit,
  creatureStats,
}: {
  unit: { hp: number; maxHp: number; creatureId: string; state: string; owner: string };
  creatureStats?: { attackDamage: number; armor: number; attackType: string; armorType: string; moveSpeedPerTick: number };
}) {
  const ownerLabel = unit.owner === "player1" ? "J1" : "J2";
  const stateLabel =
    unit.state === "moving" ? "En marche" : unit.state === "attacking_unit" ? "Combat" : "Attaque";
  return (
    <div className="cmd-bar__info">
      <strong className="cmd-bar__info-title">Golem ({ownerLabel})</strong>
      <HpBar hp={unit.hp} maxHp={unit.maxHp} label="PV" />
      <div className="cmd-bar__info-stats">
        <span>Degats: {creatureStats?.attackDamage ?? "?"}</span>
        <span>Vitesse: {creatureStats?.moveSpeedPerTick ?? "?"}</span>
        <span>Type atk: {creatureStats?.attackType ?? "?"}</span>
        <span>Type armure: {creatureStats?.armorType ?? "?"}</span>
        <span>Armure: {creatureStats?.armor ?? "?"}</span>
        <span>Etat: {stateLabel}</span>
      </div>
    </div>
  );
}

export function CommandBar({
  buildModeActive,
  onToggleBuildMode,
  disabled,
  selection,
  snapshots,
  controlledPlayer,
  onToggleProduction,
  onForceSpawn,
}: CommandBarProps) {
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  let centerContent: React.ReactNode = <span className="cmd-bar__center-empty">Aucune selection</span>;
  let showBuildActions = false;
  let showBuildingActions = false;
  let selectedBuilding: { id: string; paused: boolean; owner: string } | null = null;

  if (selection && latest) {
    if (selection.kind === "castle") {
      const hp = latest.castle[selection.owner];
      centerContent = <CastleInfo owner={selection.owner} hp={hp} />;
      showBuildActions = selection.owner === controlledPlayer;
    } else if (selection.kind === "building") {
      const building = latest.buildings?.find((b) => b.id === selection.id);
      if (building) {
        centerContent = <BuildingInfo building={building} />;
        if (building.owner === controlledPlayer) {
          showBuildingActions = true;
          selectedBuilding = { id: building.id, paused: building.paused, owner: building.owner };
        }
      } else {
        centerContent = <span className="cmd-bar__center-empty">Batiment detruit</span>;
      }
    } else if (selection.kind === "unit") {
      const unit = latest.units?.find((u) => u.id === selection.id);
      if (unit) {
        centerContent = <UnitInfo unit={unit} creatureStats={latest.creatureStats?.[unit.creatureId]} />;
      } else {
        centerContent = <span className="cmd-bar__center-empty">Unite eliminee</span>;
      }
    }
  }

  const renderActions = () => {
    if (showBuildActions) {
      return (
        <>
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
          <div className="cmd-bar__action-slot" />
          <div className="cmd-bar__action-slot" />
          <div className="cmd-bar__action-slot" />
          <div className="cmd-bar__action-slot" />
          <div className="cmd-bar__action-slot" />
        </>
      );
    }

    if (showBuildingActions && selectedBuilding) {
      const bId = selectedBuilding.id;
      return (
        <>
          <button
            type="button"
            className={`cmd-bar__action-btn ${selectedBuilding.paused ? "cmd-bar__action-btn--active" : ""}`}
            onClick={() => onToggleProduction(bId)}
            disabled={disabled}
            title={selectedBuilding.paused ? "Reprendre la production" : "Arreter la production"}
          >
            {selectedBuilding.paused ? "\u25B6" : "\u23F8"}
          </button>
          <button
            type="button"
            className="cmd-bar__action-btn"
            onClick={() => onForceSpawn(bId)}
            disabled={disabled}
            title="Spawn immediat"
          >
            {"\u26A1"}
          </button>
          <div className="cmd-bar__action-slot" />
          <div className="cmd-bar__action-slot" />
          <div className="cmd-bar__action-slot" />
          <div className="cmd-bar__action-slot" />
        </>
      );
    }

    return (
      <>
        <div className="cmd-bar__action-slot" />
        <div className="cmd-bar__action-slot" />
        <div className="cmd-bar__action-slot" />
        <div className="cmd-bar__action-slot" />
        <div className="cmd-bar__action-slot" />
        <div className="cmd-bar__action-slot" />
      </>
    );
  };

  return (
    <div className="cmd-bar">
      {/* Left panel: minimap placeholder */}
      <div className="cmd-bar__minimap">
        <span className="cmd-bar__minimap-label">Carte</span>
      </div>

      {/* Center panel: selection info */}
      <div className="cmd-bar__center">
        {centerContent}
      </div>

      {/* Right panel: action grid */}
      <div className="cmd-bar__actions">
        {renderActions()}
      </div>
    </div>
  );
}
