import { useEffect, useState } from "react";
import "./App.css";
import { Hud } from "./components/Hud";
import { LaneCanvas } from "./components/LaneCanvas";
import { PlayerUi } from "./components/PlayerUi";
import { SpawnButton } from "./components/SpawnButton";
import { useGameSocket } from "./hooks/useGameSocket";
import { usePwaInstall } from "./hooks/usePwaInstall";
import { usePwaRuntime } from "./hooks/usePwaRuntime";
import type { PlayerId } from "./types";

function App() {
  const qsPlayer = new URLSearchParams(window.location.search).get("player");
  const initialPlayer: PlayerId = qsPlayer === "player2" ? "player2" : "player1";
  const [controlledPlayer, setControlledPlayer] = useState<PlayerId>(initialPlayer);
  const [debugPanelVisible, setDebugPanelVisible] = useState(false);
  const [showHitboxDebug, setShowHitboxDebug] = useState(true);
  const [showImageOutlineDebug, setShowImageOutlineDebug] = useState(true);
  const [isOnline, setIsOnline] = useState(() => window.navigator.onLine);

  const { installPromptAvailable, promptInstall, showIosInstallHint } = usePwaInstall();
  const { needRefresh, offlineReady, refreshApplication } = usePwaRuntime();

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

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const showServerUnavailable = status === "closed" || status === "error";
  const nextControlledPlayer: PlayerId = controlledPlayer === "player1" ? "player2" : "player1";
  const playerGold = { player1: 0, player2: 0 };

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <div className="app-title">MythFight POC</div>

        <div className="action-dock">
          <SpawnButton className="action-btn" onSpawn={sendSpawn} disabled={status !== "connected"} />
          <SpawnButton
            className="action-btn action-btn--player"
            onSpawn={() => setControlledPlayer(nextControlledPlayer)}
            label={`Joueur: ${controlledPlayer}`}
          />
          <SpawnButton
            className="action-btn action-btn--alt"
            onSpawn={sendNewGame}
            disabled={status !== "connected"}
            label="New game"
          />
          {installPromptAvailable && (
            <SpawnButton
              className="action-btn action-btn--install"
              onSpawn={() => {
                void promptInstall();
              }}
              label="Installer"
            />
          )}
          <SpawnButton
            className={`action-btn ${debugPanelVisible ? "action-btn--debug-on" : "action-btn--debug-off"}`}
            onSpawn={() => setDebugPanelVisible((prev) => !prev)}
            label={`Debug: ${debugPanelVisible ? "on" : "off"}`}
          />
        </div>
      </header>

      <div className="status-stack" aria-live="polite">
        {needRefresh && (
          <div className="status-banner status-banner--update">
            <span>Une mise a jour est disponible.</span>
            <button
              type="button"
              className="status-banner__action"
              onClick={() => {
                void refreshApplication();
              }}
            >
              Rafraichir
            </button>
          </div>
        )}

        {!needRefresh && offlineReady && (
          <div className="status-banner status-banner--info">Le mode offline minimal est pret.</div>
        )}

        {!isOnline && (
          <div className="status-banner status-banner--warn">
            Vous etes hors ligne. L'interface reste disponible, mais la partie temps reel est indisponible.
          </div>
        )}

        {isOnline && showServerUnavailable && (
          <div className="status-banner status-banner--warn">
            Le serveur de jeu est indisponible. Verifie la connexion WebSocket et relance quand le serveur revient.
          </div>
        )}

        {showIosInstallHint && (
          <div className="status-banner status-banner--info">
            Sur iOS: ouvre le menu Partager puis selectionne "Ajouter a l'ecran d'accueil".
          </div>
        )}
      </div>

      <PlayerUi castleHp={castleHp} gold={playerGold} controlledPlayer={controlledPlayer} />

      {debugPanelVisible && (
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
          showHitboxDebug={showHitboxDebug}
          onToggleHitboxDebug={() => setShowHitboxDebug((prev) => !prev)}
          showImageOutlineDebug={showImageOutlineDebug}
          onToggleImageOutlineDebug={() => setShowImageOutlineDebug((prev) => !prev)}
          castleHp={castleHp}
          unitsCount={unitsCount}
          lastMessage={lastMessage}
        />
      )}

      <section className="game-stage" aria-label="Game viewport">
        <LaneCanvas
          snapshots={snapshots}
          showHitboxDebug={showHitboxDebug}
          showImageOutlineDebug={showImageOutlineDebug}
        />
      </section>
    </main>
  );
}

export default App;
