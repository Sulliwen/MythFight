import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import "./App.css";
import { Hud } from "./components/Hud";
import { PrefabIsoEditor } from "./components/PrefabIsoEditor";
import { LaneCanvas, type LaneCanvasHandle } from "./components/LaneCanvas";
import { SpawnButton } from "./components/SpawnButton";
import { useGameSocket } from "./hooks/useGameSocket";
import { usePwaInstall } from "./hooks/usePwaInstall";
import { usePwaRuntime } from "./hooks/usePwaRuntime";
import {
  CUSTOM_PREFABS_STORAGE_KEY,
  createCustomPrefabDefinition,
  parseCustomPrefabJson,
  parseCustomPrefabList,
  serializeCustomPrefab,
  serializeCustomPrefabList,
  type CustomPrefabDefinition,
  type CustomPrefabDraft,
} from "./scene/customPrefabs";
import {
  ADDABLE_SCENE_ELEMENT_KINDS,
  getKindLabel,
  type AddableSceneElementKind,
} from "./scene/factory";
import type { LaneEditorSelection, PlayerId } from "./types";

function formatEditorValue(value: number): string {
  if (!Number.isFinite(value)) return "NaN";
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(3);
}

function loadStoredCustomPrefabs(): CustomPrefabDefinition[] {
  return parseCustomPrefabList(window.localStorage.getItem(CUSTOM_PREFABS_STORAGE_KEY));
}

function App() {
  const qsPlayer = new URLSearchParams(window.location.search).get("player");
  const initialPlayer: PlayerId = qsPlayer === "player2" ? "player2" : "player1";
  const [controlledPlayer, setControlledPlayer] = useState<PlayerId>(initialPlayer);
  const [debugPanelVisible, setDebugPanelVisible] = useState(false);
  const [isOnline, setIsOnline] = useState(() => window.navigator.onLine);
  const [editorMode, setEditorMode] = useState(false);
  const [editorSelection, setEditorSelection] = useState<LaneEditorSelection | null>(null);
  const [newElementKind, setNewElementKind] = useState<AddableSceneElementKind>(ADDABLE_SCENE_ELEMENT_KINDS[0]);
  const [customPrefabs, setCustomPrefabs] = useState<CustomPrefabDefinition[]>(() => loadStoredCustomPrefabs());
  const [selectedCustomPrefabId, setSelectedCustomPrefabId] = useState(() => loadStoredCustomPrefabs()[0]?.id ?? "");
  const [customPrefabJsonDraft, setCustomPrefabJsonDraft] = useState("");
  const [sceneJsonDraft, setSceneJsonDraft] = useState("");
  const [sceneIoStatus, setSceneIoStatus] = useState<string>("");
  const [editorPanelOffset, setEditorPanelOffset] = useState({ x: 0, y: 0 });
  const editorPanelRef = useRef<HTMLElement | null>(null);
  const laneCanvasRef = useRef<LaneCanvasHandle | null>(null);
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
    window.localStorage.setItem(CUSTOM_PREFABS_STORAGE_KEY, serializeCustomPrefabList(customPrefabs));
  }, [customPrefabs]);

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

  async function exportSceneJson() {
    const api = laneCanvasRef.current;
    if (!api) return;

    const json = api.exportSceneJson();
    setSceneJsonDraft(json);
    setSceneIoStatus("Scene exportee.");

    try {
      if (window.isSecureContext && window.navigator.clipboard) {
        await window.navigator.clipboard.writeText(json);
        setSceneIoStatus("Scene exportee et copiee dans le presse-papier.");
      }
    } catch {
      setSceneIoStatus("Scene exportee (copie presse-papier non disponible).");
    }
  }

  function importSceneJson() {
    const api = laneCanvasRef.current;
    if (!api) return;
    const result = api.importSceneJson(sceneJsonDraft);
    if (result.ok) {
      setEditorSelection(null);
      setSceneIoStatus("Scene importee.");
    } else {
      setSceneIoStatus(`Import refuse: ${result.error}`);
    }
  }

  function resetSceneJson() {
    const api = laneCanvasRef.current;
    if (!api) return;
    api.resetScene();
    setEditorSelection(null);
    setSceneIoStatus("Scene reset sur la configuration par defaut.");
    setSceneJsonDraft("");
  }

  function addSceneElement() {
    const api = laneCanvasRef.current;
    if (!api) return;
    const result = api.addSceneElement(newElementKind);
    if (result.ok) {
      setSceneIoStatus(`Element ajoute: ${result.id}.`);
      return;
    }
    setSceneIoStatus(`Ajout refuse: ${result.error}`);
  }

  function deleteSelectedElement() {
    const api = laneCanvasRef.current;
    if (!api) return;
    const result = api.deleteSelectedElement();
    if (result.ok) {
      setEditorSelection(null);
      setSceneIoStatus(`Element supprime: ${result.id}.`);
      return;
    }
    setSceneIoStatus(`Suppression refusee: ${result.error}`);
  }

  function createCustomPrefab(draft: CustomPrefabDraft) {
    const usedIds = new Set(customPrefabs.map((prefab) => prefab.id));
    const prefab = createCustomPrefabDefinition(draft, usedIds);
    setCustomPrefabs((prev) => [...prev, prefab]);
    setSelectedCustomPrefabId(prefab.id);
    setSceneIoStatus(`Prefab cree: ${prefab.name} (${prefab.id}).`);
  }

  function addSelectedCustomPrefabToScene() {
    const prefab = customPrefabs.find((item) => item.id === selectedCustomPrefabId);
    if (!prefab) {
      setSceneIoStatus("Aucun prefab custom selectionne.");
      return;
    }
    const api = laneCanvasRef.current;
    if (!api) return;
    const result = api.addCustomPrefabElement(prefab);
    if (result.ok) {
      setSceneIoStatus(`Prefab ajoute a la scene: ${result.id}.`);
      return;
    }
    setSceneIoStatus(`Ajout prefab refuse: ${result.error}`);
  }

  function removeSelectedCustomPrefab() {
    if (!selectedCustomPrefabId) {
      setSceneIoStatus("Aucun prefab custom selectionne.");
      return;
    }
    setCustomPrefabs((prev) => prev.filter((prefab) => prefab.id !== selectedCustomPrefabId));
    const remaining = customPrefabs.filter((prefab) => prefab.id !== selectedCustomPrefabId);
    setSelectedCustomPrefabId(remaining[0]?.id ?? "");
    setSceneIoStatus(`Prefab supprime de la bibliotheque: ${selectedCustomPrefabId}.`);
  }

  function exportSelectedCustomPrefab() {
    const prefab = customPrefabs.find((item) => item.id === selectedCustomPrefabId);
    if (!prefab) {
      setSceneIoStatus("Aucun prefab custom selectionne.");
      return;
    }
    setCustomPrefabJsonDraft(serializeCustomPrefab(prefab));
    setSceneIoStatus(`Prefab exporte: ${prefab.id}.`);
  }

  function importCustomPrefabFromJson() {
    const parsed = parseCustomPrefabJson(customPrefabJsonDraft);
    if (!parsed.ok) {
      setSceneIoStatus(`Import prefab refuse: ${parsed.error}`);
      return;
    }
    const usedIds = new Set(customPrefabs.map((prefab) => prefab.id));
    const prefab = createCustomPrefabDefinition(
      {
        name: parsed.prefab.name,
        footprint: parsed.prefab.footprint,
        height: parsed.prefab.height,
        topScale: parsed.prefab.topScale ?? 1,
        zLayer: parsed.prefab.zLayer,
        topColor: parsed.prefab.style.topColor,
        sideColor: parsed.prefab.style.sideColor,
        alpha: parsed.prefab.style.alpha,
      },
      usedIds
    );
    setCustomPrefabs((prev) => [...prev, prefab]);
    setSelectedCustomPrefabId(prefab.id);
    setSceneIoStatus(`Prefab importe: ${prefab.id}.`);
  }

  useEffect(() => {
    if (!editorMode) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || event.repeat) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName.toLowerCase();
        const isFormField = tagName === "input" || tagName === "textarea" || tagName === "select";
        if (isFormField || target.isContentEditable) return;
      }

      const api = laneCanvasRef.current;
      if (!api) return;

      const result = api.deleteSelectedElement();
      if (result.ok) {
        event.preventDefault();
        setEditorSelection(null);
        setSceneIoStatus(`Element supprime: ${result.id}.`);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editorMode]);

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
          ref={laneCanvasRef}
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

          <div className="editor-panel__section">
            <h3>Prefab custom</h3>
            <div className="editor-panel__subsection">
              <h4>Editeur 2.5D isometrique</h4>
              <PrefabIsoEditor onCreatePrefab={createCustomPrefab} />
            </div>
            <div className="editor-panel__actions editor-panel__actions--row">
              <label className="editor-panel__field">
                <span>Bibliotheque</span>
                <select
                  className="editor-panel__select"
                  value={selectedCustomPrefabId}
                  onChange={(event) => setSelectedCustomPrefabId(event.target.value)}
                >
                  <option value="">Choisir un prefab</option>
                  {customPrefabs.map((prefab) => (
                    <option key={prefab.id} value={prefab.id}>
                      {prefab.name} ({prefab.id})
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="editor-panel__btn" onClick={addSelectedCustomPrefabToScene}>
                Ajouter prefab
              </button>
              <button
                type="button"
                className="editor-panel__btn editor-panel__btn--danger"
                onClick={removeSelectedCustomPrefab}
              >
                Supprimer prefab
              </button>
            </div>
            <div className="editor-panel__actions">
              <button type="button" className="editor-panel__btn editor-panel__btn--ghost" onClick={exportSelectedCustomPrefab}>
                Export prefab JSON
              </button>
              <button type="button" className="editor-panel__btn editor-panel__btn--ghost" onClick={importCustomPrefabFromJson}>
                Import prefab JSON
              </button>
            </div>
            <textarea
              className="editor-panel__textarea"
              value={customPrefabJsonDraft}
              onChange={(event) => setCustomPrefabJsonDraft(event.target.value)}
              placeholder="JSON prefab custom (export/import)."
            />
          </div>

          <div className="editor-panel__section">
            <h3>Elements</h3>
            <div className="editor-panel__actions editor-panel__actions--row">
              <label className="editor-panel__field">
                <span>Type</span>
                <select
                  className="editor-panel__select"
                  value={newElementKind}
                  onChange={(event) => setNewElementKind(event.target.value as AddableSceneElementKind)}
                >
                  {ADDABLE_SCENE_ELEMENT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {getKindLabel(kind)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="editor-panel__btn" onClick={addSceneElement}>
                Ajouter element
              </button>
              <button
                type="button"
                className="editor-panel__btn editor-panel__btn--danger"
                onClick={deleteSelectedElement}
              >
                Supprimer selection
              </button>
            </div>
          </div>

          <div className="editor-panel__section">
            <h3>Scene JSON</h3>
            <div className="editor-panel__actions">
              <button type="button" className="editor-panel__btn" onClick={() => void exportSceneJson()}>
                Export + copy
              </button>
              <button type="button" className="editor-panel__btn" onClick={importSceneJson}>
                Import
              </button>
              <button type="button" className="editor-panel__btn editor-panel__btn--ghost" onClick={resetSceneJson}>
                Reset scene
              </button>
            </div>
            <textarea
              className="editor-panel__textarea"
              value={sceneJsonDraft}
              onChange={(event) => setSceneJsonDraft(event.target.value)}
              placeholder="Colle ici un JSON de scene puis clique Import."
            />
            {sceneIoStatus && <div className="editor-panel__io-status">{sceneIoStatus}</div>}
          </div>

          {!editorSelection && (
            <div className="editor-panel__empty">Selectionne un element de scene (lane, chateau, decor).</div>
          )}

          {editorSelection && (
            <>
              <div className="editor-panel__grid">
                <span>ID</span>
                <code>{editorSelection.id}</code>
                <span>Type</span>
                <code>{editorSelection.elementType}</code>
                <span>Kind</span>
                <code>{editorSelection.kind}</code>
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
