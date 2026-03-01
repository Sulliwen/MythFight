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
  const selectedPlayer: PlayerId = qsPlayer === "player2" ? "player2" : "player1";
  const showDebugHud = resolveDebugHudEnabled();
  const showCoreStats = resolveCoreStatsEnabled();

  const {
    status,
    playerId,
    serverTick,
    fps,
    rttMs,
    simulatedLagMs,
    setSimulatedLagMs,
    showSnapshotDebug,
    castleHp,
    unitsCount,
    lastMessage,
    snapshots,
    sendSpawn,
  } = useGameSocket(selectedPlayer);

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>MythFight POC</h1>

      {showDebugHud && (
        <Hud
          mode="full"
          status={status}
          playerId={playerId}
          serverTick={serverTick}
          fps={fps}
          rttMs={rttMs}
          simulatedLagMs={simulatedLagMs}
          onSimulatedLagChange={setSimulatedLagMs}
          showSnapshotDebug={showSnapshotDebug}
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
          serverTick={serverTick}
          fps={fps}
          rttMs={rttMs}
          simulatedLagMs={simulatedLagMs}
          onSimulatedLagChange={setSimulatedLagMs}
          showSnapshotDebug={showSnapshotDebug}
          castleHp={castleHp}
          unitsCount={unitsCount}
          lastMessage={lastMessage}
        />
      )}

      <SpawnButton onSpawn={sendSpawn} disabled={status !== "connected"} />
      <LaneCanvas snapshots={snapshots} />
    </main>
  );
}

export default App;
