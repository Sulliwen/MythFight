import { DEFAULT_CREATURE_ID, getAttackHitOffsetTicks, getBuildingStats, getCreatureStats, type CreatureId } from "./creatures.js";
import { findPath } from "./pathfinding.js";
import type { Building, PlayerId, SnapshotMessage, Unit, WorldState } from "./types.js";

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const LANE_MIN_X = 0;
export const LANE_MAX_X = 1000;
export const LANE_MIN_Y = 0;
export const LANE_MAX_Y = 300;

// Fixed castle world positions and hitbox
export const CASTLE_PLAYER1_X = 20;
export const CASTLE_PLAYER1_Y = 150;
export const CASTLE_PLAYER2_X = 980;
export const CASTLE_PLAYER2_Y = 150;
export const CASTLE_HITBOX_W = 90;
export const CASTLE_HITBOX_H = 90;
export const CASTLE_ATTACK_RADIUS = 60;

const CASTLE_RECTS = [
  { x: CASTLE_PLAYER1_X - CASTLE_HITBOX_W / 2, y: CASTLE_PLAYER1_Y - CASTLE_HITBOX_H / 2, w: CASTLE_HITBOX_W, h: CASTLE_HITBOX_H },
  { x: CASTLE_PLAYER2_X - CASTLE_HITBOX_W / 2, y: CASTLE_PLAYER2_Y - CASTLE_HITBOX_H / 2, w: CASTLE_HITBOX_W, h: CASTLE_HITBOX_H },
];

export function createWorld(): WorldState {
  return {
    tick: 0,
    nextUnitId: 1,
    nextBuildingId: 1,
    castle: {
      player1: 1000,
      player2: 1000,
    },
    units: [],
    buildings: [],
  };
}

export function resetWorld(world: WorldState): void {
  world.tick = 0;
  world.nextUnitId = 1;
  world.nextBuildingId = 1;
  world.castle.player1 = 1000;
  world.castle.player2 = 1000;
  world.units = [];
  world.buildings = [];
}

type PlaceBuildingResult =
  | { ok: true; building: Building }
  | { ok: false; reason: string };

export function placeBuilding(
  world: WorldState,
  owner: PlayerId,
  x: number,
  y: number,
  creatureId: CreatureId = DEFAULT_CREATURE_ID,
): PlaceBuildingResult {
  const stats = getBuildingStats(creatureId);
  const hw = stats.hitboxWidth / 2;
  const hh = stats.hitboxHeight / 2;

  // Must place on own side
  const midX = (LANE_MIN_X + LANE_MAX_X) / 2;
  if (owner === "player1" && x > midX) {
    return { ok: false, reason: "must_place_on_own_side" };
  }
  if (owner === "player2" && x < midX) {
    return { ok: false, reason: "must_place_on_own_side" };
  }

  // Must be within bounds
  if (x - hw < LANE_MIN_X || x + hw > LANE_MAX_X || y - hh < LANE_MIN_Y || y + hh > LANE_MAX_Y) {
    return { ok: false, reason: "out_of_bounds" };
  }

  // Must not overlap existing buildings (AABB collision)
  for (const existing of world.buildings) {
    const eStats = getBuildingStats(existing.creatureId);
    const eHw = eStats.hitboxWidth / 2;
    const eHh = eStats.hitboxHeight / 2;
    if (
      x - hw < existing.x + eHw &&
      x + hw > existing.x - eHw &&
      y - hh < existing.y + eHh &&
      y + hh > existing.y - eHh
    ) {
      return { ok: false, reason: "overlaps_existing_building" };
    }
  }

  const building: Building = {
    id: `b${world.nextBuildingId++}`,
    owner,
    creatureId,
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    spawnTicksRemaining: stats.spawnIntervalTicks,
    spawnIntervalTicks: stats.spawnIntervalTicks,
  };
  world.buildings.push(building);

  // Recalculate paths for all moving units since the new building may block them
  recalcAllPaths(world);

  return { ok: true, building };
}

function recalcAllPaths(world: WorldState): void {
  const movingUnits = world.units.filter((u) => u.state === "moving");
  console.log(`[recalcAllPaths] ${movingUnits.length} moving units, ${world.buildings.length} buildings`);
  for (const unit of movingUnits) {
    const creatureStats = getCreatureStats(unit.creatureId);
    const targetX = unit.owner === "player1" ? CASTLE_PLAYER2_X : CASTLE_PLAYER1_X;
    const targetY = unit.owner === "player1" ? CASTLE_PLAYER2_Y : CASTLE_PLAYER1_Y;
    const oldWpCount = unit.waypoints.length;
    unit.waypoints = findPath(
      unit.x, unit.y,
      targetX, targetY,
      world.buildings,
      creatureStats.hitboxRadius,
      LANE_MIN_X, LANE_MAX_X, LANE_MIN_Y, LANE_MAX_Y,
    );
    console.log(`  unit ${unit.id}: pos=(${unit.x.toFixed(1)},${unit.y.toFixed(1)}) oldWP=${oldWpCount} newWP=${unit.waypoints.length} wp=${JSON.stringify(unit.waypoints)}`);
  }
}

type SpawnUnitResult =
  | { ok: true; unit: Unit }
  | { ok: false; reason: string };

function spawnUnitFromBuilding(world: WorldState, building: Building): Unit {
  const creatureStats = getCreatureStats(building.creatureId);
  const bStats = getBuildingStats(building.creatureId);

  const targetX = building.owner === "player1" ? CASTLE_PLAYER2_X : CASTLE_PLAYER1_X;
  const targetY = building.owner === "player1" ? CASTLE_PLAYER2_Y : CASTLE_PLAYER1_Y;

  const waypoints = findPath(
    building.x, building.y,
    targetX, targetY,
    world.buildings,
    creatureStats.hitboxRadius,
    LANE_MIN_X, LANE_MAX_X, LANE_MIN_Y, LANE_MAX_Y,
  );

  // Spawn at the edge of the building, toward the first waypoint
  let spawnX = building.x;
  let spawnY = building.y;
  const firstTarget = waypoints.length > 0 ? waypoints[0] : { x: targetX, y: targetY };
  const dx = firstTarget.x - building.x;
  const dy = firstTarget.y - building.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    // Push spawn point to just outside the building edge + unit radius
    const exitX = Math.abs(nx) > 0.001 ? (bStats.hitboxWidth / 2 + creatureStats.hitboxRadius + 1) / Math.abs(nx) : Infinity;
    const exitY = Math.abs(ny) > 0.001 ? (bStats.hitboxHeight / 2 + creatureStats.hitboxRadius + 1) / Math.abs(ny) : Infinity;
    const exitDist = Math.min(exitX, exitY);
    spawnX = building.x + nx * exitDist;
    spawnY = building.y + ny * exitDist;
  }

  const unit: Unit = {
    id: `u${world.nextUnitId++}`,
    creatureId: building.creatureId,
    owner: building.owner,
    x: spawnX,
    y: spawnY,
    vx: 0,
    vy: 0,
    hp: creatureStats.hp,
    state: "moving",
    attackCycleStartTick: 0,
    waypoints,
  };
  console.log(`[spawnUnit] ${unit.id} from building ${building.id} at (${building.x.toFixed(1)},${building.y.toFixed(1)}) -> (${targetX},${targetY}) buildings=${world.buildings.length} wp=${JSON.stringify(waypoints)}`);
  world.units.push(unit);
  return unit;
}

export function spawnUnit(world: WorldState, owner: PlayerId, creatureId: CreatureId = DEFAULT_CREATURE_ID): SpawnUnitResult {
  const building = world.buildings.find((b) => b.owner === owner && b.creatureId === creatureId);
  if (!building) {
    return { ok: false, reason: "no_building" };
  }
  const unit = spawnUnitFromBuilding(world, building);
  return { ok: true, unit };
}

// Resolve circle vs AABB overlap: push the circle out of the rect.
// Returns the separation vector (how much to move the circle), or null if no overlap.
function resolveCircleVsRect(
  cx: number, cy: number, cr: number,
  rx: number, ry: number, rw: number, rh: number,
): { dx: number; dy: number } | null {
  // Find closest point on rect to circle center
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= cr * cr) return null; // no overlap

  const dist = Math.sqrt(distSq);
  if (dist === 0) {
    // Circle center is inside rect — push toward nearest edge
    const toLeft = cx - rx;
    const toRight = rx + rw - cx;
    const toTop = cy - ry;
    const toBottom = ry + rh - cy;
    const minEdge = Math.min(toLeft, toRight, toTop, toBottom);
    if (minEdge === toLeft) return { dx: -(cr + toLeft), dy: 0 };
    if (minEdge === toRight) return { dx: cr + toRight, dy: 0 };
    if (minEdge === toTop) return { dx: 0, dy: -(cr + toTop) };
    return { dx: 0, dy: cr + toBottom };
  }

  const overlap = cr - dist;
  return { dx: (dx / dist) * overlap, dy: (dy / dist) * overlap };
}

export function stepWorld(world: WorldState): void {
  world.tick += 1;

  // Auto-spawn: each building produces units on a timer
  for (const building of world.buildings) {
    building.spawnTicksRemaining -= 1;
    if (building.spawnTicksRemaining <= 0) {
      const stats = getBuildingStats(building.creatureId);
      spawnUnitFromBuilding(world, building);
      building.spawnTicksRemaining = stats.spawnIntervalTicks;
    }
  }

  // Move units
  for (const unit of world.units) {
    const creatureStats = getCreatureStats(unit.creatureId);

    if (unit.state !== "moving") {
      // Attack logic
      const attackCycleTick = (world.tick - unit.attackCycleStartTick) % creatureStats.attackIntervalTicks;
      if (attackCycleTick === getAttackHitOffsetTicks(unit.creatureId)) {
        if (unit.owner === "player1") {
          world.castle.player2 = Math.max(0, world.castle.player2 - creatureStats.attackDamage);
        } else {
          world.castle.player1 = Math.max(0, world.castle.player1 - creatureStats.attackDamage);
        }
      }
      continue;
    }

    // Follow waypoints, then head to enemy castle
    const WAYPOINT_REACH_DIST = 15;
    const speed = creatureStats.moveSpeedPerTick;

    // Advance through reached waypoints
    while (unit.waypoints.length > 0) {
      const wp = unit.waypoints[0];
      const dx = wp.x - unit.x;
      const dy = wp.y - unit.y;
      if (dx * dx + dy * dy <= WAYPOINT_REACH_DIST * WAYPOINT_REACH_DIST) {
        unit.waypoints.shift();
      } else {
        break;
      }
    }

    // Steer toward next waypoint (or castle if no waypoints left)
    const targetX = unit.waypoints.length > 0
      ? unit.waypoints[0].x
      : (unit.owner === "player1" ? CASTLE_PLAYER2_X : CASTLE_PLAYER1_X);
    const targetY = unit.waypoints.length > 0
      ? unit.waypoints[0].y
      : (unit.owner === "player1" ? CASTLE_PLAYER2_Y : CASTLE_PLAYER1_Y);
    const toTargetX = targetX - unit.x;
    const toTargetY = targetY - unit.y;
    const toTargetDist = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);

    if (toTargetDist > 0) {
      unit.vx = (toTargetX / toTargetDist) * speed;
      unit.vy = (toTargetY / toTargetDist) * speed;
    }

    unit.x += unit.vx;
    unit.y += unit.vy;

    // Collision: unit vs buildings (circle vs rect)
    const r = creatureStats.hitboxRadius;
    for (const building of world.buildings) {
      const bStats = getBuildingStats(building.creatureId);
      const bx = building.x - bStats.hitboxWidth / 2;
      const by = building.y - bStats.hitboxHeight / 2;
      const sep = resolveCircleVsRect(unit.x, unit.y, r, bx, by, bStats.hitboxWidth, bStats.hitboxHeight);
      if (sep) {
        unit.x += sep.dx;
        unit.y += sep.dy;
      }
    }

    // Collision: unit vs castles (circle vs rect)
    for (const cr of CASTLE_RECTS) {
      const sep = resolveCircleVsRect(unit.x, unit.y, r, cr.x, cr.y, cr.w, cr.h);
      if (sep) {
        unit.x += sep.dx;
        unit.y += sep.dy;
      }
    }

    // Check if reached enemy castle
    const enemyCastleX = unit.owner === "player1" ? CASTLE_PLAYER2_X : CASTLE_PLAYER1_X;
    const enemyCastleY = unit.owner === "player1" ? CASTLE_PLAYER2_Y : CASTLE_PLAYER1_Y;
    const dxC = unit.x - enemyCastleX;
    const dyC = unit.y - enemyCastleY;
    const distSqC = dxC * dxC + dyC * dyC;

    if (distSqC <= CASTLE_ATTACK_RADIUS * CASTLE_ATTACK_RADIUS) {
      const distC = Math.sqrt(distSqC);
      if (distC > 0) {
        unit.x = enemyCastleX + (dxC / distC) * creatureStats.castleAttackPositionOffset;
        unit.y = enemyCastleY + (dyC / distC) * creatureStats.castleAttackPositionOffset;
      }
      unit.vx = 0;
      unit.vy = 0;
      unit.state = "attacking";
      unit.attackCycleStartTick = world.tick;
    }
  }

  // Collision: unit vs unit (circle vs circle, push apart)
  for (let i = 0; i < world.units.length; i++) {
    const a = world.units[i];
    const ra = getCreatureStats(a.creatureId).hitboxRadius;
    for (let j = i + 1; j < world.units.length; j++) {
      const b = world.units[j];
      const rb = getCreatureStats(b.creatureId).hitboxRadius;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      const minDist = ra + rb;
      if (distSq >= minDist * minDist || distSq === 0) continue;

      const dist = Math.sqrt(distSq);
      const overlap = minDist - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      const half = overlap / 2;
      a.x -= nx * half;
      a.y -= ny * half;
      b.x += nx * half;
      b.y += ny * half;
    }
  }

  // Clamp units within world bounds
  for (const unit of world.units) {
    const r = getCreatureStats(unit.creatureId).hitboxRadius;
    unit.x = Math.max(LANE_MIN_X + r, Math.min(LANE_MAX_X - r, unit.x));
    unit.y = Math.max(LANE_MIN_Y + r, Math.min(LANE_MAX_Y - r, unit.y));
  }
}

export function buildSnapshot(world: WorldState): SnapshotMessage {
  return {
    type: "snapshot",
    tick: world.tick,
    serverTime: Date.now(),
    castle: {
      player1: world.castle.player1,
      player2: world.castle.player2,
    },
    units: world.units.map((u) => {
      const creatureStats = getCreatureStats(u.creatureId);
      const attackIntervalTicks = creatureStats.attackIntervalTicks;
      const attackCycleTick =
        u.state === "attacking" ? (world.tick - u.attackCycleStartTick) % attackIntervalTicks : undefined;
      const attackHitOffsetTicks = u.state === "attacking" ? getAttackHitOffsetTicks(u.creatureId) : undefined;

      return {
        id: u.id,
        creatureId: u.creatureId,
        owner: u.owner,
        x: u.x,
        y: u.y,
        vx: u.vx,
        vy: u.vy,
        hp: u.hp,
        state: u.state,
        attackCycleTick,
        attackIntervalTicks: u.state === "attacking" ? attackIntervalTicks : undefined,
        attackHitOffsetTicks,
        waypoints: u.waypoints.length > 0 ? u.waypoints : undefined,
      };
    }),
    buildings: world.buildings.map((b) => ({
      id: b.id,
      owner: b.owner,
      creatureId: b.creatureId,
      x: b.x,
      y: b.y,
      hp: b.hp,
      maxHp: b.maxHp,
      spawnTicksRemaining: b.spawnTicksRemaining,
      spawnIntervalTicks: b.spawnIntervalTicks,
    })),
  };
}
