import { useState } from "react";
import "./App.css";
import { Hud } from "./components/Hud";
import { LaneCanvas } from "./components/LaneCanvas";
import { SpawnButton } from "./components/SpawnButton";
import { useGameSocket } from "./hooks/useGameSocket";
import type { PlayerId } from "./types";

function parseBooleanLike(value: string | null): boolean | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "off") return false;
  return null;
}

function resolveDebugHudEnabled(): boolean {
  const envValue = parseBooleanLike(import.meta.env.VITE_SHOW_DEBUG_HUD ?? null);
  return envValue ?? import.meta.env.DEV;
}

function resolveCoreStatsEnabled(): boolean {
  const envValue = parseBooleanLike(import.meta.env.VITE_SHOW_CORE_STATS ?? null);
  return envValue ?? import.meta.env.DEV;
}

function App() {
  const qsPlayer = new URLSearchParams(window.location.search).get("player");
  const initialPlayer: PlayerId = qsPlayer === "player2" ? "player2" : "player1";
  const showDebugHud = resolveDebugHudEnabled();
  const showCoreStats = resolveCoreStatsEnabled();
  const [controlledPlayer, setControlledPlayer] = useState<PlayerId>(initialPlayer);
  const [debugPanelVisible, setDebugPanelVisible] = useState(true);

  const {
    status,
    playerId,
    serverTick,
    fps,
    rttMs,
    simulatedLagMs,
    setSimulatedLagMs,
    showSnapshotDebug,
    toggleSnapshotDebug,
    castleHp,
    unitsCount,
    lastMessage,
    snapshots,
    sendSpawn,
    sendNewGame,
  } = useGameSocket(controlledPlayer);

  return (
    <main className="app-shell">
      <div className="app-title">MythFight POC</div>

      <div className="action-dock">
        <SpawnButton className="action-btn" onSpawn={sendSpawn} disabled={status !== "connected"} />
        <SpawnButton
          className="action-btn action-btn--alt"
          onSpawn={sendNewGame}
          disabled={status !== "connected"}
          label="New game"
        />
        {showDebugHud && (
          <SpawnButton
            className={`action-btn ${debugPanelVisible ? "action-btn--debug-on" : "action-btn--debug-off"}`}
            onSpawn={() => setDebugPanelVisible((prev) => !prev)}
            label={`Debug: ${debugPanelVisible ? "on" : "off"}`}
          />
        )}
      </div>

      {showDebugHud && debugPanelVisible && (
        <Hud
          mode="full"
          status={status}
          playerId={playerId}
          controlledPlayer={controlledPlayer}
          onControlledPlayerChange={setControlledPlayer}
          serverTick={serverTick}
          fps={fps}
          rttMs={rttMs}
          simulatedLagMs={simulatedLagMs}
          onSimulatedLagChange={setSimulatedLagMs}
          showSnapshotDebug={showSnapshotDebug}
          onToggleSnapshotDebug={toggleSnapshotDebug}
          castleHp={castleHp}
          unitsCount={unitsCount}
          lastMessage={lastMessage}
        />
      )}

      {!showDebugHud && showCoreStats && (
        <Hud
          mode="core-stats"
          status={status}
          playerId={playerId}
          controlledPlayer={controlledPlayer}
          onControlledPlayerChange={setControlledPlayer}
          serverTick={serverTick}
          fps={fps}
          rttMs={rttMs}
          simulatedLagMs={simulatedLagMs}
          onSimulatedLagChange={setSimulatedLagMs}
          showSnapshotDebug={showSnapshotDebug}
          onToggleSnapshotDebug={toggleSnapshotDebug}
          castleHp={castleHp}
          unitsCount={unitsCount}
          lastMessage={lastMessage}
        />
      )}

      <section className="game-stage" aria-label="Game viewport">
        <LaneCanvas snapshots={snapshots} />
      </section>
    </main>
  );
}

export default App;
