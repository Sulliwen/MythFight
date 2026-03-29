import { useState } from "react";
import type { PlayerId, SnapshotMsg } from "../types";
import { useDraggablePanel } from "../hooks/useDraggablePanel";

type HudProps = {
  mode?: "full" | "core-stats";
  status: string;
  playerId: string;
  controlledPlayer: PlayerId;
  onControlledPlayerChange: (player: PlayerId) => void;
  serverTick: number;
  fps: number;
  rttMs: number;
  simulatedLagMs: number;
  onSimulatedLagChange: (value: number) => void;
  showSnapshotDebug: boolean;
  onToggleSnapshotDebug: () => void;
  showHitboxDebug: boolean;
  onToggleHitboxDebug: () => void;
  showImageOutlineDebug: boolean;
  onToggleImageOutlineDebug: () => void;
  showBuildZoneDebug: boolean;
  onToggleBuildZoneDebug: () => void;
  showGameAreaDebug: boolean;
  onToggleGameAreaDebug: () => void;
  showCollisionDebug: boolean;
  onToggleCollisionDebug: () => void;
  showGridDebug: boolean;
  onToggleGridDebug: () => void;
  showAttackRangeDebug: boolean;
  onToggleAttackRangeDebug: () => void;
  showVisionDebug: boolean;
  onToggleVisionDebug: () => void;
  onToggleAllOverlays: (on: boolean) => void;
  onUpdateCreatureStats: (creatureId: string, stats: Record<string, number>) => void;
  snapshots: SnapshotMsg[];
  castleHp: {
    player1: number;
    player2: number;
  };
  unitsCount: number;
  lastMessage: string;
};

type StatDef = { key: string; label: string; min: number; max: number; step: number };

const GOLEM_STAT_DEFS: StatDef[] = [
  { key: "hp", label: "PV", min: 1, max: 1000, step: 1 },
  { key: "moveSpeedPerTick", label: "Vitesse", min: 1, max: 30, step: 1 },
  { key: "attackDamage", label: "Degats", min: 1, max: 200, step: 1 },
  { key: "attackRange", label: "Portee atk", min: 5, max: 200, step: 5 },
  { key: "attackIntervalTicks", label: "Vit. attaque", min: 2, max: 100, step: 1 },
  { key: "hitboxRadius", label: "Hitbox R", min: 4, max: 50, step: 1 },
  { key: "visionRange", label: "Vision", min: 10, max: 500, step: 10 },
];

function CreatureStatsEditor({ initialStats, onUpdate }: { initialStats: Record<string, number>; onUpdate: (creatureId: string, stats: Record<string, number>) => void }) {
  const [values, setValues] = useState<Record<string, number>>(initialStats);

  const handleChange = (key: string, val: number) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    onUpdate("golem", { [key]: val });
  };

  return (
    <>
      {GOLEM_STAT_DEFS.map((def) => (
        <div key={def.key} className="hud-row hud-row--stat-editor">
          <span className="hud-stat-label">{def.label}</span>
          <input
            type="range"
            className="hud-stat-range"
            min={def.min}
            max={def.max}
            step={def.step}
            value={values[def.key]}
            onChange={(e) => handleChange(def.key, Number(e.target.value))}
          />
          <input
            type="number"
            className="hud-stat-number"
            min={def.min}
            max={def.max}
            step={def.step}
            value={values[def.key]}
            onChange={(e) => handleChange(def.key, Number(e.target.value))}
          />
        </div>
      ))}
    </>
  );
}

function LagSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="hud-lag" htmlFor="simulated-lag">
      Lag
      <select id="simulated-lag" value={value} onChange={(event) => onChange(Number(event.target.value))}>
        <option value={0}>0 ms</option>
        <option value={50}>50 ms</option>
        <option value={100}>100 ms</option>
        <option value={150}>150 ms</option>
        <option value={200}>200 ms</option>
        <option value={500}>500 ms</option>
        <option value={1000}>1000 ms</option>
        <option value={2000}>2000 ms</option>
        <option value={4000}>4000 ms</option>
      </select>
    </label>
  );
}

export function Hud(props: HudProps) {
  const {
    mode = "full",
    status,
    playerId,
    controlledPlayer,
    onControlledPlayerChange,
    serverTick,
    fps,
    rttMs,
    simulatedLagMs,
    onSimulatedLagChange,
    showSnapshotDebug,
    onToggleSnapshotDebug,
    showHitboxDebug,
    onToggleHitboxDebug,
    showImageOutlineDebug,
    onToggleImageOutlineDebug,
    showBuildZoneDebug,
    onToggleBuildZoneDebug,
    showGameAreaDebug,
    onToggleGameAreaDebug,
    showCollisionDebug,
    onToggleCollisionDebug,
    showGridDebug,
    onToggleGridDebug,
    showAttackRangeDebug,
    onToggleAttackRangeDebug,
    showVisionDebug,
    onToggleVisionDebug,
    onToggleAllOverlays,
    onUpdateCreatureStats,
    snapshots,
    castleHp,
    unitsCount,
    lastMessage,
  } = props;
  const { panelRef, offset: dragOffset, onDragStart, onDragMove, onDragEnd } = useDraggablePanel({
    enabled: mode === "full",
  });

  if (mode === "core-stats") {
    return (
      <aside className="hud-card hud-card--core" aria-label="Core stats">
        <div className="hud-row">
          <span>Player</span>
          <strong>{playerId}</strong>
        </div>
        <div className="hud-row">
          <span>FPS</span>
          <strong>{fps}</strong>
        </div>
        <div className="hud-row">
          <span>RTT</span>
          <strong>{rttMs} ms</strong>
        </div>
        <div className="hud-row">
          <span>HP P1</span>
          <strong>{castleHp.player1}</strong>
        </div>
        <div className="hud-row">
          <span>HP P2</span>
          <strong>{castleHp.player2}</strong>
        </div>
      </aside>
    );
  }

  const isConnected = status === "connected";

  return (
    <aside
      ref={panelRef}
      className="hud-card hud-card--debug"
      aria-label="Debug HUD"
      style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
    >
      <div
        className="hud-row hud-row--header hud-drag-handle"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <span>Debug</span>
        <span className={isConnected ? "hud-badge hud-badge--ok" : "hud-badge hud-badge--warn"}>{status}</span>
      </div>

      <div className="hud-grid">
        <div className="hud-metric">
          <span>Player</span>
          <select
            className="hud-player-select"
            value={controlledPlayer}
            onChange={(event) =>
              onControlledPlayerChange(event.target.value === "player2" ? "player2" : "player1")
            }
          >
            <option value="player1">player1</option>
            <option value="player2">player2</option>
          </select>
        </div>
      </div>

      <details className="hud-submenu">
        <summary>Network</summary>
        <div className="hud-row">
          <span>Tick</span>
          <strong>{serverTick}</strong>
        </div>
        <div className="hud-row">
          <span>FPS</span>
          <strong>{fps}</strong>
        </div>
        <div className="hud-row">
          <span>RTT</span>
          <strong>{rttMs} ms</strong>
        </div>
        <LagSelect value={simulatedLagMs} onChange={onSimulatedLagChange} />
        <div className="hud-row">
          <span>Snapshot logs</span>
          <button
            type="button"
            className={`hud-inline-toggle ${showSnapshotDebug ? "hud-inline-toggle--on" : "hud-inline-toggle--off"}`}
            onClick={onToggleSnapshotDebug}
          >
            {showSnapshotDebug ? "on" : "off"}
          </button>
        </div>
        <div className="hud-last-message">{lastMessage}</div>
      </details>

      <details className="hud-submenu" open>
        <summary>Game state</summary>
        <div className="hud-row">
          <span>Units</span>
          <strong>{unitsCount}</strong>
        </div>
        <div className="hud-row">
          <span>Castle P1</span>
          <strong>{castleHp.player1}</strong>
        </div>
        <div className="hud-row">
          <span>Castle P2</span>
          <strong>{castleHp.player2}</strong>
        </div>
      </details>

      <details className="hud-submenu">
        <summary>Overlays</summary>
        <div className="hud-row">
          <span>Tout</span>
          {(() => {
            const allOn = showHitboxDebug && showImageOutlineDebug && showBuildZoneDebug && showGameAreaDebug && showCollisionDebug && showGridDebug && showAttackRangeDebug && showVisionDebug;
            const allOff = !showHitboxDebug && !showImageOutlineDebug && !showBuildZoneDebug && !showGameAreaDebug && !showCollisionDebug && !showGridDebug && !showAttackRangeDebug && !showVisionDebug;
            return (
              <>
                <button
                  type="button"
                  className={`hud-inline-toggle ${allOn ? "hud-inline-toggle--on" : "hud-inline-toggle--off"}`}
                  onClick={() => onToggleAllOverlays(true)}
                >
                  on
                </button>
                <button
                  type="button"
                  className={`hud-inline-toggle ${allOff ? "hud-inline-toggle--on" : "hud-inline-toggle--off"}`}
                  onClick={() => onToggleAllOverlays(false)}
                >
                  off
                </button>
              </>
            );
          })()}
        </div>
        <div className="hud-row">
          <span>Afficher hitbox</span>
          <button
            type="button"
            className={`hud-inline-toggle ${showHitboxDebug ? "hud-inline-toggle--on" : "hud-inline-toggle--off"}`}
            onClick={onToggleHitboxDebug}
          >
            {showHitboxDebug ? "on" : "off"}
          </button>
        </div>
        <div className="hud-row">
          <span>Contour images</span>
          <button
            type="button"
            className={`hud-inline-toggle ${showImageOutlineDebug ? "hud-inline-toggle--on" : "hud-inline-toggle--off"}`}
            onClick={onToggleImageOutlineDebug}
          >
            {showImageOutlineDebug ? "on" : "off"}
          </button>
        </div>
        <div className="hud-row">
          <span>Zone constructible</span>
          <button
            type="button"
            className={`hud-inline-toggle ${showBuildZoneDebug ? "hud-inline-toggle--on" : "hud-inline-toggle--off"}`}
            onClick={onToggleBuildZoneDebug}
          >
            {showBuildZoneDebug ? "on" : "off"}
          </button>
        </div>
        <div className="hud-row">
          <span>Zone de jeu</span>
          <button
            type="button"
            className={`hud-inline-toggle ${showGameAreaDebug ? "hud-inline-toggle--on" : "hud-inline-toggle--off"}`}
            onClick={onToggleGameAreaDebug}
          >
            {showGameAreaDebug ? "on" : "off"}
          </button>
        </div>
        <div className="hud-row">
          <span>Collision (serveur)</span>
          <button
            type="button"
            className={`hud-inline-toggle ${showCollisionDebug ? "hud-inline-toggle--on" : "hud-inline-toggle--off"}`}
            onClick={onToggleCollisionDebug}
          >
            {showCollisionDebug ? "on" : "off"}
          </button>
        </div>
        <div className="hud-row">
          <span>Portee d'attaque</span>
          <button
            type="button"
            className={`hud-inline-toggle ${showAttackRangeDebug ? "hud-inline-toggle--on" : "hud-inline-toggle--off"}`}
            onClick={onToggleAttackRangeDebug}
          >
            {showAttackRangeDebug ? "on" : "off"}
          </button>
        </div>
        <div className="hud-row">
          <span>Champ de vision</span>
          <button
            type="button"
            className={`hud-inline-toggle ${showVisionDebug ? "hud-inline-toggle--on" : "hud-inline-toggle--off"}`}
            onClick={onToggleVisionDebug}
          >
            {showVisionDebug ? "on" : "off"}
          </button>
        </div>
        <div className="hud-row">
          <span>Grille pathfinding</span>
          <button
            type="button"
            className={`hud-inline-toggle ${showGridDebug ? "hud-inline-toggle--on" : "hud-inline-toggle--off"}`}
            onClick={onToggleGridDebug}
          >
            {showGridDebug ? "on" : "off"}
          </button>
        </div>
      </details>

      <details className="hud-submenu">
        <summary>Golem Stats</summary>
        {(() => {
          const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
          const serverGolem = latest?.creatureStats?.golem;
          if (!serverGolem) return <span className="hud-last-message">En attente du serveur...</span>;
          const initial = serverGolem as unknown as Record<string, number>;
          return <CreatureStatsEditor key="golem" initialStats={initial} onUpdate={onUpdateCreatureStats} />;
        })()}
      </details>
    </aside>
  );
}
