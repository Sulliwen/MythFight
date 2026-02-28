import { Hud } from "./components/Hud";
import { SpawnButton } from "./components/SpawnButton";
import { useGameSocket } from "./hooks/useGameSocket";

function App() {
  const { status, playerId, serverTick, castleHp, unitsCount, lastMessage, sendSpawn } =
    useGameSocket();

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>MythFight POC</h1>

      <Hud
        status={status}
        playerId={playerId}
        serverTick={serverTick}
        castleHp={castleHp}
        unitsCount={unitsCount}
        lastMessage={lastMessage}
      />

      <SpawnButton onSpawn={sendSpawn} disabled={status !== "connected"} />
    </main>
  );
}

export default App;