import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { PlayerId } from "../types";

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
  castleHp: {
    player1: number;
    player2: number;
  };
  unitsCount: number;
  lastMessage: string;
};

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
    castleHp,
    unitsCount,
    lastMessage,
  } = props;
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

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

  function onDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
    };
  }

  function onDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    setDragOffset({
      x: state.originX + dx,
      y: state.originY + dy,
    });
  }

  function onDragEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <aside
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
    </aside>
  );
}
