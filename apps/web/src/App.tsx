import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { CommandBar } from "./components/CommandBar";
import { Hud } from "./components/Hud";
import { LaneCanvas } from "./components/LaneCanvas";
import type { BuildMode } from "./components/lane-canvas/types";
import { MenuOverlay } from "./components/menu/MenuOverlay";
import { SpawnButton } from "./components/SpawnButton";
import { VictoryOverlay } from "./components/victory/VictoryOverlay";
import { DEFAULT_CREATURE_ID } from "./creature-config";
import { useTranslation } from "./i18n";
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
  const { t } = useTranslation();
  const qsPlayer = new URLSearchParams(window.location.search).get("player");
  const initialPlayer: PlayerId = qsPlayer === "player2" ? "player2" : "player1";
  const [controlledPlayer, setControlledPlayer] = useState<PlayerId>(initialPlayer);
  const isDev = import.meta.env.DEV;
  const [debugPanelVisible, setDebugPanelVisible] = useState(false);
  const [showImageOutlineDebug, setShowImageOutlineDebug] = useState(isDev);
  const [showBuildZoneDebug, setShowBuildZoneDebug] = useState(isDev);
  const [showGameAreaDebug, setShowGameAreaDebug] = useState(isDev);
  const [showCollisionDebug, setShowCollisionDebug] = useState(isDev);
  const [showGridDebug, setShowGridDebug] = useState(isDev);
  const [showAttackRangeDebug, setShowAttackRangeDebug] = useState(isDev);
  const [showVisionDebug, setShowVisionDebug] = useState(isDev);
  const [showPathwayDebug, setShowPathwayDebug] = useState(isDev);
  const [cmdBarVisible, setCmdBarVisible] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [dismissedRoundId, setDismissedRoundId] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(() => window.navigator.onLine);
  const [buildMode, setBuildMode] = useState<BuildMode>({ active: false, creatureId: DEFAULT_CREATURE_ID });
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
    sendToggleProduction,
    sendForceSpawn,
    sendToggleFlight,
    sendUpdateCreatureStats,
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

  const toggleBuildMode = (creatureId: CreatureId) => {
    setBuildMode((prev) => ({
      active: prev.creatureId !== creatureId || !prev.active,
      creatureId,
    }));
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
    matchOutcome === "draw"
      ? t("match.draw")
      : t("match.victory", { winner: matchOutcome === "player1" ? "Player 1" : "Player 2" });
  const victorySubtitle =
    matchOutcome === "draw"
      ? t("match.drawSubtitle")
      : matchOutcome === controlledPlayer
        ? t("match.winSubtitle")
        : t("match.loseSubtitle");

  return (
    <main className="app-shell">
      <section className="game-stage" aria-label="Game viewport">
        <LaneCanvas
          snapshots={snapshots}

          showImageOutlineDebug={showImageOutlineDebug}
          showBuildZoneDebug={showBuildZoneDebug}
          showGameAreaDebug={showGameAreaDebug}
          showCollisionDebug={showCollisionDebug}
          showGridDebug={showGridDebug}
          showAttackRangeDebug={showAttackRangeDebug}
          showVisionDebug={showVisionDebug}
          showPathwayDebug={showPathwayDebug}
          buildMode={buildMode}
          onPlaceBuilding={handlePlaceBuilding}
          onSelect={setSelection}
          controlledPlayer={controlledPlayer}
        />
      </section>

      <div className="hud-overlay">
        <header className="app-topbar">
          <div className="app-title">{t("app.title")}</div>

          <div className="action-dock">
            <SpawnButton className="action-btn" onSpawn={sendSpawn} disabled={status !== "connected"} />
            <SpawnButton
              className="action-btn action-btn--player"
              onSpawn={() => setControlledPlayer(nextControlledPlayer)}
              label={t("actions.player", { player: controlledPlayer })}
            />
            <SpawnButton
              className="action-btn action-btn--alt"
              onSpawn={handleNewGame}
              disabled={status !== "connected"}
              label={t("actions.newGame")}
            />
            {installPromptAvailable && (
              <SpawnButton
                className="action-btn action-btn--install"
                onSpawn={() => {
                  void promptInstall();
                }}
                label={t("actions.install")}
              />
            )}
            <SpawnButton
              className={`action-btn ${debugPanelVisible ? "action-btn--debug-on" : "action-btn--debug-off"}`}
              onSpawn={() => setDebugPanelVisible((prev) => !prev)}
              label={t("actions.debug", { state: debugPanelVisible ? t("ui.on") : t("ui.off") })}
            />
          </div>
        </header>

        <div className="status-stack" aria-live="polite">
          {needRefresh && (
            <div className="status-banner status-banner--update">
              <span>{t("status.updateAvailable")}</span>
              <button
                type="button"
                className="status-banner__action"
                onClick={() => {
                  void refreshApplication();
                }}
              >
                {t("actions.refresh")}
              </button>
            </div>
          )}

          {!needRefresh && offlineReady && (
            <div className="status-banner status-banner--info">{t("status.offlineReady")}</div>
          )}

          {!isOnline && (
            <div className="status-banner status-banner--warn">
              {t("status.offline")}
            </div>
          )}

          {isOnline && showServerUnavailable && (
            <div className="status-banner status-banner--warn">
              {t("status.serverUnavailable")}
            </div>
          )}

          {showIosInstallHint && (
            <div className="status-banner status-banner--info">
              {t("status.iosInstallHint")}
            </div>
          )}
        </div>

        <div className="hud-overlay__spacer" />

        <div className="cmd-bar-wrapper">
          <button
            type="button"
            className="cmd-bar-toggle"
            onClick={() => setCmdBarVisible((prev) => !prev)}
          >
            {cmdBarVisible ? "\u25BC" : "\u25B2"}
          </button>
          {cmdBarVisible && (
            <CommandBar
              buildMode={buildMode}
              onToggleBuildMode={toggleBuildMode}
              disabled={status !== "connected"}
              selection={selection}
              snapshots={snapshots}
              controlledPlayer={controlledPlayer}
              onToggleProduction={sendToggleProduction}
              onForceSpawn={sendForceSpawn}
              onToggleFlight={sendToggleFlight}
            />
          )}
        </div>

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
            showImageOutlineDebug={showImageOutlineDebug}
            onToggleImageOutlineDebug={() => setShowImageOutlineDebug((prev) => !prev)}
            showBuildZoneDebug={showBuildZoneDebug}
            onToggleBuildZoneDebug={() => setShowBuildZoneDebug((prev) => !prev)}
            showGameAreaDebug={showGameAreaDebug}
            onToggleGameAreaDebug={() => setShowGameAreaDebug((prev) => !prev)}
            showCollisionDebug={showCollisionDebug}
            onToggleCollisionDebug={() => setShowCollisionDebug((prev) => !prev)}
            showGridDebug={showGridDebug}
            onToggleGridDebug={() => setShowGridDebug((prev) => !prev)}
            showAttackRangeDebug={showAttackRangeDebug}
            onToggleAttackRangeDebug={() => setShowAttackRangeDebug((prev) => !prev)}
            showVisionDebug={showVisionDebug}
            onToggleVisionDebug={() => setShowVisionDebug((prev) => !prev)}
            showPathwayDebug={showPathwayDebug}
            onTogglePathwayDebug={() => setShowPathwayDebug((prev) => !prev)}
            onToggleAllOverlays={(on: boolean) => {
              setShowImageOutlineDebug(on);
              setShowBuildZoneDebug(on);
              setShowGameAreaDebug(on);
              setShowCollisionDebug(on);
              setShowGridDebug(on);
              setShowAttackRangeDebug(on);
              setShowVisionDebug(on);
              setShowPathwayDebug(on);
            }}
            onUpdateCreatureStats={sendUpdateCreatureStats}
            snapshots={snapshots}
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
