import { CREATURE_BUILDING_STATS, CREATURE_IDS, getCreaturePresentation } from "../creature-config";
import { useTranslation, type TranslationKey } from "../i18n";
import type { BuildMode } from "./lane-canvas/types";
import type { CreatureId, PlayerId, SelectionTarget, SnapshotMsg } from "../types";

type CommandBarProps = {
  buildMode: BuildMode;
  onToggleBuildMode: (creatureId: CreatureId) => void;
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
  const { t } = useTranslation();
  const label = owner === "player1" ? t("castle.player1") : t("castle.player2");
  return (
    <div className="cmd-bar__info">
      <strong className="cmd-bar__info-title">{label}</strong>
      <HpBar hp={hp} maxHp={CASTLE_HP_MAX} label={t("stats.hp")} />
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

function BuildingInfo({ building }: { building: { creatureId: CreatureId; hp: number; maxHp: number; owner: string; spawnTicksRemaining: number; spawnIntervalTicks: number } }) {
  const { t } = useTranslation();
  const ownerLabel = building.owner === "player1" ? "J1" : "J2";
  const presentation = getCreaturePresentation(building.creatureId);
  return (
    <div className="cmd-bar__info">
      <strong className="cmd-bar__info-title">{t(presentation.buildingNameKey)} ({ownerLabel})</strong>
      <HpBar hp={building.hp} maxHp={building.maxHp} label={t("stats.hp")} />
      <SpawnProgress remaining={building.spawnTicksRemaining} total={building.spawnIntervalTicks} />
    </div>
  );
}

function CastleStats() {
  const { t } = useTranslation();
  return (
    <div className="cmd-bar__stats-list">
      <span>🛡️ {t("combat.armorType.fortified")}</span>
      <span>🔰 5</span>
    </div>
  );
}

function BuildingStats({ creatureId }: { creatureId: CreatureId }) {
  const { t } = useTranslation();
  const stats = CREATURE_BUILDING_STATS[creatureId];
  return (
    <div className="cmd-bar__stats-list">
      <span>🛡️ {t(`combat.armorType.${stats.armorType}`)}</span>
      <span>🔰 {stats.armor}</span>
      <span>⏱️ {(stats.spawnIntervalTicks / 20).toFixed(0)}s</span>
    </div>
  );
}

function UnitInfo({
  unit,
}: {
  unit: { hp: number; maxHp: number; creatureId: CreatureId; state: string; owner: string };
}) {
  const { t } = useTranslation();
  const ownerLabel = unit.owner === "player1" ? "J1" : "J2";
  const presentation = getCreaturePresentation(unit.creatureId);
  const stateLabel =
    unit.state === "moving"
      ? t("combat.state.moving")
      : unit.state === "attacking_unit"
        ? t("combat.state.attackingUnit")
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
}: CommandBarProps) {
  const { t } = useTranslation();
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  let centerContent: React.ReactNode = <span className="cmd-bar__center-empty">{t("ui.noSelection")}</span>;
  let statsContent: React.ReactNode = null;
  let showBuildActions = false;
  let showBuildingActions = false;
  let selectedBuilding: { id: string; paused: boolean; owner: string } | null = null;

  if (selection && latest) {
    if (selection.kind === "castle") {
      const hp = latest.castle[selection.owner];
      centerContent = <CastleInfo owner={selection.owner} hp={hp} />;
      statsContent = <CastleStats />;
      showBuildActions = selection.owner === controlledPlayer;
    } else if (selection.kind === "building") {
      const building = latest.buildings?.find((b) => b.id === selection.id);
      if (building) {
        centerContent = <BuildingInfo building={building} />;
        statsContent = <BuildingStats creatureId={building.creatureId} />;
        if (building.owner === controlledPlayer) {
          showBuildingActions = true;
          selectedBuilding = { id: building.id, paused: building.paused, owner: building.owner };
        }
      } else {
        centerContent = <span className="cmd-bar__center-empty">{t("ui.buildingDestroyed")}</span>;
      }
    } else if (selection.kind === "unit") {
      const unit = latest.units?.find((u) => u.id === selection.id);
      if (unit) {
        centerContent = <UnitInfo unit={unit} />;
        statsContent = <UnitStats creatureStats={latest.creatureStats?.[unit.creatureId]} />;
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
            const presentation = getCreaturePresentation(creatureId);
            const isActive = buildMode.active && buildMode.creatureId === creatureId;
            return (
              <button
                key={creatureId}
                type="button"
                className={`cmd-bar__action-btn ${isActive ? "cmd-bar__action-btn--active" : ""}`}
                onClick={() => onToggleBuildMode(creatureId)}
                disabled={disabled}
                title={t("actions.build", { building: t(presentation.buildingNameKey) })}
              >
                <img
                  src={presentation.buildingTextureUrl}
                  alt={t(presentation.buildingNameKey)}
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
