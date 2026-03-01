import { useEffect, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";
import type { LaneEditorSelection, PlayerId, SnapshotMsg, Unit } from "../types";

type LaneCanvasProps = {
  snapshots: SnapshotMsg[];
  editorMode?: boolean;
  onEditorSelectionChange?: (selection: LaneEditorSelection | null) => void;
};

const WORLD_MIN_X = 0;
const WORLD_MAX_X = 1000;
const INTERPOLATION_DELAY_MS = 100;

const DESIGN_WIDTH = 980;
const DESIGN_HEIGHT = 420;
const ASPECT_RATIO = DESIGN_WIDTH / DESIGN_HEIGHT;
const MIN_CANVAS_WIDTH = 260;
const MAX_CANVAS_WIDTH = DESIGN_WIDTH;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 2.5;

const HANDLE_HIT_RADIUS_PX = 14;
const BOARD_MIN_WIDTH = 0.2;
const BOARD_MAX_WIDTH = 2.6;
const BOARD_MIN_HALF_WIDTH = 0.05;
const BOARD_MAX_HALF_WIDTH = 0.7;
const CASTLE_MIN_HALF_U = 0.02;
const CASTLE_MAX_HALF_U = 0.32;
const CASTLE_MIN_HALF_V = 0.03;
const CASTLE_MAX_HALF_V = 0.32;

type CanvasSize = {
  width: number;
  height: number;
};

type IsoPoint = {
  x: number;
  y: number;
};

type UvPoint = {
  u: number;
  v: number;
};

type IsoLayout = {
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
};

type EditableId = "lane-board" | "castle-player1" | "castle-player2";

type BoardState = {
  centerU: number;
  centerV: number;
  width: number;
  halfWidth: number;
  rotation: number;
};

type CastleState = {
  centerU: number;
  centerV: number;
  halfU: number;
  halfV: number;
  heightScale: number;
  rotation: number;
  topColor: number;
  leftFaceColor: number;
  rightFaceColor: number;
};

type EditorState = {
  board: BoardState;
  castles: {
    player1: CastleState;
    player2: CastleState;
  };
};

type CastleGeometry = {
  a: IsoPoint;
  b: IsoPoint;
  c: IsoPoint;
  d: IsoPoint;
  aTop: IsoPoint;
  bTop: IsoPoint;
  cTop: IsoPoint;
  dTop: IsoPoint;
};

type EditorShape = {
  id: EditableId;
  polygon: IsoPoint[];
  center: IsoPoint;
  resizeHandle: IsoPoint;
  rotateHandle: IsoPoint;
};

type DragState = {
  mode: "move" | "resize" | "rotate";
  pointerId: number;
  id: EditableId;
  startU: number;
  startV: number;
  startAngle: number;
  origin: EditorState;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatTsNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) return `${rounded}`;
  return rounded.toFixed(3);
}

function getCanvasSize(host: HTMLDivElement): CanvasSize {
  const width = clamp(Math.round(host.clientWidth), MIN_CANVAS_WIDTH, MAX_CANVAS_WIDTH);
  const height = Math.max(80, Math.round(width / ASPECT_RATIO));
  return { width, height };
}

function worldToProgress(worldX: number): number {
  return clamp((worldX - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X), 0, 1);
}

function normalizeWheelAxis(event: WheelEvent, axis: "x" | "y"): number {
  const rawValue = axis === "x" ? event.deltaX : event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return rawValue * 16;
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return rawValue * window.innerHeight;
  }
  return rawValue;
}

function createIsoLayout(width: number, height: number, boardHalfWidth: number): IsoLayout {
  const horizontalLimit = (width * 0.84) / (1 + boardHalfWidth * 2);
  const verticalLimit = (height * 0.72) / ((1 + boardHalfWidth * 2) * 0.5);
  const scaleX = Math.max(60, Math.min(horizontalLimit, verticalLimit));
  const scaleY = scaleX * 0.5;
  const centerX = width * 0.5;
  const centerY = height * 0.5;

  return {
    originX: centerX - scaleX * 0.5,
    originY: centerY - scaleY * 0.5,
    scaleX,
    scaleY,
  };
}

function projectIso(layout: IsoLayout, u: number, v: number): IsoPoint {
  return {
    x: layout.originX + (u - v) * layout.scaleX,
    y: layout.originY + (u + v) * layout.scaleY,
  };
}

function unprojectIso(layout: IsoLayout, x: number, y: number): { u: number; v: number } {
  const a = (x - layout.originX) / layout.scaleX;
  const b = (y - layout.originY) / layout.scaleY;
  return {
    u: (a + b) * 0.5,
    v: (b - a) * 0.5,
  };
}

function normalizeAngleDelta(angle: number): number {
  const twoPi = Math.PI * 2;
  let delta = angle % twoPi;
  if (delta > Math.PI) delta -= twoPi;
  if (delta < -Math.PI) delta += twoPi;
  return delta;
}

function localToUv(centerU: number, centerV: number, du: number, dv: number, rotation: number): UvPoint {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    u: centerU + du * cos - dv * sin,
    v: centerV + du * sin + dv * cos,
  };
}

function uvToLocal(centerU: number, centerV: number, u: number, v: number, rotation: number): UvPoint {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const ru = u - centerU;
  const rv = v - centerV;
  return {
    u: ru * cos + rv * sin,
    v: -ru * sin + rv * cos,
  };
}

function drawPolygonFill(graphics: Graphics, points: IsoPoint[], color: number, alpha = 1): void {
  if (points.length === 0) return;
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    graphics.lineTo(points[i].x, points[i].y);
  }
  graphics.closePath().fill({ color, alpha });
}

function drawPolygonStroke(graphics: Graphics, points: IsoPoint[], color: number, width: number, alpha = 1): void {
  if (points.length === 0) return;
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    graphics.lineTo(points[i].x, points[i].y);
  }
  graphics.closePath().stroke({ color, width, alpha });
}

function offsetPoint(point: IsoPoint, dx: number, dy: number): IsoPoint {
  return { x: point.x + dx, y: point.y + dy };
}

function distanceSquared(a: IsoPoint, b: IsoPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function pointInPolygon(point: IsoPoint, polygon: IsoPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function cloneEditorState(state: EditorState): EditorState {
  return {
    board: { ...state.board },
    castles: {
      player1: { ...state.castles.player1 },
      player2: { ...state.castles.player2 },
    },
  };
}

function getBoardCorners(layout: IsoLayout, board: BoardState): IsoPoint[] {
  const cornersUv = [
    localToUv(board.centerU, board.centerV, -board.width * 0.5, -board.halfWidth, board.rotation),
    localToUv(board.centerU, board.centerV, +board.width * 0.5, -board.halfWidth, board.rotation),
    localToUv(board.centerU, board.centerV, +board.width * 0.5, +board.halfWidth, board.rotation),
    localToUv(board.centerU, board.centerV, -board.width * 0.5, +board.halfWidth, board.rotation),
  ];

  return cornersUv.map((point) => projectIso(layout, point.u, point.v));
}

function drawLaneBoard(graphics: Graphics, layout: IsoLayout, board: BoardState): void {
  const corners = getBoardCorners(layout, board);
  drawPolygonFill(graphics, corners, 0x1e293b, 0.95);
}

function getCastleGeometry(layout: IsoLayout, castle: CastleState): CastleGeometry {
  const aUv = localToUv(castle.centerU, castle.centerV, -castle.halfU, -castle.halfV, castle.rotation);
  const bUv = localToUv(castle.centerU, castle.centerV, +castle.halfU, -castle.halfV, castle.rotation);
  const cUv = localToUv(castle.centerU, castle.centerV, +castle.halfU, +castle.halfV, castle.rotation);
  const dUv = localToUv(castle.centerU, castle.centerV, -castle.halfU, +castle.halfV, castle.rotation);
  const a = projectIso(layout, aUv.u, aUv.v);
  const b = projectIso(layout, bUv.u, bUv.v);
  const c = projectIso(layout, cUv.u, cUv.v);
  const d = projectIso(layout, dUv.u, dUv.v);
  const height = Math.max(12, layout.scaleY * castle.heightScale);

  return {
    a,
    b,
    c,
    d,
    aTop: offsetPoint(a, 0, -height),
    bTop: offsetPoint(b, 0, -height),
    cTop: offsetPoint(c, 0, -height),
    dTop: offsetPoint(d, 0, -height),
  };
}

function drawIsoCastle(graphics: Graphics, geometry: CastleGeometry, castle: CastleState): void {
  drawPolygonFill(graphics, [geometry.d, geometry.c, geometry.cTop, geometry.dTop], castle.leftFaceColor, 1);
  drawPolygonFill(graphics, [geometry.b, geometry.c, geometry.cTop, geometry.bTop], castle.rightFaceColor, 1);
  drawPolygonFill(graphics, [geometry.aTop, geometry.bTop, geometry.cTop, geometry.dTop], castle.topColor, 1);

  const gateWidth = (geometry.c.x - geometry.d.x) * 0.26;
  const gateHeight = (geometry.d.y - geometry.dTop.y) * 0.45;
  const gateBottomY = (geometry.c.y + geometry.d.y) * 0.5 - 2;
  const gateCenterX = (geometry.c.x + geometry.d.x) * 0.5;
  const gateLeft = gateCenterX - gateWidth * 0.5;
  const gateRight = gateCenterX + gateWidth * 0.5;
  const gateTopY = gateBottomY - gateHeight;

  drawPolygonFill(
    graphics,
    [
      { x: gateLeft, y: gateBottomY },
      { x: gateRight, y: gateBottomY },
      { x: gateRight - gateWidth * 0.12, y: gateTopY },
      { x: gateLeft + gateWidth * 0.12, y: gateTopY },
    ],
    0x0f172a,
    0.85
  );
}

function getInterpPair(snapshots: SnapshotMsg[], renderTime: number) {
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
      const alpha = clamp((renderTime - a.serverTime) / dt, 0, 1);
      return { a, b, alpha };
    }
  }

  const last = snapshots[snapshots.length - 1];
  return { a: last, b: last, alpha: 0 };
}

function interpolateUnits(aUnits: Unit[], bUnits: Unit[], alpha: number): Array<{ owner: PlayerId; x: number }> {
  const aMap = new Map(aUnits.map((u) => [u.id, u]));
  const bMap = new Map(bUnits.map((u) => [u.id, u]));
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

function createInitialEditorState(): EditorState {
  return {
    board: {
      centerU: 0.5,
      centerV: 0,
      width: 1,
      halfWidth: 0.18,
      rotation: 0,
    },
    castles: {
      player1: {
        centerU: -0.08,
        centerV: 0,
        halfU: 0.06,
        halfV: 0.09,
        heightScale: 0.42,
        rotation: 0,
        topColor: 0x5ea7ff,
        leftFaceColor: 0x2f69b2,
        rightFaceColor: 0x4179bd,
      },
      player2: {
        centerU: 1.08,
        centerV: 0,
        halfU: 0.06,
        halfV: 0.09,
        heightScale: 0.42,
        rotation: 0,
        topColor: 0xff8f8f,
        leftFaceColor: 0xb84848,
        rightFaceColor: 0xc55a5a,
      },
    },
  };
}

function getRotateHandle(center: IsoPoint, polygon: IsoPoint[], distanceFactor = 1.35): IsoPoint {
  let top = polygon[0];
  for (const point of polygon) {
    if (point.y < top.y) {
      top = point;
    }
  }

  return {
    x: center.x + (top.x - center.x) * distanceFactor,
    y: center.y + (top.y - center.y) * distanceFactor,
  };
}

function getEditorShapes(layout: IsoLayout, state: EditorState): EditorShape[] {
  const boardCorners = getBoardCorners(layout, state.board);
  const p1 = getCastleGeometry(layout, state.castles.player1);
  const p2 = getCastleGeometry(layout, state.castles.player2);
  const boardCenter = projectIso(layout, state.board.centerU, state.board.centerV);
  const p1Center = projectIso(layout, state.castles.player1.centerU, state.castles.player1.centerV);
  const p2Center = projectIso(layout, state.castles.player2.centerU, state.castles.player2.centerV);
  const p1Polygon = [p1.aTop, p1.bTop, p1.cTop, p1.c, p1.d, p1.dTop];
  const p2Polygon = [p2.aTop, p2.bTop, p2.cTop, p2.c, p2.d, p2.dTop];

  return [
    {
      id: "lane-board",
      polygon: boardCorners,
      center: boardCenter,
      resizeHandle: boardCorners[2],
      rotateHandle: getRotateHandle(boardCenter, boardCorners, 1.45),
    },
    {
      id: "castle-player1",
      polygon: p1Polygon,
      center: p1Center,
      resizeHandle: p1.cTop,
      rotateHandle: getRotateHandle(p1Center, p1Polygon, 1.5),
    },
    {
      id: "castle-player2",
      polygon: p2Polygon,
      center: p2Center,
      resizeHandle: p2.cTop,
      rotateHandle: getRotateHandle(p2Center, p2Polygon, 1.5),
    },
  ];
}

function findHitShape(point: IsoPoint, shapes: EditorShape[]): EditableId | null {
  const lookup = new Map(shapes.map((shape) => [shape.id, shape]));
  const order: EditableId[] = ["castle-player2", "castle-player1", "lane-board"];
  for (const id of order) {
    const shape = lookup.get(id);
    if (shape && pointInPolygon(point, shape.polygon)) return id;
  }
  return null;
}

function buildSelectionPayload(id: EditableId, state: EditorState): LaneEditorSelection {
  if (id === "lane-board") {
    return {
      id,
      label: "Lane board",
      elementType: "board",
      htmlTarget: ".lane-canvas-host > canvas (Pixi)",
      cssTarget: ".lane-canvas-host",
      tsTarget: "apps/web/src/components/LaneCanvas.tsx:createInitialEditorState().board",
      position: {
        centerU: state.board.centerU,
        centerV: state.board.centerV,
        rotationRad: state.board.rotation,
        rotationDeg: (state.board.rotation * 180) / Math.PI,
      },
      size: {
        width: state.board.width,
        halfWidth: state.board.halfWidth,
      },
      suggestedTs: [
        "board: {",
        `  centerU: ${formatTsNumber(state.board.centerU)},`,
        `  centerV: ${formatTsNumber(state.board.centerV)},`,
        `  width: ${formatTsNumber(state.board.width)},`,
        `  halfWidth: ${formatTsNumber(state.board.halfWidth)},`,
        `  rotation: ${formatTsNumber(state.board.rotation)},`,
        "}",
      ].join("\n"),
      interactionHint:
        "Clic + drag pour deplacer le board. Poignee carree = taille, poignee ronde = rotation.",
    };
  }

  const castle = id === "castle-player1" ? state.castles.player1 : state.castles.player2;
  const slot = id === "castle-player1" ? "player1" : "player2";

  return {
    id,
    label: `Castle ${slot}`,
    elementType: "castle",
    htmlTarget: ".lane-canvas-host > canvas (Pixi)",
    cssTarget: ".lane-canvas-host",
    tsTarget: `apps/web/src/components/LaneCanvas.tsx:createInitialEditorState().castles.${slot}`,
    position: {
      centerU: castle.centerU,
      centerV: castle.centerV,
      rotationRad: castle.rotation,
      rotationDeg: (castle.rotation * 180) / Math.PI,
    },
    size: {
      halfU: castle.halfU,
      halfV: castle.halfV,
      heightScale: castle.heightScale,
    },
    suggestedTs: [
      `${slot}: {`,
      `  centerU: ${formatTsNumber(castle.centerU)},`,
      `  centerV: ${formatTsNumber(castle.centerV)},`,
      `  halfU: ${formatTsNumber(castle.halfU)},`,
      `  halfV: ${formatTsNumber(castle.halfV)},`,
      `  heightScale: ${formatTsNumber(castle.heightScale)},`,
      `  rotation: ${formatTsNumber(castle.rotation)},`,
      "}",
    ].join("\n"),
    interactionHint:
      "Clic + drag pour deplacer le chateau. Poignee carree = taille, poignee ronde = rotation.",
  };
}

export function LaneCanvas({
  snapshots,
  editorMode = false,
  onEditorSelectionChange,
}: LaneCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const snapshotsRef = useRef<SnapshotMsg[]>([]);
  const onEditorSelectionChangeRef = useRef<typeof onEditorSelectionChange>(onEditorSelectionChange);
  const editorModeRef = useRef<boolean>(editorMode);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorStateRef = useRef<EditorState>(createInitialEditorState());
  const selectedIdRef = useRef<EditableId | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

  const emitSelection = (id: EditableId | null) => {
    const cb = onEditorSelectionChangeRef.current;
    if (!cb) return;
    cb(id ? buildSelectionPayload(id, editorStateRef.current) : null);
  };

  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);

  useEffect(() => {
    onEditorSelectionChangeRef.current = onEditorSelectionChange;
  }, [onEditorSelectionChange]);

  useEffect(() => {
    editorModeRef.current = editorMode;
    if (!editorMode) {
      selectedIdRef.current = null;
      dragStateRef.current = null;
      emitSelection(null);
      if (canvasRef.current) {
        canvasRef.current.style.cursor = "grab";
      }
    } else if (canvasRef.current) {
      canvasRef.current.style.cursor = "crosshair";
    }
  }, [editorMode]);

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
    let latestShapes: EditorShape[] = [];
    let cameraDragState:
      | {
          pointerId: number;
          startX: number;
          startY: number;
          originX: number;
          originY: number;
        }
      | null = null;
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
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      return {
        x: (screenX - camera.x) / camera.zoom,
        y: (screenY - camera.y) / camera.zoom,
      };
    };

    const getShapeById = (id: EditableId): EditorShape | null => {
      return latestShapes.find((shape) => shape.id === id) ?? null;
    };

    const getElementCenterUv = (state: EditorState, id: EditableId): UvPoint => {
      if (id === "lane-board") {
        return { u: state.board.centerU, v: state.board.centerV };
      }
      const castle = id === "castle-player1" ? state.castles.player1 : state.castles.player2;
      return { u: castle.centerU, v: castle.centerV };
    };

    const getElementRotation = (state: EditorState, id: EditableId): number => {
      if (id === "lane-board") return state.board.rotation;
      return id === "castle-player1" ? state.castles.player1.rotation : state.castles.player2.rotation;
    };

    const setSelectedId = (id: EditableId | null) => {
      selectedIdRef.current = id;
      emitSelection(id);
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
      canvasRef.current = pixiApp.canvas;
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
        const delta = deltaY;
        const sensitivity = event.ctrlKey ? 0.0023 : 0.0016;
        const nextZoom = clamp(oldZoom * Math.exp(-delta * sensitivity), MIN_ZOOM, MAX_ZOOM);
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

        const canStartCameraPan =
          event.button === 1 || (!editorModeRef.current && event.button === 0) || (editorModeRef.current && event.button === 0 && event.altKey);

        if (canStartCameraPan) {
          event.preventDefault();
          cameraDragState = {
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
        const selectedId = selectedIdRef.current;
        const selectedShape = selectedId ? getShapeById(selectedId) : null;
        const handleHitRadius = HANDLE_HIT_RADIUS_PX / camera.zoom;

        const isOnResizeHandle = Boolean(
          selectedShape &&
            distanceSquared(worldPoint, selectedShape.resizeHandle) <= handleHitRadius * handleHitRadius
        );
        const isOnRotateHandle = Boolean(
          selectedShape &&
            distanceSquared(worldPoint, selectedShape.rotateHandle) <= handleHitRadius * handleHitRadius
        );

        if (selectedId && selectedShape && (isOnResizeHandle || isOnRotateHandle)) {
          const centerUv = getElementCenterUv(editorStateRef.current, selectedId);
          const centerPoint = projectIso(latestLayout, centerUv.u, centerUv.v);
          dragStateRef.current = {
            mode: isOnRotateHandle ? "rotate" : "resize",
            pointerId: event.pointerId,
            id: selectedId,
            startU: pointerUv.u,
            startV: pointerUv.v,
            startAngle: Math.atan2(worldPoint.y - centerPoint.y, worldPoint.x - centerPoint.x),
            origin: cloneEditorState(editorStateRef.current),
          };
          app.canvas.setPointerCapture(event.pointerId);
          setCursor(isOnRotateHandle ? "alias" : "nwse-resize");
          return;
        }

        const hitId = findHitShape(worldPoint, latestShapes);
        if (!hitId) {
          dragStateRef.current = null;
          setSelectedId(null);
          setCursor("crosshair");
          return;
        }

        setSelectedId(hitId);
        dragStateRef.current = {
          mode: "move",
          pointerId: event.pointerId,
          id: hitId,
          startU: pointerUv.u,
          startV: pointerUv.v,
          startAngle: 0,
          origin: cloneEditorState(editorStateRef.current),
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
          setCursor("grab");
          return;
        }

        const worldPoint = pointerToWorldPoint(event);
        if (!worldPoint) return;
        const pointerUv = unprojectIso(latestLayout, worldPoint.x, worldPoint.y);
        const drag = dragStateRef.current;

        if (drag && drag.pointerId === event.pointerId) {
          const nextState = cloneEditorState(drag.origin);
          const du = pointerUv.u - drag.startU;
          const dv = pointerUv.v - drag.startV;

          if (drag.mode === "move") {
            if (drag.id === "lane-board") {
              nextState.board.centerU = clamp(nextState.board.centerU + du, -1.2, 2.2);
              nextState.board.centerV = clamp(nextState.board.centerV + dv, -0.8, 0.8);
            } else {
              const castle = drag.id === "castle-player1" ? nextState.castles.player1 : nextState.castles.player2;
              castle.centerU = clamp(castle.centerU + du, -1.2, 2.2);
              castle.centerV = clamp(castle.centerV + dv, -0.8, 0.8);
            }
          } else {
            const centerUv = getElementCenterUv(nextState, drag.id);
            const currentRotation = getElementRotation(nextState, drag.id);

            if (drag.mode === "resize") {
              const local = uvToLocal(centerUv.u, centerUv.v, pointerUv.u, pointerUv.v, currentRotation);

              if (drag.id === "lane-board") {
                nextState.board.width = clamp(Math.abs(local.u) * 2, BOARD_MIN_WIDTH, BOARD_MAX_WIDTH);
                nextState.board.halfWidth = clamp(Math.abs(local.v), BOARD_MIN_HALF_WIDTH, BOARD_MAX_HALF_WIDTH);
              } else {
                const castle = drag.id === "castle-player1" ? nextState.castles.player1 : nextState.castles.player2;
                castle.halfU = clamp(Math.abs(local.u), CASTLE_MIN_HALF_U, CASTLE_MAX_HALF_U);
                castle.halfV = clamp(Math.abs(local.v), CASTLE_MIN_HALF_V, CASTLE_MAX_HALF_V);
              }
            } else if (drag.mode === "rotate") {
              const centerPoint = projectIso(latestLayout, centerUv.u, centerUv.v);
              const currentAngle = Math.atan2(worldPoint.y - centerPoint.y, worldPoint.x - centerPoint.x);
              const angleDelta = normalizeAngleDelta(currentAngle - drag.startAngle);

              if (drag.id === "lane-board") {
                nextState.board.rotation = drag.origin.board.rotation + angleDelta;
              } else if (drag.id === "castle-player1") {
                nextState.castles.player1.rotation = drag.origin.castles.player1.rotation + angleDelta;
              } else {
                nextState.castles.player2.rotation = drag.origin.castles.player2.rotation + angleDelta;
              }
            }
          }

          editorStateRef.current = nextState;
          emitSelection(selectedIdRef.current);
          setCursor(drag.mode === "resize" ? "nwse-resize" : drag.mode === "rotate" ? "alias" : "grabbing");
          return;
        }

        const selectedId = selectedIdRef.current;
        const selectedShape = selectedId ? getShapeById(selectedId) : null;
        const handleHitRadius = HANDLE_HIT_RADIUS_PX / camera.zoom;

        if (
          selectedShape &&
          distanceSquared(worldPoint, selectedShape.resizeHandle) <= handleHitRadius * handleHitRadius
        ) {
          setCursor("nwse-resize");
          return;
        }

        if (
          selectedShape &&
          distanceSquared(worldPoint, selectedShape.rotateHandle) <= handleHitRadius * handleHitRadius
        ) {
          setCursor("alias");
          return;
        }

        const hitId = findHitShape(worldPoint, latestShapes);
        if (hitId) {
          setCursor("grab");
        } else {
          setCursor("crosshair");
        }
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

        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        dragStateRef.current = null;
        if (app.canvas.hasPointerCapture(event.pointerId)) {
          app.canvas.releasePointerCapture(event.pointerId);
        }
        setCursor(editorModeRef.current ? "crosshair" : "grab");
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

        const state = editorStateRef.current;
        const width = app.screen.width;
        const height = app.screen.height;
        const layout = createIsoLayout(width, height, state.board.halfWidth);
        latestLayout = layout;
        const worldXToUnitSize = width / DESIGN_WIDTH;
        const unitRadius = Math.max(4, 8 * worldXToUnitSize);

        staticG.clear();
        unitsG.clear();
        overlayG.clear();

        drawLaneBoard(staticG, layout, state.board);
        drawIsoCastle(staticG, getCastleGeometry(layout, state.castles.player1), state.castles.player1);
        drawIsoCastle(staticG, getCastleGeometry(layout, state.castles.player2), state.castles.player2);

        const renderTime = Date.now() - INTERPOLATION_DELAY_MS;
        const pair = getInterpPair(snapshotsRef.current, renderTime);

        if (pair) {
          const laneHalfWidth = state.board.width * 0.5;
          const laneOffsetV = clamp(state.board.halfWidth * 0.35, 0.04, 0.28);

          const drawUnits = interpolateUnits(pair.a.units, pair.b.units, pair.alpha)
            .map((u) => {
              const along = -laneHalfWidth + worldToProgress(u.x) * state.board.width;
              const across = u.owner === "player1" ? -laneOffsetV : +laneOffsetV;
              const laneUv = localToUv(state.board.centerU, state.board.centerV, along, across, state.board.rotation);
              const point = projectIso(layout, laneUv.u, laneUv.v);
              return { owner: u.owner, x: point.x, y: point.y };
            })
            .sort((left, right) => left.y - right.y);

          for (const u of drawUnits) {
            const color = u.owner === "player1" ? 0x77b8ff : 0xff9a9a;
            const highlight = u.owner === "player1" ? 0xbddcff : 0xffd1d1;
            const bodyY = u.y - unitRadius * 0.5;

            unitsG
              .ellipse(u.x, u.y + unitRadius * 0.45, unitRadius * 1.1, unitRadius * 0.45)
              .fill({ color: 0x020617, alpha: 0.42 });
            unitsG.circle(u.x, bodyY, unitRadius).fill({ color, alpha: 1 });
            unitsG
              .circle(u.x - unitRadius * 0.28, bodyY - unitRadius * 0.34, unitRadius * 0.28)
              .fill({ color: highlight, alpha: 0.55 });
          }
        }

        if (!editorModeRef.current) {
          latestShapes = [];
          if (!dragStateRef.current && !cameraDragState) {
            setCursor("grab");
          }
        } else {
          latestShapes = getEditorShapes(layout, state);
          const selectedId = selectedIdRef.current;

          for (const shape of latestShapes) {
            const isSelected = selectedId === shape.id;
            drawPolygonStroke(overlayG, shape.polygon, isSelected ? 0xfacc15 : 0x38bdf8, isSelected ? 2.5 : 1.5, 0.9);
            if (isSelected) {
              const size = 6 / camera.zoom;
              const rotateRadius = 5 / camera.zoom;
              overlayG
                .moveTo(shape.center.x, shape.center.y)
                .lineTo(shape.rotateHandle.x, shape.rotateHandle.y)
                .stroke({ color: 0xfacc15, width: 1.5 / camera.zoom, alpha: 0.9 });
              overlayG
                .rect(shape.resizeHandle.x - size, shape.resizeHandle.y - size, size * 2, size * 2)
                .fill({ color: 0xfacc15, alpha: 0.95 })
                .stroke({ color: 0x0f172a, width: 1.2 / camera.zoom, alpha: 1 });
              overlayG
                .circle(shape.rotateHandle.x, shape.rotateHandle.y, rotateRadius)
                .fill({ color: 0xf97316, alpha: 0.96 })
                .stroke({ color: 0x0f172a, width: 1.2 / camera.zoom, alpha: 1 });
            }
          }

          if (!dragStateRef.current && app.canvas.style.cursor === "default") {
            setCursor("crosshair");
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
      canvasRef.current = null;
    };
  }, []);

  return <div ref={hostRef} className="lane-canvas-host" aria-label="Lane canvas" />;
}
