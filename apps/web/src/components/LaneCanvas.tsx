import { useEffect, useRef } from "react";
import { Application, Graphics } from "pixi.js";
import type { PlayerId, SnapshotMsg, Unit } from "../types";

type LaneCanvasProps = {
  snapshots: SnapshotMsg[];
};

const WORLD_MIN_X = 0;
const WORLD_MAX_X = 1000;
const INTERPOLATION_DELAY_MS = 100;

const CANVAS_WIDTH = 980;
const CANVAS_HEIGHT = 220;
const LANE_LEFT = 80;
const LANE_RIGHT = 900;
const LANE_WIDTH = LANE_RIGHT - LANE_LEFT;
const LANE_Y = 100;
const LANE_HEIGHT = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function worldToScreenX(worldX: number): number {
  const t = (worldX - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X);
  return LANE_LEFT + clamp(t, 0, 1) * LANE_WIDTH;
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
    const host = hostRef.current;

    const init = async () => {
      if (!host) return;

      const pixiApp = new Application();
      await pixiApp.init({
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
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

      pixiApp.ticker.add(() => {
        if (!staticG || !unitsG) return;

        staticG.clear();
        unitsG.clear();

        // Lane
        staticG.rect(LANE_LEFT, LANE_Y, LANE_WIDTH, LANE_HEIGHT).fill({ color: 0x334155 });

        // Castles
        staticG.rect(20, 70, 40, 80).fill({ color: 0x3b82f6 }); // player1
        staticG.rect(920, 70, 40, 80).fill({ color: 0xef4444 }); // player2

        const renderTime = Date.now() - INTERPOLATION_DELAY_MS;
        const pair = getInterpPair(snapshotsRef.current, renderTime);

        if (!pair) return;

        const drawUnits = interpolateUnits(pair.a.units, pair.b.units, pair.alpha);

        for (const u of drawUnits) {
          const x = worldToScreenX(u.x);
          const y = u.owner === "player1" ? LANE_Y + 6 : LANE_Y + 14;
          const color = u.owner === "player1" ? 0x60a5fa : 0xf87171;

          unitsG.circle(x, y, 7).fill({ color });
        }
      });
    };

    init();

    return () => {
      destroyed = true;
      if (app) {
        app.destroy(true, { children: true });
      }
      if (host) {
        host.innerHTML = "";
      }
    };
  }, []);

  return <div ref={hostRef} style={{ marginTop: 16, borderRadius: 8, overflow: "hidden" }} />;
}
