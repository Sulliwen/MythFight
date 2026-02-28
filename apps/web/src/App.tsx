import { Hud } from "./components/Hud";
import { LaneCanvas } from "./components/LaneCanvas";
import { SpawnButton } from "./components/SpawnButton";
import { useGameSocket } from "./hooks/useGameSocket";

function App() {
  const {
    status,
    playerId,
    serverTick,
    fps,
    rttMs,
    simulatedLagMs,
    setSimulatedLagMs,
    castleHp,
    unitsCount,
    lastMessage,
    snapshots,
    sendSpawn,
  } = useGameSocket();

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>MythFight POC</h1>

      <Hud
        status={status}
        playerId={playerId}
        serverTick={serverTick}
        fps={fps}
        rttMs={rttMs}
        simulatedLagMs={simulatedLagMs}
        onSimulatedLagChange={setSimulatedLagMs}
        castleHp={castleHp}
        unitsCount={unitsCount}
        lastMessage={lastMessage}
      />

      <SpawnButton onSpawn={sendSpawn} disabled={status !== "connected"} />
      <LaneCanvas snapshots={snapshots} />
    </main>
  );
}

export default App;
