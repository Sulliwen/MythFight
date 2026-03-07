import { clamp } from "./math";
import type { InterpolatedUnit, InterpolationPair } from "./types";
import type { SnapshotMsg, Unit } from "../../types";

export function getInterpolationPair(snapshots: SnapshotMsg[], renderTime: number): InterpolationPair | null {
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

export function interpolateUnits(aUnits: Unit[], bUnits: Unit[], alpha: number): InterpolatedUnit[] {
  const aMap = new Map(aUnits.map((unit) => [unit.id, unit]));
  const bMap = new Map(bUnits.map((unit) => [unit.id, unit]));
  const ids = new Set([...aMap.keys(), ...bMap.keys()]);
  const result: InterpolatedUnit[] = [];

  for (const id of ids) {
    const a = aMap.get(id);
    const b = bMap.get(id);

    if (a && b) {
      result.push({
        id,
        owner: b.owner,
        x: a.x + (b.x - a.x) * alpha,
        vx: a.vx + (b.vx - a.vx) * alpha,
        state: alpha < 0.5 ? a.state : b.state,
        attackCycleTick: alpha < 0.5 ? a.attackCycleTick : b.attackCycleTick,
      });
      continue;
    }

    if (b) {
      result.push({ id, owner: b.owner, x: b.x, vx: b.vx, state: b.state, attackCycleTick: b.attackCycleTick });
      continue;
    }

    if (a) {
      result.push({ id, owner: a.owner, x: a.x, vx: a.vx, state: a.state, attackCycleTick: a.attackCycleTick });
    }
  }

  return result;
}
