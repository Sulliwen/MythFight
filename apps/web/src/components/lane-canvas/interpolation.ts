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
      const interpVx = a.vx + (b.vx - a.vx) * alpha;

      // Debug: detect vx sign difference between snapshots (facing trembling)
      if (
        Math.abs(a.vx) > 0.001 &&
        Math.abs(b.vx) > 0.001 &&
        (a.vx > 0) !== (b.vx > 0)
      ) {
        const key = `_flipLog_${id}`;
        const now = performance.now();
        const last = (window as any)[key] as number | undefined;
        if (!last || now - last > 500) {
          console.warn(
            `[INTERP-VX-FLIP] ${id} a.vx=${a.vx.toFixed(3)} b.vx=${b.vx.toFixed(3)} alpha=${alpha.toFixed(3)} ` +
            `interpVx=${interpVx.toFixed(3)} a.x=${a.x.toFixed(1)} b.x=${b.x.toFixed(1)} ` +
            `a.state=${a.state} b.state=${b.state}`,
          );
          (window as any)[key] = now;
        }
      }

      result.push({
        id,
        creatureId: b.creatureId,
        owner: b.owner,
        x: a.x + (b.x - a.x) * alpha,
        y: a.y + (b.y - a.y) * alpha,
        vx: interpVx,
        hp: alpha < 0.5 ? a.hp : b.hp,
        maxHp: b.maxHp,
        state: alpha < 0.5 ? a.state : b.state,
        attackCycleTick: alpha < 0.5 ? a.attackCycleTick : b.attackCycleTick,
        attackIntervalTicks: alpha < 0.5 ? a.attackIntervalTicks : b.attackIntervalTicks,
        attackHitOffsetTicks: alpha < 0.5 ? a.attackHitOffsetTicks : b.attackHitOffsetTicks,
        attackTargetId: alpha < 0.5 ? a.attackTargetId : b.attackTargetId,
      });
      continue;
    }

    if (b) {
      result.push({
        id,
        creatureId: b.creatureId,
        owner: b.owner,
        x: b.x,
        y: b.y,
        vx: b.vx,
        hp: b.hp,
        maxHp: b.maxHp,
        state: b.state,
        attackCycleTick: b.attackCycleTick,
        attackIntervalTicks: b.attackIntervalTicks,
        attackHitOffsetTicks: b.attackHitOffsetTicks,
        attackTargetId: b.attackTargetId,
      });
      continue;
    }

    if (a) {
      result.push({
        id,
        creatureId: a.creatureId,
        owner: a.owner,
        x: a.x,
        y: a.y,
        vx: a.vx,
        hp: a.hp,
        maxHp: a.maxHp,
        state: a.state,
        attackCycleTick: a.attackCycleTick,
        attackIntervalTicks: a.attackIntervalTicks,
        attackHitOffsetTicks: a.attackHitOffsetTicks,
        attackTargetId: a.attackTargetId,
      });
    }
  }

  return result;
}
