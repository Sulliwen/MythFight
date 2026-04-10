import { CREATURE_IDS, getCreaturePresentation } from "../creature-config";
import { getBuildingPresentation, CREATURE_TO_BUILDING } from "../building-config";
import { useTranslation, type TranslationKey } from "../i18n";
import type { BuildMode } from "./lane-canvas/types";
import type { BuildingId, CreatureId, PlayerId, SelectionTarget, SnapshotMsg } from "../types";

type CommandBarProps = {
  buildMode: BuildMode;
  onToggleBuildMode: (creatureId: CreatureId) => void;
  disabled: boolean;
  selection: SelectionTarget;
  snapshots: SnapshotMsg[];
  controlledPlayer: PlayerId;
  onToggleProduction: (buildingId: string) => void;
  onForceSpawn: (buildingId: string) => void;
  onToggleFlight: (unitId: string) => void;
};

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

function SpawnProgress({ remaining, total }: { remaining: number; total: number }) {
  const { t } = useTranslation();
  const elapsed = total - remaining;
  const ratio = total > 0 ? Math.max(0, Math.min(1, elapsed / total)) : 0;
  const pct = Math.round(ratio * 100);
  const seconds = (remaining / 20).toFixed(1);
  return (
    <div className="cmd-bar__stat-row">
      <span className="cmd-bar__stat-label">{t("stats.spawn")}</span>
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

function BuildingInfo({ building }: { building: { buildingId: BuildingId; hp: number; maxHp: number; owner: string; spawnTicksRemaining: number; spawnIntervalTicks: number } }) {
  const { t } = useTranslation();
  const ownerLabel = building.owner === "player1" ? "J1" : "J2";
  const presentation = getBuildingPresentation(building.buildingId);
  return (
    <div className="cmd-bar__info">
      <strong className="cmd-bar__info-title">{t(presentation.nameKey)} ({ownerLabel})</strong>
      <HpBar hp={building.hp} maxHp={building.maxHp} label={t("stats.hp")} />
      {presentation.spawnsCreature && (
        <SpawnProgress remaining={building.spawnTicksRemaining} total={building.spawnIntervalTicks} />
      )}
    </div>
  );
}

function BuildingStats({ buildingId }: { buildingId: BuildingId }) {
  const { t } = useTranslation();
  const presentation = getBuildingPresentation(buildingId);
  return (
    <div className="cmd-bar__stats-list">
      <span>🛡️ {t(`combat.armorType.${presentation.armorType}`)}</span>
      <span>🔰 {presentation.armor}</span>
      {presentation.spawnIntervalTicks != null && (
        <span>⏱️ {(presentation.spawnIntervalTicks / 20).toFixed(0)}s</span>
      )}
    </div>
  );
}

function UnitInfo({
  unit,
}: {
  unit: { hp: number; maxHp: number; creatureId: CreatureId; state: string; owner: string; flying: boolean };
}) {
  const { t } = useTranslation();
  const ownerLabel = unit.owner === "player1" ? "J1" : "J2";
  const presentation = getCreaturePresentation(unit.creatureId);
  const stateLabel = unit.flying
    ? t("combat.state.flying")
    : unit.state === "moving"
      ? t("combat.state.moving")
      : unit.state === "attacking_unit"
        ? t("combat.state.attackingUnit")
        : unit.state === "attacking_building"
          ? t("combat.state.attackingBuilding")
          : t("combat.state.attacking");
  return (
    <div className="cmd-bar__info">
      <strong className="cmd-bar__info-title">{t(presentation.unitNameKey)} ({ownerLabel})</strong>
      <HpBar hp={unit.hp} maxHp={unit.maxHp} label={t("stats.hp")} />
      <span className="cmd-bar__info-state">{stateLabel}</span>
    </div>
  );
}

function UnitStats({ creatureStats }: { creatureStats?: { attackDamage: number; armor: number; attackType: string; armorType: string; moveSpeedPerTick: number; attackIntervalTicks: number } }) {
  const { t } = useTranslation();
  if (!creatureStats) return <div className="cmd-bar__stats-list"><span>⏳</span></div>;
  const dps = (creatureStats.attackDamage / (creatureStats.attackIntervalTicks / 20)).toFixed(1);
  const atkKey = `combat.attackType.${creatureStats.attackType}` as TranslationKey;
  const armKey = `combat.armorType.${creatureStats.armorType}` as TranslationKey;
  return (
    <div className="cmd-bar__stats-list">
      <span>⚔️ {creatureStats.attackDamage} ({t(atkKey)})</span>
      <span>💥 {dps} DPS</span>
      <span>🏃 {creatureStats.moveSpeedPerTick}</span>
      <span>🛡️ {t(armKey)}</span>
      <span>🔰 {creatureStats.armor}</span>
    </div>
  );
}

export function CommandBar({
  buildMode,
  onToggleBuildMode,
  disabled,
  selection,
  snapshots,
  controlledPlayer,
  onToggleProduction,
  onForceSpawn,
  onToggleFlight,
}: CommandBarProps) {
  const { t } = useTranslation();
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  let centerContent: React.ReactNode = <span className="cmd-bar__center-empty">{t("ui.noSelection")}</span>;
  let statsContent: React.ReactNode = null;
  let showBuildActions = false;
  let showBuildingActions = false;
  let selectedBuilding: { id: string; paused: boolean; owner: string } | null = null;
  let showUnitActions = false;
  let selectedUnit: { id: string; flying: boolean; canFly: boolean } | null = null;

  if (selection && latest) {
    if (selection.kind === "building") {
      const building = latest.buildings?.find((b) => b.id === selection.id);
      if (building) {
        centerContent = <BuildingInfo building={building} />;
        statsContent = <BuildingStats buildingId={building.buildingId} />;
        if (building.owner === controlledPlayer) {
          if (building.buildingId === "castle") {
            // Castle selected by owner: show build actions
            showBuildActions = true;
          } else {
            // Spawner building selected by owner: show production controls
            showBuildingActions = true;
            selectedBuilding = { id: building.id, paused: building.paused, owner: building.owner };
          }
        }
      } else {
        centerContent = <span className="cmd-bar__center-empty">{t("ui.buildingDestroyed")}</span>;
      }
    } else if (selection.kind === "unit") {
      const unit = latest.units?.find((u) => u.id === selection.id);
      if (unit) {
        centerContent = <UnitInfo unit={unit} />;
        statsContent = <UnitStats creatureStats={latest.creatureStats?.[unit.creatureId]} />;
        const creatureStatsSnap = latest.creatureStats?.[unit.creatureId];
        if (unit.owner === controlledPlayer && creatureStatsSnap?.canFly) {
          showUnitActions = true;
          selectedUnit = { id: unit.id, flying: unit.flying, canFly: creatureStatsSnap.canFly };
        }
      } else {
        centerContent = <span className="cmd-bar__center-empty">{t("ui.unitEliminated")}</span>;
      }
    }
  }

  const renderActions = () => {
    if (showBuildActions) {
      return (
        <>
          {CREATURE_IDS.map((creatureId) => {
            const buildingId = CREATURE_TO_BUILDING[creatureId];
            const buildingPresentation = getBuildingPresentation(buildingId);
            const isActive = buildMode.active && buildMode.creatureId === creatureId;
            return (
              <button
                key={creatureId}
                type="button"
                className={`cmd-bar__action-btn ${isActive ? "cmd-bar__action-btn--active" : ""}`}
                onClick={() => onToggleBuildMode(creatureId)}
                disabled={disabled}
                title={t("actions.build", { building: t(buildingPresentation.nameKey) })}
              >
                <img
                  src={buildingPresentation.textureUrl}
                  alt={t(buildingPresentation.nameKey)}
                  className="cmd-bar__action-icon"
                />
              </button>
            );
          })}
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
            title={selectedBuilding.paused ? t("actions.resumeProduction") : t("actions.stopProduction")}
          >
            {selectedBuilding.paused ? "\u25B6" : "\u23F8"}
          </button>
          <button
            type="button"
            className="cmd-bar__action-btn"
            onClick={() => onForceSpawn(bId)}
            disabled={disabled}
            title={t("actions.forceSpawn")}
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

    if (showUnitActions && selectedUnit) {
      return (
        <>
          {selectedUnit.canFly && (
            <button
              type="button"
              className={`cmd-bar__action-btn ${selectedUnit.flying ? "cmd-bar__action-btn--active" : ""}`}
              onClick={() => onToggleFlight(selectedUnit!.id)}
              disabled={disabled}
              title={t("actions.toggleFlight")}
            >
              {"\u{1F985}"}
            </button>
          )}
          <div className="cmd-bar__action-slot" />
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
        <span className="cmd-bar__minimap-label">{t("ui.map")}</span>
      </div>

      {/* Center panel: selection info */}
      <div className="cmd-bar__center">
        {centerContent}
      </div>

      {/* Stats panel: characteristics */}
      <div className="cmd-bar__stats">
        {statsContent}
      </div>

      {/* Right panel: action grid */}
      <div className="cmd-bar__actions">
        {renderActions()}
      </div>
    </div>
  );
}
