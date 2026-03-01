import { useEffect, useRef } from "react";
import { Application, Graphics } from "pixi.js";
import type { PlayerId, SnapshotMsg, Unit } from "../types";

type LaneCanvasProps = {
  snapshots: SnapshotMsg[];
};

const WORLD_MIN_X = 0;
const WORLD_MAX_X = 1000;
const INTERPOLATION_DELAY_MS = 100;

const DESIGN_WIDTH = 980;
const DESIGN_HEIGHT = 220;
const ASPECT_RATIO = DESIGN_WIDTH / DESIGN_HEIGHT;
const MIN_CANVAS_WIDTH = 260;
const MAX_CANVAS_WIDTH = DESIGN_WIDTH;

type CanvasSize = {
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getCanvasSize(host: HTMLDivElement): CanvasSize {
  const width = clamp(Math.round(host.clientWidth), MIN_CANVAS_WIDTH, MAX_CANVAS_WIDTH);
  const height = Math.max(80, Math.round(width / ASPECT_RATIO));
  return { width, height };
}

function worldToScreenX(worldX: number, laneLeft: number, laneWidth: number): number {
  const t = (worldX - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X);
  return laneLeft + clamp(t, 0, 1) * laneWidth;
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
    let staticG: Graphics | null = null;
    let unitsG: Graphics | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const host = hostRef.current;

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

      staticG = new Graphics();
      unitsG = new Graphics();

      pixiApp.stage.addChild(staticG);
      pixiApp.stage.addChild(unitsG);

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
        const scale = width / DESIGN_WIDTH;

        const laneLeft = 80 * scale;
        const laneWidth = 820 * scale;
        const laneY = 100 * scale;
        const laneHeight = 20 * scale;

        const castleTop = 70 * scale;
        const castleWidth = 40 * scale;
        const castleHeight = 80 * scale;
        const p1CastleLeft = 20 * scale;
        const p2CastleLeft = width - 20 * scale - castleWidth;

        staticG.clear();
        unitsG.clear();

        staticG.rect(laneLeft, laneY, laneWidth, laneHeight).fill({ color: 0x334155 });
        staticG.rect(p1CastleLeft, castleTop, castleWidth, castleHeight).fill({ color: 0x3b82f6 });
        staticG.rect(p2CastleLeft, castleTop, castleWidth, castleHeight).fill({ color: 0xef4444 });

        const renderTime = Date.now() - INTERPOLATION_DELAY_MS;
        const pair = getInterpPair(snapshotsRef.current, renderTime);

        if (!pair) return;

        const drawUnits = interpolateUnits(pair.a.units, pair.b.units, pair.alpha);
        const unitRadius = Math.max(3, 7 * scale);
        const playerOneY = laneY + 6 * scale;
        const playerTwoY = laneY + 14 * scale;

        for (const u of drawUnits) {
          const x = worldToScreenX(u.x, laneLeft, laneWidth);
          const y = u.owner === "player1" ? playerOneY : playerTwoY;
          const color = u.owner === "player1" ? 0x60a5fa : 0xf87171;

          unitsG.circle(x, y, unitRadius).fill({ color });
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
