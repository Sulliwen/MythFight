import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { CommandBar } from "./components/CommandBar";
import { Hud } from "./components/Hud";
import { LaneCanvas } from "./components/LaneCanvas";
import type { BuildMode } from "./components/lane-canvas/types";
import { MenuOverlay } from "./components/menu/MenuOverlay";
import { SpawnButton } from "./components/SpawnButton";
import { VictoryOverlay } from "./components/victory/VictoryOverlay";
import { useGameSocket } from "./hooks/useGameSocket";
import { usePwaInstall } from "./hooks/usePwaInstall";
import { usePwaRuntime } from "./hooks/usePwaRuntime";
import type { CreatureId, PlayerId, SelectionTarget } from "./types";

type MatchOutcome = PlayerId | "draw" | null;

function getMatchOutcome(castleHp: { player1: number; player2: number }): MatchOutcome {
  if (castleHp.player1 <= 0 && castleHp.player2 <= 0) return "draw";
  if (castleHp.player1 <= 0) return "player2";
  if (castleHp.player2 <= 0) return "player1";
  return null;
}

function App() {
  const qsPlayer = new URLSearchParams(window.location.search).get("player");
  const initialPlayer: PlayerId = qsPlayer === "player2" ? "player2" : "player1";
  const [controlledPlayer, setControlledPlayer] = useState<PlayerId>(initialPlayer);
  const [debugPanelVisible, setDebugPanelVisible] = useState(false);
  const [showHitboxDebug, setShowHitboxDebug] = useState(true);
  const [showImageOutlineDebug, setShowImageOutlineDebug] = useState(true);
  const [showBuildZoneDebug, setShowBuildZoneDebug] = useState(true);
  const [showGameAreaDebug, setShowGameAreaDebug] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [dismissedRoundId, setDismissedRoundId] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(() => window.navigator.onLine);
  const [buildMode, setBuildMode] = useState<BuildMode>({ active: false, creatureId: "golem" });
  const [selection, setSelection] = useState<SelectionTarget>(null);

  const { installPromptAvailable, promptInstall, showIosInstallHint } = usePwaInstall();
  const { needRefresh, offlineReady, refreshApplication } = usePwaRuntime();

  const {
    status,
    playerId,
    roundId,
    serverTick,
    fps,
    rttMs,
    simulatedLagMs,
    setSimulatedLagMs,
    showSnapshotDebug,
    toggleSnapshotDebug,
    displayCastleHp,
    unitsCount,
    lastMessage,
    snapshots,
    sendSpawn,
    sendNewGame,
    sendPlaceBuilding,
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setBuildMode((prev) => (prev.active ? { ...prev, active: false } : prev));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handlePlaceBuilding = useCallback(
    (worldX: number, worldY: number, creatureId: CreatureId) => {
      sendPlaceBuilding(worldX, worldY, creatureId);
      setBuildMode((prev) => ({ ...prev, active: false }));
    },
    [sendPlaceBuilding],
  );

  const toggleBuildMode = () => {
    setBuildMode((prev) => ({ ...prev, active: !prev.active }));
  };

  const showServerUnavailable = status === "closed" || status === "error";
  const nextControlledPlayer: PlayerId = controlledPlayer === "player1" ? "player2" : "player1";
  const matchOutcome = getMatchOutcome(displayCastleHp);
  const showVictoryOverlay = matchOutcome !== null && dismissedRoundId !== roundId && !menuVisible;

  const handleNewGame = () => {
    sendNewGame();
    setDismissedRoundId(roundId);
    setMenuVisible(false);
    setSelection(null);
  };

  const handleOpenMenu = () => {
    setDismissedRoundId(roundId);
    setMenuVisible(true);
  };

  const handleSetControlledPlayer = (player: PlayerId) => {
    setControlledPlayer(player);
    setMenuVisible(false);
  };

  const victoryTitle =
    matchOutcome === "draw" ? "Match nul" : `Victoire de ${matchOutcome === "player1" ? "Player 1" : "Player 2"}`;
  const victorySubtitle =
    matchOutcome === "draw"
      ? "Les deux chateaux sont tombes."
      : matchOutcome === controlledPlayer
        ? "Tu remportes la manche."
        : "Tu perds la manche.";

  return (
    <main className="app-shell">
      <section className="game-stage" aria-label="Game viewport">
        <LaneCanvas
          snapshots={snapshots}
          showHitboxDebug={showHitboxDebug}
          showImageOutlineDebug={showImageOutlineDebug}
          showBuildZoneDebug={showBuildZoneDebug}
          showGameAreaDebug={showGameAreaDebug}
          buildMode={buildMode}
          onPlaceBuilding={handlePlaceBuilding}
          onSelect={setSelection}
          controlledPlayer={controlledPlayer}
        />
      </section>

      <div className="hud-overlay">
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
              onSpawn={handleNewGame}
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

        <div className="hud-overlay__spacer" />

        <CommandBar
          buildModeActive={buildMode.active}
          onToggleBuildMode={toggleBuildMode}
          disabled={status !== "connected"}
          selection={selection}
          snapshots={snapshots}
          controlledPlayer={controlledPlayer}
        />

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
            showBuildZoneDebug={showBuildZoneDebug}
            onToggleBuildZoneDebug={() => setShowBuildZoneDebug((prev) => !prev)}
            showGameAreaDebug={showGameAreaDebug}
            onToggleGameAreaDebug={() => setShowGameAreaDebug((prev) => !prev)}
            castleHp={displayCastleHp}
            unitsCount={unitsCount}
            lastMessage={lastMessage}
          />
        )}
      </div>

      {showVictoryOverlay && (
        <VictoryOverlay title={victoryTitle} subtitle={victorySubtitle} onNewGame={handleNewGame} onMenu={handleOpenMenu} />
      )}

      {menuVisible && (
        <MenuOverlay
          onChoosePlayer={handleSetControlledPlayer}
          onNewGame={handleNewGame}
          onClose={() => setMenuVisible(false)}
        />
      )}
    </main>
  );
}

export default App;
