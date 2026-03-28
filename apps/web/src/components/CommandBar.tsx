import { CREATURE_DISPLAY_STATS } from "../creature-stats";
import type { PlayerId, SelectionTarget, SnapshotMsg } from "../types";

type CommandBarProps = {
  buildModeActive: boolean;
  onToggleBuildMode: () => void;
  disabled: boolean;
  selection: SelectionTarget;
  snapshots: SnapshotMsg[];
  controlledPlayer: PlayerId;
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
      <span className="cmd-bar__stat-value">{hp}/{maxHp}</span>
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

function UnitInfo({ unit }: { unit: { hp: number; creatureId: string; vx: number; state: string; owner: string } }) {
  const stats = CREATURE_DISPLAY_STATS[unit.creatureId as keyof typeof CREATURE_DISPLAY_STATS];
  const ownerLabel = unit.owner === "player1" ? "J1" : "J2";
  const stateLabel = unit.state === "moving" ? "En marche" : "Attaque";
  return (
    <div className="cmd-bar__info">
      <strong className="cmd-bar__info-title">Golem ({ownerLabel})</strong>
      <div className="cmd-bar__info-stats">
        <span>PV: {unit.hp}/{stats?.hp ?? "?"}</span>
        <span>Degats: {stats?.attackDamage ?? "?"}</span>
        <span>Vitesse: {stats?.moveSpeed ?? "?"}</span>
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
}: CommandBarProps) {
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  let centerContent: React.ReactNode = <span className="cmd-bar__center-empty">Aucune selection</span>;
  let showBuildActions = false;

  if (selection && latest) {
    if (selection.kind === "castle") {
      const hp = latest.castle[selection.owner];
      centerContent = <CastleInfo owner={selection.owner} hp={hp} />;
      showBuildActions = selection.owner === controlledPlayer;
    } else if (selection.kind === "building") {
      const building = latest.buildings?.find((b) => b.id === selection.id);
      if (building) {
        centerContent = <BuildingInfo building={building} />;
      } else {
        centerContent = <span className="cmd-bar__center-empty">Batiment detruit</span>;
      }
    } else if (selection.kind === "unit") {
      const unit = latest.units?.find((u) => u.id === selection.id);
      if (unit) {
        centerContent = <UnitInfo unit={unit} />;
      } else {
        centerContent = <span className="cmd-bar__center-empty">Unite eliminee</span>;
      }
    }
  }

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
        {showBuildActions ? (
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
        ) : (
          <>
            <div className="cmd-bar__action-slot" />
            <div className="cmd-bar__action-slot" />
            <div className="cmd-bar__action-slot" />
            <div className="cmd-bar__action-slot" />
            <div className="cmd-bar__action-slot" />
            <div className="cmd-bar__action-slot" />
          </>
        )}
      </div>
    </div>
  );
}
