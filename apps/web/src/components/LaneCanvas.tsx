import { useEffect, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";
import type { PlayerId, SnapshotMsg, Unit } from "../types";

type LaneCanvasProps = {
  snapshots: SnapshotMsg[];
};

const WORLD_MIN_X = 0;
const WORLD_MAX_X = 1000;
const INTERPOLATION_DELAY_MS = 100;

const DESIGN_WIDTH = 980;
const DESIGN_HEIGHT = 420;
const ASPECT_RATIO = DESIGN_WIDTH / DESIGN_HEIGHT;
const MIN_CANVAS_WIDTH = 260;
const MAX_CANVAS_WIDTH = DESIGN_WIDTH;
const LANE_HALF_WIDTH = 0.18;
const PLAYER_ROW_OFFSET = 0.06;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 2.5;

type CanvasSize = {
  width: number;
  height: number;
};

type IsoPoint = {
  x: number;
  y: number;
};

type IsoLayout = {
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getCanvasSize(host: HTMLDivElement): CanvasSize {
  const width = clamp(Math.round(host.clientWidth), MIN_CANVAS_WIDTH, MAX_CANVAS_WIDTH);
  const height = Math.max(80, Math.round(width / ASPECT_RATIO));
  return { width, height };
}

function worldToProgress(worldX: number): number {
  return clamp((worldX - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X), 0, 1);
}

function normalizeWheelDelta(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * 16;
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * window.innerHeight;
  }
  return event.deltaY;
}

function createIsoLayout(width: number, height: number): IsoLayout {
  const horizontalLimit = (width * 0.84) / (1 + LANE_HALF_WIDTH * 2);
  const verticalLimit = (height * 0.72) / ((1 + LANE_HALF_WIDTH * 2) * 0.5);
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

function drawPolygon(graphics: Graphics, points: IsoPoint[], color: number, alpha = 1): void {
  if (points.length === 0) return;

  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    graphics.lineTo(points[i].x, points[i].y);
  }
  graphics.closePath().fill({ color, alpha });
}

function offsetPoint(point: IsoPoint, dx: number, dy: number): IsoPoint {
  return { x: point.x + dx, y: point.y + dy };
}

function drawLaneBoard(graphics: Graphics, layout: IsoLayout): void {
  const outer = [
    projectIso(layout, 0, -LANE_HALF_WIDTH),
    projectIso(layout, 1, -LANE_HALF_WIDTH),
    projectIso(layout, 1, +LANE_HALF_WIDTH),
    projectIso(layout, 0, +LANE_HALF_WIDTH),
  ];
  drawPolygon(graphics, outer, 0x1e293b, 0.95);

  const stripHalfWidth = LANE_HALF_WIDTH * 0.72;
  const segments = 8;
  for (let i = 0; i < segments; i += 1) {
    const u0 = i / segments;
    const u1 = (i + 1) / segments;
    const color = i % 2 === 0 ? 0x2d3a50 : 0x263246;
    drawPolygon(
      graphics,
      [
        projectIso(layout, u0, -stripHalfWidth),
        projectIso(layout, u1, -stripHalfWidth),
        projectIso(layout, u1, +stripHalfWidth),
        projectIso(layout, u0, +stripHalfWidth),
      ],
      color,
      0.9
    );
  }

  const edgeDark = [
    projectIso(layout, 0, -LANE_HALF_WIDTH),
    projectIso(layout, 1, -LANE_HALF_WIDTH),
    projectIso(layout, 1, -stripHalfWidth),
    projectIso(layout, 0, -stripHalfWidth),
  ];
  const edgeLight = [
    projectIso(layout, 0, +stripHalfWidth),
    projectIso(layout, 1, +stripHalfWidth),
    projectIso(layout, 1, +LANE_HALF_WIDTH),
    projectIso(layout, 0, +LANE_HALF_WIDTH),
  ];
  drawPolygon(graphics, edgeDark, 0x152032, 0.8);
  drawPolygon(graphics, edgeLight, 0x3b4a62, 0.5);
}

function drawIsoCastle(
  graphics: Graphics,
  layout: IsoLayout,
  centerU: number,
  topColor: number,
  leftFaceColor: number,
  rightFaceColor: number
): void {
  const halfU = 0.06;
  const halfV = 0.09;
  const height = Math.max(16, layout.scaleY * 0.42);

  const a = projectIso(layout, centerU - halfU, -halfV);
  const b = projectIso(layout, centerU + halfU, -halfV);
  const c = projectIso(layout, centerU + halfU, +halfV);
  const d = projectIso(layout, centerU - halfU, +halfV);

  const aTop = offsetPoint(a, 0, -height);
  const bTop = offsetPoint(b, 0, -height);
  const cTop = offsetPoint(c, 0, -height);
  const dTop = offsetPoint(d, 0, -height);

  drawPolygon(graphics, [d, c, cTop, dTop], leftFaceColor, 1);
  drawPolygon(graphics, [b, c, cTop, bTop], rightFaceColor, 1);
  drawPolygon(graphics, [aTop, bTop, cTop, dTop], topColor, 1);

  const gateWidth = (c.x - d.x) * 0.26;
  const gateHeight = height * 0.45;
  const gateBottomY = (c.y + d.y) * 0.5 - 2;
  const gateCenterX = (c.x + d.x) * 0.5;
  const gateLeft = gateCenterX - gateWidth * 0.5;
  const gateRight = gateCenterX + gateWidth * 0.5;
  const gateTopY = gateBottomY - gateHeight;
  drawPolygon(
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
  if (snapshots.length === 1) {
    return { a: snapshots[0], b: snapshots[0], alpha: 0 };
  }

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
      result.push({
        owner: b.owner,
        x: a.x + (b.x - a.x) * alpha,
      });
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

export function LaneCanvas({ snapshots }: LaneCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const snapshotsRef = useRef<SnapshotMsg[]>([]);

  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);

  useEffect(() => {
    let destroyed = false;
    let app: Application | null = null;
    let worldContainer: Container | null = null;
    let staticG: Graphics | null = null;
    let unitsG: Graphics | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let removeWheelListener: (() => void) | null = null;
    const host = hostRef.current;
    const camera = {
      zoom: 1,
      x: 0,
      y: 0,
    };

    const applyCamera = () => {
      if (!worldContainer) return;
      worldContainer.scale.set(camera.zoom);
      worldContainer.position.set(camera.x, camera.y);
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

      worldContainer.addChild(staticG);
      worldContainer.addChild(unitsG);
      pixiApp.stage.addChild(worldContainer);
      applyCamera();

      const onWheel = (event: WheelEvent) => {
        if (!app) return;

        event.preventDefault();
        const rect = app.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const oldZoom = camera.zoom;
        const delta = normalizeWheelDelta(event);
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

      app.canvas.addEventListener("wheel", onWheel, { passive: false });
      removeWheelListener = () => {
        app?.canvas.removeEventListener("wheel", onWheel);
      };

      resizeObserver = new ResizeObserver(() => {
        if (!app || !host) return;

        const nextSize = getCanvasSize(host);
        app.renderer.resize(nextSize.width, nextSize.height);
      });

      resizeObserver.observe(host);

      pixiApp.ticker.add(() => {
        if (!staticG || !unitsG || !app) return;

        const width = app.screen.width;
        const height = app.screen.height;
        const layout = createIsoLayout(width, height);
        const worldXToUnitSize = width / DESIGN_WIDTH;
        const unitRadius = Math.max(4, 8 * worldXToUnitSize);

        staticG.clear();
        unitsG.clear();

        drawLaneBoard(staticG, layout);
        drawIsoCastle(staticG, layout, -0.08, 0x5ea7ff, 0x2f69b2, 0x4179bd);
        drawIsoCastle(staticG, layout, 1.08, 0xff8f8f, 0xb84848, 0xc55a5a);

        const renderTime = Date.now() - INTERPOLATION_DELAY_MS;
        const pair = getInterpPair(snapshotsRef.current, renderTime);

        if (!pair) return;

        const drawUnits = interpolateUnits(pair.a.units, pair.b.units, pair.alpha)
          .map((u) => {
            const laneV = u.owner === "player1" ? -PLAYER_ROW_OFFSET : +PLAYER_ROW_OFFSET;
            const point = projectIso(layout, worldToProgress(u.x), laneV);
            return {
              owner: u.owner,
              x: point.x,
              y: point.y,
            };
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

        // Keeps the canvas vertically centered if parent grows taller than content.
        pixiApp.canvas.style.display = "block";
        pixiApp.canvas.style.width = `${width}px`;
        pixiApp.canvas.style.height = `${height}px`;
        pixiApp.canvas.style.margin = "0 auto";
      });
    };

    void init();

    return () => {
      destroyed = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (removeWheelListener) {
        removeWheelListener();
      }
      if (app) {
        app.destroy(true, { children: true });
      }
      if (host) {
        host.innerHTML = "";
      }
    };
  }, []);

  return <div ref={hostRef} className="lane-canvas-host" aria-label="Lane canvas" />;
}
