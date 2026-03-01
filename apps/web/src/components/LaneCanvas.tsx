import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";
import type { LaneEditorSelection, PlayerId, SnapshotMsg, Unit } from "../types";
import { applyMove, applyResize, applyRotation, buildSelectionPayload } from "../scene/editor";
import { createDefaultScene } from "../scene/defaultScene";
import type { CustomPrefabDefinition } from "../scene/customPrefabs";
import { createCustomPrefabSceneElement, createSceneElement, type AddableSceneElementKind } from "../scene/factory";
import {
  clamp,
  createIsoLayout,
  distanceSquared,
  getCanvasSize,
  normalizeAngleDelta,
  normalizeWheelAxis,
  pointInPolygon,
  projectIso,
  unprojectIso,
  worldToProgress,
  type IsoLayout,
  type IsoPoint,
} from "../scene/iso";
import { drawSceneElement, getElementEditorShape, getElementSortY, type ElementEditorShape } from "../scene/prefabs";
import { parseSceneJson, serializeScene } from "../scene/serialization";
import { appendElement, cloneScene, findElement, getLaneFloorElement, removeElement, replaceElement } from "../scene/sceneState";
import type { SceneDefinition, SceneElement } from "../scene/sceneTypes";

type LaneCanvasProps = {
  snapshots: SnapshotMsg[];
  editorMode?: boolean;
  onEditorSelectionChange?: (selection: LaneEditorSelection | null) => void;
};

export type LaneCanvasHandle = {
  exportSceneJson: () => string;
  importSceneJson: (json: string) => { ok: true } | { ok: false; error: string };
  addSceneElement: (kind: AddableSceneElementKind) => { ok: true; id: string } | { ok: false; error: string };
  addCustomPrefabElement: (prefab: CustomPrefabDefinition) => { ok: true; id: string } | { ok: false; error: string };
  deleteSelectedElement: () => { ok: true; id: string } | { ok: false; error: string };
  resetScene: () => void;
};

const WORLD_MIN_X = 0;
const WORLD_MAX_X = 1000;
const INTERPOLATION_DELAY_MS = 100;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 2.5;
const HANDLE_HIT_RADIUS_PX = 14;

type EditableShapeEntry = {
  elementId: string;
  shape: ElementEditorShape;
};

type ElementDragState = {
  mode: "move" | "resize" | "rotate";
  pointerId: number;
  elementId: string;
  startU: number;
  startV: number;
  startAngle: number;
  originElement: SceneElement;
};

type CameraDragState = {
  mode: "camera";
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

function getInterpolationPair(snapshots: SnapshotMsg[], renderTime: number) {
  if (snapshots.length === 0) return null;
  if (snapshots.length === 1) return { a: snapshots[0], b: snapshots[0], alpha: 0 };

  if (renderTime <= snapshots[0].serverTime) {
    return { a: snapshots[0], b: snapshots[0], alpha: 0 };
  }

  for (let i = 0; i < snapshots.length - 1; i += 1) {
    const a = snapshots[i];
    const b = snapshots[i + 1];
    if (renderTime >= a.serverTime && renderTime <= b.serverTime) {
      const dt = Math.max(1, b.serverTime - a.serverTime);
      return { a, b, alpha: clamp((renderTime - a.serverTime) / dt, 0, 1) };
    }
  }

  const last = snapshots[snapshots.length - 1];
  return { a: last, b: last, alpha: 0 };
}

function interpolateUnits(aUnits: Unit[], bUnits: Unit[], alpha: number): Array<{ owner: PlayerId; x: number }> {
  const aMap = new Map(aUnits.map((unit) => [unit.id, unit]));
  const bMap = new Map(bUnits.map((unit) => [unit.id, unit]));
  const ids = new Set([...aMap.keys(), ...bMap.keys()]);
  const result: Array<{ owner: PlayerId; x: number }> = [];

  for (const id of ids) {
    const a = aMap.get(id);
    const b = bMap.get(id);

    if (a && b) {
      result.push({ owner: b.owner, x: a.x + (b.x - a.x) * alpha });
      continue;
    }

    if (b) {
      result.push({ owner: b.owner, x: b.x });
      continue;
    }

    if (a) {
      result.push({ owner: a.owner, x: a.x });
    }
  }

  return result;
}

function findShapeById(shapes: EditableShapeEntry[], elementId: string): EditableShapeEntry | null {
  return shapes.find((entry) => entry.elementId === elementId) ?? null;
}

function findHitShape(point: IsoPoint, shapes: EditableShapeEntry[]): EditableShapeEntry | null {
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    if (pointInPolygon(point, shapes[i].shape.polygon)) {
      return shapes[i];
    }
  }
  return null;
}

function drawPolygonStroke(graphics: Graphics, points: IsoPoint[], color: number, width: number, alpha = 1): void {
  if (points.length === 0) return;
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    graphics.lineTo(points[i].x, points[i].y);
  }
  graphics.closePath().stroke({ color, width, alpha });
}

export const LaneCanvas = forwardRef<LaneCanvasHandle, LaneCanvasProps>(function LaneCanvas(
  { snapshots, editorMode = false, onEditorSelectionChange },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const snapshotsRef = useRef<SnapshotMsg[]>([]);
  const editorModeRef = useRef<boolean>(editorMode);
  const onEditorSelectionChangeRef = useRef<typeof onEditorSelectionChange>(onEditorSelectionChange);
  const sceneRef = useRef<SceneDefinition>(createDefaultScene());
  const selectedElementIdRef = useRef<string | null>(null);

  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);

  useEffect(() => {
    editorModeRef.current = editorMode;
  }, [editorMode]);

  useEffect(() => {
    onEditorSelectionChangeRef.current = onEditorSelectionChange;
  }, [onEditorSelectionChange]);

  const emitSelection = (elementId: string | null) => {
    const cb = onEditorSelectionChangeRef.current;
    if (!cb) return;
    if (!elementId) {
      cb(null);
      return;
    }
    const element = findElement(sceneRef.current, elementId);
    cb(element ? buildSelectionPayload(element) : null);
  };

  useImperativeHandle(
    ref,
    () => ({
      exportSceneJson() {
        return serializeScene(sceneRef.current);
      },
      importSceneJson(json: string) {
        const parsed = parseSceneJson(json);
        if (!parsed.ok) {
          return { ok: false, error: parsed.error };
        }
        sceneRef.current = cloneScene(parsed.scene);
        selectedElementIdRef.current = null;
        emitSelection(null);
        return { ok: true };
      },
      addSceneElement(kind: AddableSceneElementKind) {
        const selectedElement = selectedElementIdRef.current
          ? findElement(sceneRef.current, selectedElementIdRef.current)
          : null;
        const anchor = selectedElement
          ? {
              u: selectedElement.transform.u + 0.06,
              v: selectedElement.transform.v + 0.03,
            }
          : undefined;
        const nextElement = createSceneElement(sceneRef.current, kind, anchor);
        sceneRef.current = appendElement(sceneRef.current, nextElement);
        selectedElementIdRef.current = nextElement.id;
        emitSelection(nextElement.id);
        return { ok: true, id: nextElement.id };
      },
      addCustomPrefabElement(prefab: CustomPrefabDefinition) {
        const selectedElement = selectedElementIdRef.current
          ? findElement(sceneRef.current, selectedElementIdRef.current)
          : null;
        const anchor = selectedElement
          ? {
              u: selectedElement.transform.u + 0.06,
              v: selectedElement.transform.v + 0.03,
            }
          : undefined;
        const nextElement = createCustomPrefabSceneElement(sceneRef.current, prefab, anchor);
        sceneRef.current = appendElement(sceneRef.current, nextElement);
        selectedElementIdRef.current = nextElement.id;
        emitSelection(nextElement.id);
        return { ok: true, id: nextElement.id };
      },
      deleteSelectedElement() {
        const selectedId = selectedElementIdRef.current;
        if (!selectedId) {
          return { ok: false, error: "Aucun element selectionne." };
        }

        const selectedElement = findElement(sceneRef.current, selectedId);
        if (!selectedElement) {
          selectedElementIdRef.current = null;
          emitSelection(null);
          return { ok: false, error: "Element introuvable dans la scene." };
        }

        if (selectedElement.kind === "lane_floor") {
          return { ok: false, error: "Le plancher de lane ne peut pas etre supprime." };
        }

        sceneRef.current = removeElement(sceneRef.current, selectedId);
        selectedElementIdRef.current = null;
        emitSelection(null);
        return { ok: true, id: selectedId };
      },
      resetScene() {
        sceneRef.current = createDefaultScene();
        selectedElementIdRef.current = null;
        emitSelection(null);
      },
    }),
    []
  );

  useEffect(() => {
    let destroyed = false;
    let app: Application | null = null;
    let worldContainer: Container | null = null;
    let staticG: Graphics | null = null;
    let unitsG: Graphics | null = null;
    let overlayG: Graphics | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let removeWheelListener: (() => void) | null = null;
    let removePointerListeners: (() => void) | null = null;
    let latestLayout: IsoLayout | null = null;
    let latestShapes: EditableShapeEntry[] = [];
    let cameraDragState: CameraDragState | null = null;
    let elementDragState: ElementDragState | null = null;
    const host = hostRef.current;

    const camera = {
      zoom: 1,
      x: 0,
      y: 0,
    };

    const setCursor = (cursor: string) => {
      if (!app) return;
      if (app.canvas.style.cursor !== cursor) {
        app.canvas.style.cursor = cursor;
      }
    };

    const applyCamera = () => {
      if (!worldContainer) return;
      worldContainer.scale.set(camera.zoom);
      worldContainer.position.set(camera.x, camera.y);
    };

    const pointerToWorldPoint = (event: PointerEvent): IsoPoint | null => {
      if (!app) return null;
      const rect = app.canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left - camera.x) / camera.zoom,
        y: (event.clientY - rect.top - camera.y) / camera.zoom,
      };
    };

    const replaceSceneElement = (element: SceneElement) => {
      sceneRef.current = replaceElement(sceneRef.current, element);
    };

    const init = async () => {
      if (!host) return;

      const initialSize = getCanvasSize(host);
      const pixiApp = new Application();
      await pixiApp.init({
        width: initialSize.width,
        height: initialSize.height,
        background: 0x0f172a,
        antialias: true,
      });

      if (destroyed) {
        pixiApp.destroy(true);
        return;
      }

      app = pixiApp;
      host.appendChild(pixiApp.canvas);

      worldContainer = new Container();
      staticG = new Graphics();
      unitsG = new Graphics();
      overlayG = new Graphics();

      worldContainer.addChild(staticG);
      worldContainer.addChild(unitsG);
      worldContainer.addChild(overlayG);
      pixiApp.stage.addChild(worldContainer);
      applyCamera();
      setCursor(editorModeRef.current ? "crosshair" : "grab");

      const onWheel = (event: WheelEvent) => {
        if (!app) return;
        event.preventDefault();

        const deltaX = normalizeWheelAxis(event, "x");
        const deltaY = normalizeWheelAxis(event, "y");
        const hasTrackpadPanIntent = Math.abs(deltaX) > 0.5;

        if (event.shiftKey || event.altKey || hasTrackpadPanIntent) {
          const panX = hasTrackpadPanIntent ? deltaX : event.shiftKey ? deltaY : 0;
          const panY = hasTrackpadPanIntent || event.altKey ? deltaY : 0;
          camera.x -= panX;
          camera.y -= panY;
          applyCamera();
          return;
        }

        const rect = app.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const oldZoom = camera.zoom;
        const sensitivity = event.ctrlKey ? 0.0023 : 0.0016;
        const nextZoom = clamp(oldZoom * Math.exp(-deltaY * sensitivity), MIN_ZOOM, MAX_ZOOM);
        if (nextZoom === oldZoom) return;

        const worldX = (mouseX - camera.x) / oldZoom;
        const worldY = (mouseY - camera.y) / oldZoom;

        camera.zoom = nextZoom;
        camera.x = mouseX - worldX * nextZoom;
        camera.y = mouseY - worldY * nextZoom;
        applyCamera();
      };

      const onPointerDown = (event: PointerEvent) => {
        if (!app) return;

        const cameraPanRequested =
          event.button === 1 ||
          (!editorModeRef.current && event.button === 0) ||
          (editorModeRef.current && event.button === 0 && event.altKey);

        if (cameraPanRequested) {
          cameraDragState = {
            mode: "camera",
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: camera.x,
            originY: camera.y,
          };
          app.canvas.setPointerCapture(event.pointerId);
          setCursor("grabbing");
          return;
        }

        if (!editorModeRef.current || event.button !== 0 || !latestLayout) return;

        const worldPoint = pointerToWorldPoint(event);
        if (!worldPoint) return;
        const pointerUv = unprojectIso(latestLayout, worldPoint.x, worldPoint.y);
        const selectedId = selectedElementIdRef.current;
        const selectedShape = selectedId ? findShapeById(latestShapes, selectedId) : null;
        const hitRadius = HANDLE_HIT_RADIUS_PX / camera.zoom;

        const isOnResizeHandle = Boolean(
          selectedShape &&
            distanceSquared(worldPoint, selectedShape.shape.resizeHandle) <= hitRadius * hitRadius
        );
        const isOnRotateHandle = Boolean(
          selectedShape &&
            distanceSquared(worldPoint, selectedShape.shape.rotateHandle) <= hitRadius * hitRadius
        );

        if (selectedId && selectedShape && (isOnResizeHandle || isOnRotateHandle)) {
          const selectedElement = findElement(sceneRef.current, selectedId);
          if (!selectedElement) return;
          const centerPoint = selectedShape.shape.center;
          elementDragState = {
            mode: isOnRotateHandle ? "rotate" : "resize",
            pointerId: event.pointerId,
            elementId: selectedId,
            startU: pointerUv.u,
            startV: pointerUv.v,
            startAngle: Math.atan2(worldPoint.y - centerPoint.y, worldPoint.x - centerPoint.x),
            originElement: {
              ...selectedElement,
              transform: { ...selectedElement.transform },
              size: { ...selectedElement.size },
              style: selectedElement.style ? { ...selectedElement.style } : undefined,
              meta: selectedElement.meta ? { ...selectedElement.meta } : undefined,
            },
          };
          app.canvas.setPointerCapture(event.pointerId);
          setCursor(isOnRotateHandle ? "alias" : "nwse-resize");
          return;
        }

        const hitShape = findHitShape(worldPoint, latestShapes);
        if (!hitShape) {
          selectedElementIdRef.current = null;
          elementDragState = null;
          emitSelection(null);
          setCursor("crosshair");
          return;
        }

        const hitElement = findElement(sceneRef.current, hitShape.elementId);
        if (!hitElement || !hitElement.editable) return;

        selectedElementIdRef.current = hitElement.id;
        emitSelection(hitElement.id);
        elementDragState = {
          mode: "move",
          pointerId: event.pointerId,
          elementId: hitElement.id,
          startU: pointerUv.u,
          startV: pointerUv.v,
          startAngle: 0,
          originElement: {
            ...hitElement,
            transform: { ...hitElement.transform },
            size: { ...hitElement.size },
            style: hitElement.style ? { ...hitElement.style } : undefined,
            meta: hitElement.meta ? { ...hitElement.meta } : undefined,
          },
        };
        app.canvas.setPointerCapture(event.pointerId);
        setCursor("grabbing");
      };

      const onPointerMove = (event: PointerEvent) => {
        if (!latestLayout) return;

        if (cameraDragState && cameraDragState.pointerId === event.pointerId) {
          camera.x = cameraDragState.originX + (event.clientX - cameraDragState.startX);
          camera.y = cameraDragState.originY + (event.clientY - cameraDragState.startY);
          applyCamera();
          setCursor("grabbing");
          return;
        }

        if (!editorModeRef.current) {
          if (!elementDragState) setCursor("grab");
          return;
        }

        const worldPoint = pointerToWorldPoint(event);
        if (!worldPoint) return;
        const pointerUv = unprojectIso(latestLayout, worldPoint.x, worldPoint.y);

        if (elementDragState && elementDragState.pointerId === event.pointerId) {
          const origin = elementDragState.originElement;
          if (elementDragState.mode === "move") {
            const du = pointerUv.u - elementDragState.startU;
            const dv = pointerUv.v - elementDragState.startV;
            replaceSceneElement(applyMove(origin, du, dv));
            emitSelection(origin.id);
            setCursor("grabbing");
            return;
          }

          if (elementDragState.mode === "resize") {
            replaceSceneElement(applyResize(origin, pointerUv.u, pointerUv.v));
            emitSelection(origin.id);
            setCursor("nwse-resize");
            return;
          }

          if (elementDragState.mode === "rotate") {
            const centerPoint = projectIso(latestLayout, origin.transform.u, origin.transform.v);
            const currentAngle = Math.atan2(worldPoint.y - centerPoint.y, worldPoint.x - centerPoint.x);
            const angleDelta = normalizeAngleDelta(currentAngle - elementDragState.startAngle);
            replaceSceneElement(applyRotation(origin, angleDelta));
            emitSelection(origin.id);
            setCursor("alias");
            return;
          }
        }

        const selectedId = selectedElementIdRef.current;
        const selectedShape = selectedId ? findShapeById(latestShapes, selectedId) : null;
        const hitRadius = HANDLE_HIT_RADIUS_PX / camera.zoom;

        if (
          selectedShape &&
          distanceSquared(worldPoint, selectedShape.shape.resizeHandle) <= hitRadius * hitRadius
        ) {
          setCursor("nwse-resize");
          return;
        }

        if (
          selectedShape &&
          distanceSquared(worldPoint, selectedShape.shape.rotateHandle) <= hitRadius * hitRadius
        ) {
          setCursor("alias");
          return;
        }

        const hitShape = findHitShape(worldPoint, latestShapes);
        setCursor(hitShape ? "grab" : "crosshair");
      };

      const onPointerUp = (event: PointerEvent) => {
        if (!app) return;

        if (cameraDragState && cameraDragState.pointerId === event.pointerId) {
          cameraDragState = null;
          if (app.canvas.hasPointerCapture(event.pointerId)) {
            app.canvas.releasePointerCapture(event.pointerId);
          }
          setCursor(editorModeRef.current ? "crosshair" : "grab");
          return;
        }

        if (elementDragState && elementDragState.pointerId === event.pointerId) {
          elementDragState = null;
          if (app.canvas.hasPointerCapture(event.pointerId)) {
            app.canvas.releasePointerCapture(event.pointerId);
          }
          setCursor(editorModeRef.current ? "crosshair" : "grab");
        }
      };

      app.canvas.addEventListener("wheel", onWheel, { passive: false });
      app.canvas.addEventListener("pointerdown", onPointerDown);
      app.canvas.addEventListener("pointermove", onPointerMove);
      app.canvas.addEventListener("pointerup", onPointerUp);
      app.canvas.addEventListener("pointercancel", onPointerUp);

      removeWheelListener = () => {
        app?.canvas.removeEventListener("wheel", onWheel);
      };
      removePointerListeners = () => {
        app?.canvas.removeEventListener("pointerdown", onPointerDown);
        app?.canvas.removeEventListener("pointermove", onPointerMove);
        app?.canvas.removeEventListener("pointerup", onPointerUp);
        app?.canvas.removeEventListener("pointercancel", onPointerUp);
      };

      resizeObserver = new ResizeObserver(() => {
        if (!app || !host) return;
        const nextSize = getCanvasSize(host);
        app.renderer.resize(nextSize.width, nextSize.height);
      });
      resizeObserver.observe(host);

      pixiApp.ticker.add(() => {
        if (!staticG || !unitsG || !overlayG || !app) return;

        const scene = sceneRef.current;
        const lane = getLaneFloorElement(scene);
        const laneHalfDepth = lane ? (lane.size.depth * lane.transform.scale) / 2 : 0.2;
        const width = app.screen.width;
        const height = app.screen.height;
        const layout = createIsoLayout(width, height, Math.max(0.05, laneHalfDepth));
        latestLayout = layout;

        staticG.clear();
        unitsG.clear();
        overlayG.clear();

        const sortedElements = [...scene.elements].sort((left, right) => {
          const layerOrder = left.zLayer - right.zLayer;
          if (layerOrder !== 0) return layerOrder;
          return getElementSortY(layout, left) - getElementSortY(layout, right);
        });

        latestShapes = [];
        for (const element of sortedElements) {
          drawSceneElement(staticG, layout, element);
          if (editorModeRef.current && element.editable) {
            const shape = getElementEditorShape(layout, element);
            if (shape) {
              latestShapes.push({ elementId: element.id, shape });
            }
          }
        }

        const renderTime = Date.now() - INTERPOLATION_DELAY_MS;
        const pair = getInterpolationPair(snapshotsRef.current, renderTime);
        if (pair && lane) {
          const laneWidth = lane.size.width * lane.transform.scale;
          const laneDepth = lane.size.depth * lane.transform.scale;
          const halfLaneWidth = laneWidth * 0.5;
          const laneOffset = clamp(laneDepth * 0.18, 0.04, 0.28);
          const unitRadius = Math.max(4, 8 * (width / 980));

          const drawUnits = interpolateUnits(pair.a.units, pair.b.units, pair.alpha)
            .map((unit) => {
              const along = -halfLaneWidth + worldToProgress(unit.x, WORLD_MIN_X, WORLD_MAX_X) * laneWidth;
              const across = unit.owner === "player1" ? -laneOffset : laneOffset;
              const unitUv = {
                u: lane.transform.u + along * Math.cos(lane.transform.rotation) - across * Math.sin(lane.transform.rotation),
                v: lane.transform.v + along * Math.sin(lane.transform.rotation) + across * Math.cos(lane.transform.rotation),
              };
              const point = projectIso(layout, unitUv.u, unitUv.v);
              return { owner: unit.owner, x: point.x, y: point.y };
            })
            .sort((left, right) => left.y - right.y);

          for (const unit of drawUnits) {
            const color = unit.owner === "player1" ? 0x77b8ff : 0xff9a9a;
            const highlight = unit.owner === "player1" ? 0xbddcff : 0xffd1d1;
            const bodyY = unit.y - unitRadius * 0.5;

            unitsG
              .ellipse(unit.x, unit.y + unitRadius * 0.45, unitRadius * 1.1, unitRadius * 0.45)
              .fill({ color: 0x020617, alpha: 0.42 });
            unitsG.circle(unit.x, bodyY, unitRadius).fill({ color, alpha: 1 });
            unitsG
              .circle(unit.x - unitRadius * 0.28, bodyY - unitRadius * 0.34, unitRadius * 0.28)
              .fill({ color: highlight, alpha: 0.55 });
          }
        }

        if (editorModeRef.current) {
          const selectedId = selectedElementIdRef.current;
          for (const entry of latestShapes) {
            const isSelected = entry.elementId === selectedId;
            const shape = entry.shape;
            drawPolygonStroke(
              overlayG,
              shape.polygon,
              isSelected ? 0xfacc15 : 0x38bdf8,
              isSelected ? 2.5 / camera.zoom : 1.4 / camera.zoom,
              0.9
            );

            if (isSelected) {
              const size = 6 / camera.zoom;
              overlayG
                .moveTo(shape.center.x, shape.center.y)
                .lineTo(shape.rotateHandle.x, shape.rotateHandle.y)
                .stroke({ color: 0xfacc15, width: 1.4 / camera.zoom, alpha: 0.9 });
              overlayG
                .rect(shape.resizeHandle.x - size, shape.resizeHandle.y - size, size * 2, size * 2)
                .fill({ color: 0xfacc15, alpha: 0.96 })
                .stroke({ color: 0x0f172a, width: 1.2 / camera.zoom, alpha: 1 });
              overlayG
                .circle(shape.rotateHandle.x, shape.rotateHandle.y, 5 / camera.zoom)
                .fill({ color: 0xf97316, alpha: 0.96 })
                .stroke({ color: 0x0f172a, width: 1.2 / camera.zoom, alpha: 1 });
            }
          }
        }

        pixiApp.canvas.style.display = "block";
        pixiApp.canvas.style.width = `${width}px`;
        pixiApp.canvas.style.height = `${height}px`;
        pixiApp.canvas.style.margin = "0 auto";
      });
    };

    void init();

    return () => {
      destroyed = true;
      if (resizeObserver) resizeObserver.disconnect();
      if (removePointerListeners) removePointerListeners();
      if (removeWheelListener) removeWheelListener();
      if (app) app.destroy(true, { children: true });
      if (host) host.innerHTML = "";
    };
  }, []);

  return <div ref={hostRef} className="lane-canvas-host" aria-label="Lane canvas" />;
});
