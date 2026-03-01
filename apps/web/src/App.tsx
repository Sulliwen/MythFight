import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import "./App.css";
import { Hud } from "./components/Hud";
import { LaneCanvas } from "./components/LaneCanvas";
import { SpawnButton } from "./components/SpawnButton";
import { useGameSocket } from "./hooks/useGameSocket";
import { usePwaInstall } from "./hooks/usePwaInstall";
import { usePwaRuntime } from "./hooks/usePwaRuntime";
import type { LaneEditorSelection, PlayerId } from "./types";

function formatEditorValue(value: number): string {
  if (!Number.isFinite(value)) return "NaN";
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(3);
}

function App() {
  const qsPlayer = new URLSearchParams(window.location.search).get("player");
  const initialPlayer: PlayerId = qsPlayer === "player2" ? "player2" : "player1";
  const [controlledPlayer, setControlledPlayer] = useState<PlayerId>(initialPlayer);
  const [debugPanelVisible, setDebugPanelVisible] = useState(true);
  const [isOnline, setIsOnline] = useState(() => window.navigator.onLine);
  const [editorMode, setEditorMode] = useState(false);
  const [editorSelection, setEditorSelection] = useState<LaneEditorSelection | null>(null);
  const [editorPanelOffset, setEditorPanelOffset] = useState({ x: 0, y: 0 });
  const editorPanelRef = useRef<HTMLElement | null>(null);
  const editorPanelDragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    baseLeft: number;
    baseTop: number;
    width: number;
    height: number;
  } | null>(null);

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

  useEffect(() => {
    if (!editorMode) return;

    const clampEditorPanelToViewport = () => {
      const panel = editorPanelRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      const margin = 8;
      let adjustX = 0;
      let adjustY = 0;

      if (rect.left < margin) {
        adjustX = margin - rect.left;
      } else if (rect.right > window.innerWidth - margin) {
        adjustX = window.innerWidth - margin - rect.right;
      }

      if (rect.top < margin) {
        adjustY = margin - rect.top;
      } else if (rect.bottom > window.innerHeight - margin) {
        adjustY = window.innerHeight - margin - rect.bottom;
      }

      if (adjustX !== 0 || adjustY !== 0) {
        setEditorPanelOffset((prev) => ({
          x: prev.x + adjustX,
          y: prev.y + adjustY,
        }));
      }
    };

    clampEditorPanelToViewport();
    window.addEventListener("resize", clampEditorPanelToViewport);
    window.addEventListener("orientationchange", clampEditorPanelToViewport);

    return () => {
      window.removeEventListener("resize", clampEditorPanelToViewport);
      window.removeEventListener("orientationchange", clampEditorPanelToViewport);
    };
  }, [editorMode]);

  function onEditorPanelDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const panel = editorPanelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    editorPanelDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: editorPanelOffset.x,
      originY: editorPanelOffset.y,
      baseLeft: rect.left - editorPanelOffset.x,
      baseTop: rect.top - editorPanelOffset.y,
      width: rect.width,
      height: rect.height,
    };
  }

  function onEditorPanelDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = editorPanelDragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    const nextX = state.originX + dx;
    const nextY = state.originY + dy;
    const margin = 8;

    const minX = margin - state.baseLeft;
    const maxX = window.innerWidth - margin - state.baseLeft - state.width;
    const minY = margin - state.baseTop;
    const maxY = window.innerHeight - margin - state.baseTop - state.height;

    setEditorPanelOffset({
      x: Math.max(minX, Math.min(maxX, nextX)),
      y: Math.max(minY, Math.min(maxY, nextY)),
    });
  }

  function onEditorPanelDragEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const state = editorPanelDragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    editorPanelDragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const showServerUnavailable = status === "closed" || status === "error";

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <div className="app-title">MythFight POC</div>

        <div className="action-dock">
          <SpawnButton className="action-btn" onSpawn={sendSpawn} disabled={status !== "connected"} />
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
          <SpawnButton
            className={`action-btn ${editorMode ? "action-btn--editor-on" : "action-btn--editor-off"}`}
            onSpawn={() =>
              setEditorMode((prev) => {
                const next = !prev;
                if (!next) {
                  setEditorSelection(null);
                }
                return next;
              })
            }
            label={`Edition: ${editorMode ? "on" : "off"}`}
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
          castleHp={castleHp}
          unitsCount={unitsCount}
          lastMessage={lastMessage}
        />
      )}

      <section className="game-stage" aria-label="Game viewport">
        <LaneCanvas
          snapshots={snapshots}
          editorMode={editorMode}
          onEditorSelectionChange={setEditorSelection}
        />
      </section>

      {editorMode && (
        <aside
          ref={editorPanelRef}
          className="editor-panel"
          aria-label="Editor panel"
          style={{ transform: `translate(${editorPanelOffset.x}px, ${editorPanelOffset.y}px)` }}
        >
          <div
            className="editor-panel__header editor-panel__drag-handle"
            onPointerDown={onEditorPanelDragStart}
            onPointerMove={onEditorPanelDragMove}
            onPointerUp={onEditorPanelDragEnd}
            onPointerCancel={onEditorPanelDragEnd}
          >
            <strong>Mode edition</strong>
            <span>Drag = deplacer, carre = taille, rond = rotation, Alt+drag = camera, Alt+molette = haut/bas</span>
          </div>

          {!editorSelection && (
            <div className="editor-panel__empty">
              Selectionne un element du plateau (lane, chateau P1, chateau P2).
            </div>
          )}

          {editorSelection && (
            <>
              <div className="editor-panel__grid">
                <span>ID</span>
                <code>{editorSelection.id}</code>
                <span>Type</span>
                <code>{editorSelection.elementType}</code>
                <span>Label</span>
                <code>{editorSelection.label}</code>
              </div>

              <div className="editor-panel__section">
                <h3>References</h3>
                <div className="editor-panel__grid">
                  <span>HTML</span>
                  <code>{editorSelection.htmlTarget}</code>
                  <span>CSS</span>
                  <code>{editorSelection.cssTarget}</code>
                  <span>TS</span>
                  <code>{editorSelection.tsTarget}</code>
                </div>
              </div>

              <div className="editor-panel__section">
                <h3>Position</h3>
                <div className="editor-panel__grid">
                  {Object.entries(editorSelection.position).map(([key, value]) => (
                    <span key={key} className="editor-panel__pair">
                      {key}
                      <code>{formatEditorValue(value)}</code>
                    </span>
                  ))}
                </div>
              </div>

              <div className="editor-panel__section">
                <h3>Taille</h3>
                <div className="editor-panel__grid">
                  {Object.entries(editorSelection.size).map(([key, value]) => (
                    <span key={key} className="editor-panel__pair">
                      {key}
                      <code>{formatEditorValue(value)}</code>
                    </span>
                  ))}
                </div>
              </div>

              <div className="editor-panel__section">
                <h3>Snippet TS</h3>
                <pre className="editor-panel__snippet">{editorSelection.suggestedTs}</pre>
              </div>

              <div className="editor-panel__hint">{editorSelection.interactionHint}</div>
            </>
          )}
        </aside>
      )}
    </main>
  );
}

export default App;
