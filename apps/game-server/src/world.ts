import { resolveDamage } from "./combat.js";
import { CREATURE_IDS, CREATURE_TO_BUILDING, DEFAULT_CREATURE_ID, getAttackHitOffsetTicks, getBuildingStats, getCreatureStats, type BuildingId, type CreatureId } from "./creatures.js";
import { findPath, findPathDetailed, type ObstacleRect } from "./pathfinding.js";
import type { Building, PlayerId, SnapshotMessage, Unit, WorldState } from "./types.js";

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const LANE_MIN_X = 0;
export const LANE_MAX_X = 1000;
export const LANE_MIN_Y = 0;
export const LANE_MAX_Y = 560;

// Castle visual position (fixed — never changes)
export const CASTLE_PLAYER1_X = 120;
export const CASTLE_PLAYER2_X = 880;
export const CASTLE_VISUAL_CENTER_Y = 280;
export const CASTLE_VISUAL_H = 100;

// Castle hitbox: offsets relative to the visual rect
export const CASTLE_HITBOX_W = 100;
export const CASTLE_HITBOX_H = 60;
export const CASTLE_HITBOX_BOTTOM_INSET =12; // how far up from visual bottom the hitbox bottom sits

function buildingRect(b: Building): { x: number; y: number; w: number; h: number } {
  const s = getBuildingStats(b.buildingId);
  return { x: b.x - s.hitboxWidth / 2, y: b.y - s.hitboxHeight / 2, w: s.hitboxWidth, h: s.hitboxHeight };
}

function getEnemyCastle(world: WorldState, owner: PlayerId): Building {
  return world.buildings.find((b) => b.buildingId === "castle" && b.owner !== owner)!;
}

function getOwnCastle(world: WorldState, owner: PlayerId): Building {
  return world.buildings.find((b) => b.buildingId === "castle" && b.owner === owner)!;
}

function castleObstacleRects(world: WorldState): { x: number; y: number; w: number; h: number }[] {
  return world.buildings.filter((b) => b.buildingId === "castle").map(buildingRect);
}

export function createWorld(): WorldState {
  const castleStats = getBuildingStats("castle");
  const castleHitboxCenterY = CASTLE_VISUAL_CENTER_Y + CASTLE_VISUAL_H / 2 - CASTLE_HITBOX_BOTTOM_INSET - castleStats.hitboxHeight / 2;
  return {
    tick: 0,
    nextUnitId: 1,
    nextBuildingId: 1,
    units: [],
    buildings: [
      { id: "castle-p1", owner: "player1", buildingId: "castle", x: CASTLE_PLAYER1_X, y: castleHitboxCenterY, hp: castleStats.hp, maxHp: castleStats.hp, spawnTicksRemaining: 0, spawnIntervalTicks: 0, paused: false },
      { id: "castle-p2", owner: "player2", buildingId: "castle", x: CASTLE_PLAYER2_X, y: castleHitboxCenterY, hp: castleStats.hp, maxHp: castleStats.hp, spawnTicksRemaining: 0, spawnIntervalTicks: 0, paused: false },
    ],
  };
}

export function resetWorld(world: WorldState): void {
  const castleStats = getBuildingStats("castle");
  const castleHitboxCenterY = CASTLE_VISUAL_CENTER_Y + CASTLE_VISUAL_H / 2 - CASTLE_HITBOX_BOTTOM_INSET - castleStats.hitboxHeight / 2;
  world.tick = 0;
  world.nextUnitId = 1;
  world.nextBuildingId = 1;
  world.units = [];
  world.buildings = [
    { id: "castle-p1", owner: "player1", buildingId: "castle", x: CASTLE_PLAYER1_X, y: castleHitboxCenterY, hp: castleStats.hp, maxHp: castleStats.hp, spawnTicksRemaining: 0, spawnIntervalTicks: 0, paused: false },
    { id: "castle-p2", owner: "player2", buildingId: "castle", x: CASTLE_PLAYER2_X, y: castleHitboxCenterY, hp: castleStats.hp, maxHp: castleStats.hp, spawnTicksRemaining: 0, spawnIntervalTicks: 0, paused: false },
  ];
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
  const buildingId: BuildingId = CREATURE_TO_BUILDING[creatureId];
  const stats = getBuildingStats(buildingId);
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
    const eStats = getBuildingStats(existing.buildingId);
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
    buildingId,
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    spawnTicksRemaining: stats.spawnIntervalTicks ?? 0,
    spawnIntervalTicks: stats.spawnIntervalTicks ?? 0,
    paused: false,
  };
  world.buildings.push(building);

  // Recalculate paths for all moving units since the new building may block them
  recalcAllPaths(world);

  return { ok: true, building };
}

function recalcAllPaths(world: WorldState): void {
  const movingUnits = world.units.filter((u) => u.state === "moving");
  for (const unit of movingUnits) {
    const creatureStats = getCreatureStats(unit.creatureId);
    const enemyCastle = getEnemyCastle(world, unit.owner);
    const ecRect = buildingRect(enemyCastle);
    const nearestEdge = closestPointOnRect(unit.x, unit.y, ecRect.x, ecRect.y, ecRect.w, ecRect.h);
    const targetX = nearestEdge.x;
    const targetY = nearestEdge.y;
    const oldWpCount = unit.waypoints.length;
    unit.waypoints = findPath(
      unit.x, unit.y,
      targetX, targetY,
      world.buildings,
      castleObstacleRects(world),
      creatureStats.hitboxRadius,
      LANE_MIN_X, LANE_MAX_X, LANE_MIN_Y, LANE_MAX_Y,
    );
    const approachMargin = creatureStats.attackRange + creatureStats.hitboxRadius + 40;
    const approachMarginSq = approachMargin * approachMargin;
    while (unit.waypoints.length > 1) {
      const last = unit.waypoints[unit.waypoints.length - 1];
      const dSq = distSqToRect(last.x, last.y, ecRect.x, ecRect.y, ecRect.w, ecRect.h);
      if (dSq < approachMarginSq) {
        unit.waypoints.pop();
      } else {
        break;
      }
    }
  }
}

type SpawnUnitResult =
  | { ok: true; unit: Unit }
  | { ok: false; reason: string };

function spawnUnitFromBuilding(world: WorldState, building: Building): Unit {
  const spawnCreatureId = getBuildingStats(building.buildingId).spawnsCreature!;
  const creatureStats = getCreatureStats(spawnCreatureId);
  const bStats = getBuildingStats(building.buildingId);

  // Target the nearest edge of the enemy castle, not its center
  const enemyCastle = getEnemyCastle(world, building.owner);
  const ecRect = buildingRect(enemyCastle);
  const nearestEdge = closestPointOnRect(building.x, building.y, ecRect.x, ecRect.y, ecRect.w, ecRect.h);
  const targetX = nearestEdge.x;
  const targetY = nearestEdge.y;

  const castleObstacles = castleObstacleRects(world);
  const waypoints = findPath(
    building.x, building.y,
    targetX, targetY,
    world.buildings,
    castleObstacles,
    creatureStats.hitboxRadius,
    LANE_MIN_X, LANE_MAX_X, LANE_MIN_Y, LANE_MAX_Y,
  );

  // Remove waypoints that are too close to the enemy castle — let dynamic
  // closestPointOnRect steering handle the final approach so units spread out
  const approachMargin = creatureStats.attackRange + creatureStats.hitboxRadius + 40;
  const approachMarginSq = approachMargin * approachMargin;
  while (waypoints.length > 1) {
    const last = waypoints[waypoints.length - 1];
    const dSq = distSqToRect(last.x, last.y, ecRect.x, ecRect.y, ecRect.w, ecRect.h);
    if (dSq < approachMarginSq) {
      waypoints.pop();
    } else {
      break;
    }
  }

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
    creatureId: spawnCreatureId,
    owner: building.owner,
    x: spawnX,
    y: spawnY,
    vx: 0,
    vy: 0,
    hp: creatureStats.hp,
    maxHp: creatureStats.hp,
    state: "moving",
    flying: false,
    attackCycleStartTick: 0,
    waypoints,
    canFly: creatureStats.canFly,
  };
  world.units.push(unit);
  return unit;
}

function spawnUnitFromCastle(world: WorldState, owner: PlayerId, creatureId: CreatureId): Unit {
  const creatureStats = getCreatureStats(creatureId);

  const ownCastle = getOwnCastle(world, owner);
  const castleRect = buildingRect(ownCastle);
  const castleCenterX = castleRect.x + castleRect.w / 2;
  const castleCenterY = castleRect.y + castleRect.h / 2;

  const enemyCastle = getEnemyCastle(world, owner);
  const ecRect = buildingRect(enemyCastle);
  const nearestEdge = closestPointOnRect(castleCenterX, castleCenterY, ecRect.x, ecRect.y, ecRect.w, ecRect.h);
  const targetX = nearestEdge.x;
  const targetY = nearestEdge.y;

  const castleObstacles = castleObstacleRects(world);
  const waypoints = findPath(
    castleCenterX, castleCenterY,
    targetX, targetY,
    world.buildings,
    castleObstacles,
    creatureStats.hitboxRadius,
    LANE_MIN_X, LANE_MAX_X, LANE_MIN_Y, LANE_MAX_Y,
  );

  const approachMargin = creatureStats.attackRange + creatureStats.hitboxRadius + 40;
  const approachMarginSq = approachMargin * approachMargin;
  while (waypoints.length > 1) {
    const last = waypoints[waypoints.length - 1];
    const dSq = distSqToRect(last.x, last.y, ecRect.x, ecRect.y, ecRect.w, ecRect.h);
    if (dSq < approachMarginSq) {
      waypoints.pop();
    } else {
      break;
    }
  }

  // Spawn at the edge of the castle, toward the first waypoint
  let spawnX = castleCenterX;
  let spawnY = castleCenterY;
  const firstTarget = waypoints.length > 0 ? waypoints[0] : { x: targetX, y: targetY };
  const dx = firstTarget.x - castleCenterX;
  const dy = firstTarget.y - castleCenterY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    const exitX = Math.abs(nx) > 0.001 ? (castleRect.w / 2 + creatureStats.hitboxRadius + 1) / Math.abs(nx) : Infinity;
    const exitY = Math.abs(ny) > 0.001 ? (castleRect.h / 2 + creatureStats.hitboxRadius + 1) / Math.abs(ny) : Infinity;
    const exitDist = Math.min(exitX, exitY);
    spawnX = castleCenterX + nx * exitDist;
    spawnY = castleCenterY + ny * exitDist;
  }

  const unit: Unit = {
    id: `u${world.nextUnitId++}`,
    creatureId,
    owner,
    x: spawnX,
    y: spawnY,
    vx: 0,
    vy: 0,
    hp: creatureStats.hp,
    maxHp: creatureStats.hp,
    state: "moving",
    flying: false,
    attackCycleStartTick: 0,
    waypoints,
    canFly: creatureStats.canFly,
  };
  world.units.push(unit);
  return unit;
}

export function spawnUnit(world: WorldState, owner: PlayerId, creatureId: CreatureId = DEFAULT_CREATURE_ID): SpawnUnitResult {
  const unit = spawnUnitFromCastle(world, owner, creatureId);
  return { ok: true, unit };
}

type ToggleProductionResult =
  | { ok: true }
  | { ok: false; reason: string };

export function toggleBuildingProduction(world: WorldState, owner: PlayerId, buildingId: string): ToggleProductionResult {
  const building = world.buildings.find((b) => b.id === buildingId && b.owner === owner);
  if (!building) return { ok: false, reason: "building_not_found" };
  building.paused = !building.paused;
  return { ok: true };
}

type ForceSpawnResult =
  | { ok: true; unit: Unit }
  | { ok: false; reason: string };

export function forceSpawnFromBuilding(world: WorldState, owner: PlayerId, buildingId: string): ForceSpawnResult {
  const building = world.buildings.find((b) => b.id === buildingId && b.owner === owner);
  if (!building) return { ok: false, reason: "building_not_found" };
  const stats = getBuildingStats(building.buildingId);
  const unit = spawnUnitFromBuilding(world, building);
  building.spawnTicksRemaining = stats.spawnIntervalTicks ?? 0;
  return { ok: true, unit };
}

type ToggleFlightResult =
  | { ok: true }
  | { ok: false; reason: string };

export function toggleFlight(world: WorldState, owner: PlayerId, unitId: string): ToggleFlightResult {
  const unit = world.units.find((u) => u.id === unitId && u.owner === owner);
  if (!unit) return { ok: false, reason: "unit_not_found" };
  if (!unit.canFly) return { ok: false, reason: "unit_cannot_fly" };
  unit.flying = !unit.flying;
  // When toggling flight, drop current combat target — re-acquire next tick
  if (unit.attackTargetId) {
    unit.attackTargetId = undefined;
    if (unit.state === "attacking_unit") {
      unit.state = "moving";
      unit.waypoints = [];
    }
  }
  return { ok: true };
}

// Closest point on a rect edge to a given point
function closestPointOnRect(
  px: number, py: number,
  rx: number, ry: number, rw: number, rh: number,
): { x: number; y: number } {
  return {
    x: Math.max(rx, Math.min(px, rx + rw)),
    y: Math.max(ry, Math.min(py, ry + rh)),
  };
}

// Distance squared from a point to the closest point on a rect
function distSqToRect(
  px: number, py: number,
  rx: number, ry: number, rw: number, rh: number,
): number {
  const cp = closestPointOnRect(px, py, rx, ry, rw, rh);
  const dx = px - cp.x;
  const dy = py - cp.y;
  return dx * dx + dy * dy;
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

type MoveDebugInfo = {
  mode: "chase" | "castle";
  fromX: number;
  fromY: number;
  intendedX: number;
  intendedY: number;
  targetX: number;
  targetY: number;
  waypointCount: number;
};

function formatPoint(x: number, y: number): string {
  return `(${x.toFixed(1)},${y.toFixed(1)})`;
}

function buildStuckDebugContext(world: WorldState, unit: Unit, moveDebug?: MoveDebugInfo): string {
  const stats = getCreatureStats(unit.creatureId);
  const actualDx = unit.x - (moveDebug?.fromX ?? unit.x);
  const actualDy = unit.y - (moveDebug?.fromY ?? unit.y);
  const intendedDx = moveDebug ? moveDebug.intendedX - moveDebug.fromX : unit.vx;
  const intendedDy = moveDebug ? moveDebug.intendedY - moveDebug.fromY : unit.vy;
  const correctionDx = moveDebug ? unit.x - moveDebug.intendedX : 0;
  const correctionDy = moveDebug ? unit.y - moveDebug.intendedY : 0;
  const startTargetDist = moveDebug
    ? Math.sqrt((moveDebug.targetX - moveDebug.fromX) ** 2 + (moveDebug.targetY - moveDebug.fromY) ** 2)
    : 0;

  let closeUnits = "none";
  const nearbyUnits = world.units
    .filter((other) => other.id !== unit.id)
    .map((other) => {
      const otherStats = getCreatureStats(other.creatureId);
      const dx = other.x - unit.x;
      const dy = other.y - unit.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = stats.hitboxRadius + otherStats.hitboxRadius;
      return { other, dist, minDist };
    })
    .filter(({ dist, minDist }) => dist <= minDist + 8)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);
  if (nearbyUnits.length > 0) {
    closeUnits = nearbyUnits
      .map(({ other, dist, minDist }) => `${other.id}:${other.state}:${dist.toFixed(1)}/${minDist.toFixed(1)}`)
      .join(",");
  }

  let rectCollisions = "none";
  const rectOverlaps: string[] = [];
  for (const building of world.buildings) {
    const buildingStats = getBuildingStats(building.buildingId);
    const sep = resolveCircleVsRect(
      unit.x,
      unit.y,
      stats.hitboxRadius,
      building.x - buildingStats.hitboxWidth / 2,
      building.y - buildingStats.hitboxHeight / 2,
      buildingStats.hitboxWidth,
      buildingStats.hitboxHeight,
    );
    if (sep) {
      rectOverlaps.push(`building:${building.id}:${sep.dx.toFixed(1)}/${sep.dy.toFixed(1)}`);
    }
  }
  if (rectOverlaps.length > 0) {
    rectCollisions = rectOverlaps.join(",");
  }

  const targetDist = moveDebug
    ? Math.sqrt((moveDebug.targetX - unit.x) ** 2 + (moveDebug.targetY - unit.y) ** 2)
    : 0;
  const progressToTarget = startTargetDist - targetDist;

  return (
    `mode=${moveDebug?.mode ?? "unknown"} wp=${moveDebug?.waypointCount ?? unit.waypoints.length} ` +
    `target=${moveDebug ? formatPoint(moveDebug.targetX, moveDebug.targetY) : "n/a"} targetDist=${targetDist.toFixed(1)} progress=${progressToTarget.toFixed(3)} ` +
    `intendedMove=${formatPoint(intendedDx, intendedDy)} actualMove=${formatPoint(actualDx, actualDy)} ` +
    `correction=${formatPoint(correctionDx, correctionDy)} closeUnits=${closeUnits} rectCollisions=${rectCollisions}`
  );
}

type EscapePlan = {
  waypoint: { x: number; y: number };
  followUpWaypoints: { x: number; y: number }[];
  status: "ok" | "escape_only";
  score: number;
  startOpenNeighbors: number;
};

function overlapsStaticObstacles(world: WorldState, x: number, y: number, radius: number): boolean {
  for (const building of world.buildings) {
    const stats = getBuildingStats(building.buildingId);
    const sep = resolveCircleVsRect(
      x,
      y,
      radius,
      building.x - stats.hitboxWidth / 2,
      building.y - stats.hitboxHeight / 2,
      stats.hitboxWidth,
      stats.hitboxHeight,
    );
    if (sep) return true;
  }

  return false;
}

function overlapsUnits(world: WorldState, unit: Unit, x: number, y: number, onlyAttackingUnits: boolean): boolean {
  const radius = getCreatureStats(unit.creatureId).hitboxRadius;
  for (const other of world.units) {
    if (other.id === unit.id) continue;
    if (onlyAttackingUnits && other.state !== "attacking" && other.state !== "attacking_unit") continue;
    const otherRadius = getCreatureStats(other.creatureId).hitboxRadius;
    const dx = other.x - x;
    const dy = other.y - y;
    if (dx * dx + dy * dy < (radius + otherRadius) * (radius + otherRadius)) {
      return true;
    }
  }
  return false;
}

function buildEscapePlan(
  world: WorldState,
  unit: Unit,
  targetX: number,
  targetY: number,
  extraObstacles: ObstacleRect[],
): EscapePlan | null {
  const radius = getCreatureStats(unit.creatureId).hitboxRadius;
  const sampleRadii = [radius * 2.5, radius * 4, radius * 5.5];
  const angleSteps = 16;
  let bestPlan: EscapePlan | null = null;

  for (const sampleRadius of sampleRadii) {
    for (let i = 0; i < angleSteps; i++) {
      const angle = (i / angleSteps) * Math.PI * 2;
      const candidateX = unit.x + Math.cos(angle) * sampleRadius;
      const candidateY = unit.y + Math.sin(angle) * sampleRadius;

      if (candidateX < LANE_MIN_X + radius || candidateX > LANE_MAX_X - radius || candidateY < LANE_MIN_Y + radius || candidateY > LANE_MAX_Y - radius) {
        continue;
      }
      if (overlapsStaticObstacles(world, candidateX, candidateY, radius)) continue;
      if (overlapsUnits(world, unit, candidateX, candidateY, true)) continue;

      const pathResult = findPathDetailed(
        candidateX, candidateY,
        targetX, targetY,
        world.buildings,
        extraObstacles,
        radius,
        LANE_MIN_X, LANE_MAX_X, LANE_MIN_Y, LANE_MAX_Y,
        { failureMode: "empty_on_failure", logFailure: false },
      );

      if (pathResult.startOpenNeighbors === 0) continue;

      const dxFromUnit = candidateX - unit.x;
      const dyFromUnit = candidateY - unit.y;
      const localMoveDist = Math.sqrt(dxFromUnit * dxFromUnit + dyFromUnit * dyFromUnit);
      const dxToTarget = targetX - candidateX;
      const dyToTarget = targetY - candidateY;
      const targetDist = Math.sqrt(dxToTarget * dxToTarget + dyToTarget * dyToTarget);
      const score = targetDist + localMoveDist * 0.35 - pathResult.startOpenNeighbors * 20 + (pathResult.status === "ok" ? -400 : 0);

      const plan: EscapePlan = {
        waypoint: { x: candidateX, y: candidateY },
        followUpWaypoints: pathResult.status === "ok" ? pathResult.waypoints : [],
        status: pathResult.status === "ok" ? "ok" : "escape_only",
        score,
        startOpenNeighbors: pathResult.startOpenNeighbors,
      };

      if (!bestPlan || plan.score < bestPlan.score) {
        bestPlan = plan;
      }
    }
  }

  return bestPlan;
}

function findChaseApproachPoint(
  world: WorldState,
  unit: Unit,
  target: Unit,
  extraObstacles: ObstacleRect[],
): { x: number; y: number } {
  const unitStats = getCreatureStats(unit.creatureId);
  const targetStats = getCreatureStats(target.creatureId);
  const attackDist = unitStats.hitboxRadius + unitStats.attackRange + targetStats.hitboxRadius;
  const sampleRadius = Math.max(attackDist - 1, unitStats.hitboxRadius + targetStats.hitboxRadius + 1);
  const samples = 16;
  let bestPoint: { x: number; y: number } | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    const candidateX = target.x + Math.cos(angle) * sampleRadius;
    const candidateY = target.y + Math.sin(angle) * sampleRadius;

    if (
      candidateX < LANE_MIN_X + unitStats.hitboxRadius ||
      candidateX > LANE_MAX_X - unitStats.hitboxRadius ||
      candidateY < LANE_MIN_Y + unitStats.hitboxRadius ||
      candidateY > LANE_MAX_Y - unitStats.hitboxRadius
    ) {
      continue;
    }
    if (overlapsStaticObstacles(world, candidateX, candidateY, unitStats.hitboxRadius)) continue;
    if (overlapsUnits(world, unit, candidateX, candidateY, false)) continue;

    const pathResult = findPathDetailed(
      unit.x, unit.y,
      candidateX, candidateY,
      world.buildings,
      extraObstacles,
      unitStats.hitboxRadius,
      LANE_MIN_X, LANE_MAX_X, LANE_MIN_Y, LANE_MAX_Y,
      { failureMode: "empty_on_failure", logFailure: false },
    );
    if (pathResult.goalOpenNeighbors === 0) continue;

    const dx = candidateX - unit.x;
    const dy = candidateY - unit.y;
    const distToCandidate = Math.sqrt(dx * dx + dy * dy);
    const score = distToCandidate + (pathResult.status === "ok" ? 0 : 500) - pathResult.goalOpenNeighbors * 25;

    if (score < bestScore) {
      bestScore = score;
      bestPoint = { x: candidateX, y: candidateY };
    }
  }

  return bestPoint ?? { x: target.x, y: target.y };
}

export function stepWorld(world: WorldState): void {
  world.tick += 1;
  const moveDebugByUnitId = new Map<string, MoveDebugInfo>();

  // Auto-spawn: each building produces units on a timer (skip paused)
  for (const building of world.buildings) {
    if (building.paused) continue;
    const bStats = getBuildingStats(building.buildingId);
    if (!bStats.spawnsCreature || !bStats.spawnIntervalTicks) continue;
    building.spawnTicksRemaining -= 1;
    if (building.spawnTicksRemaining <= 0) {
      spawnUnitFromBuilding(world, building);
      building.spawnTicksRemaining = bStats.spawnIntervalTicks;
    }
  }

  // Vision scan & target acquisition
  for (const unit of world.units) {
    const creatureStats = getCreatureStats(unit.creatureId);
    const visionRangeSq = creatureStats.visionRange * creatureStats.visionRange;

    // Validate existing unit target: still alive, in vision range, and flight-compatible?
    if (unit.attackTargetId) {
      const target = world.units.find((u) => u.id === unit.attackTargetId);
      if (!target || target.hp <= 0) {
        unit.attackTargetId = undefined;
      } else if (unit.flying !== target.flying) {
        // Flight mismatch: flying units can only fight other flying units
        unit.attackTargetId = undefined;
      } else {
        const dx = target.x - unit.x;
        const dy = target.y - unit.y;
        if (dx * dx + dy * dy > visionRangeSq) {
          unit.attackTargetId = undefined;
        }
      }
    }

    // Validate existing building target: still alive and in vision range?
    if (unit.attackTargetBuildingId && !unit.attackTargetId) {
      const targetBuilding = world.buildings.find((b) => b.id === unit.attackTargetBuildingId);
      if (!targetBuilding || targetBuilding.hp <= 0) {
        unit.attackTargetBuildingId = undefined;
      } else {
        const bRect = buildingRect(targetBuilding);
        const dSq = distSqToRect(unit.x, unit.y, bRect.x, bRect.y, bRect.w, bRect.h);
        if (dSq > visionRangeSq) {
          unit.attackTargetBuildingId = undefined;
        }
      }
    }

    // Acquire new target if none (locked targeting: don't switch while current is valid)
    // Priority: enemy units first, then enemy buildings (non-castle)
    // Flight rule: flying units only target flying enemies; ground units only target ground enemies
    if (!unit.attackTargetId) {
      let closestDistSq = visionRangeSq;
      let closestId: string | undefined;
      for (const other of world.units) {
        if (other.owner === unit.owner || other.hp <= 0) continue;
        // Flight mismatch: skip targets at different altitude
        if (unit.flying !== other.flying) continue;
        const dx = other.x - unit.x;
        const dy = other.y - unit.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < closestDistSq) {
          closestDistSq = dSq;
          closestId = other.id;
        }
      }
      if (closestId) {
        unit.attackTargetId = closestId;
        unit.attackTargetBuildingId = undefined;
        // If was attacking castle or building, switch to moving to pursue unit
        if (unit.state === "attacking" || unit.state === "attacking_building") {
          unit.state = "moving";
          unit.waypoints = [];
        }
      }
    }

    // If no unit target, look for enemy buildings (non-castle) in vision range
    // Flying units skip non-castle buildings (they fly over them)
    if (!unit.attackTargetId && !unit.attackTargetBuildingId && !unit.flying) {
      let closestDistSq = visionRangeSq;
      let closestBuildingId: string | undefined;
      for (const b of world.buildings) {
        if (b.owner === unit.owner || b.hp <= 0 || b.buildingId === "castle") continue;
        const bRect = buildingRect(b);
        const dSq = distSqToRect(unit.x, unit.y, bRect.x, bRect.y, bRect.w, bRect.h);
        if (dSq < closestDistSq) {
          closestDistSq = dSq;
          closestBuildingId = b.id;
        }
      }
      if (closestBuildingId) {
        unit.attackTargetBuildingId = closestBuildingId;
        if (unit.state === "attacking") {
          unit.state = "moving";
          unit.waypoints = [];
        }
      }
    }
  }

  // Save pre-move positions for stuck detection
  for (const unit of world.units) {
    unit.prevX = unit.x;
    unit.prevY = unit.y;
  }

  // Move units
  for (const unit of world.units) {
    const creatureStats = getCreatureStats(unit.creatureId);

    // Handle attacking_unit state
    if (unit.state === "attacking_unit") {
      const target = unit.attackTargetId ? world.units.find((u) => u.id === unit.attackTargetId) : undefined;
      if (!target || target.hp <= 0) {
        // Target dead — resume moving
        unit.state = "moving";
        unit.attackTargetId = undefined;
        unit.waypoints = [];
      } else {
        // Check if still in attack range of target unit
        const dx = target.x - unit.x;
        const dy = target.y - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxAttackDist = creatureStats.hitboxRadius + creatureStats.attackRange + getCreatureStats(target.creatureId).hitboxRadius;
        if (dist > maxAttackDist) {
          // Out of range — resume moving (keep target locked)
          unit.state = "moving";
          unit.waypoints = [];
        } else {
          // In range — set attack target position and deal damage
          unit.attackTargetX = target.x;
          unit.attackTargetY = target.y;
          unit.vx = 0;
          unit.vy = 0;

          const attackCycleTick = (world.tick - unit.attackCycleStartTick) % creatureStats.attackIntervalTicks;
          if (attackCycleTick === getAttackHitOffsetTicks(unit.creatureId)) {
            target.hp -= resolveDamage(creatureStats.attackDamage, creatureStats.attackType, {
              armorType: getCreatureStats(target.creatureId).armorType,
              armor: getCreatureStats(target.creatureId).armor,
            });
          }
          continue;
        }
      }
    }

    // Handle attacking_building state
    if (unit.state === "attacking_building") {
      const targetBuilding = unit.attackTargetBuildingId
        ? world.buildings.find((b) => b.id === unit.attackTargetBuildingId)
        : undefined;
      if (!targetBuilding || targetBuilding.hp <= 0) {
        // Building destroyed — resume moving
        unit.state = "moving";
        unit.attackTargetBuildingId = undefined;
        unit.waypoints = [];
      } else {
        const bRect = buildingRect(targetBuilding);
        const dSq = distSqToRect(unit.x, unit.y, bRect.x, bRect.y, bRect.w, bRect.h);
        const maxAttackDist = creatureStats.hitboxRadius + creatureStats.attackRange;
        if (dSq > maxAttackDist * maxAttackDist) {
          // Out of range — resume moving (keep building target locked)
          unit.state = "moving";
          unit.waypoints = [];
        } else {
          // In range — compute attack target point and deal damage
          const atkPt = closestPointOnRect(unit.x, unit.y, bRect.x, bRect.y, bRect.w, bRect.h);
          unit.attackTargetX = atkPt.x;
          unit.attackTargetY = atkPt.y;
          unit.vx = 0;
          unit.vy = 0;

          const attackCycleTick = (world.tick - unit.attackCycleStartTick) % creatureStats.attackIntervalTicks;
          if (attackCycleTick === getAttackHitOffsetTicks(unit.creatureId)) {
            const bStats = getBuildingStats(targetBuilding.buildingId);
            const damage = resolveDamage(creatureStats.attackDamage, creatureStats.attackType, {
              armorType: bStats.armorType,
              armor: bStats.armor,
            });
            targetBuilding.hp = Math.max(0, targetBuilding.hp - damage);
          }
          continue;
        }
      }
    }

    // Handle attacking (castle) state
    if (unit.state === "attacking") {
      const enemyCastleBuilding = getEnemyCastle(world, unit.owner);
      const ecRect = buildingRect(enemyCastleBuilding);
      const dSqToCastle = distSqToRect(unit.x, unit.y, ecRect.x, ecRect.y, ecRect.w, ecRect.h);
      const maxAttackDist = creatureStats.hitboxRadius + creatureStats.attackRange;
      if (dSqToCastle > maxAttackDist * maxAttackDist) {
        // Out of range — resume moving toward castle
        unit.state = "moving";
        unit.waypoints = [];
      } else {
        // In range — compute attack target point (closest point on castle hitbox)
        const atkPt = closestPointOnRect(unit.x, unit.y, ecRect.x, ecRect.y, ecRect.w, ecRect.h);
        unit.attackTargetX = atkPt.x;
        unit.attackTargetY = atkPt.y;

        // Deal damage on attack tick
        const attackCycleTick = (world.tick - unit.attackCycleStartTick) % creatureStats.attackIntervalTicks;
        if (attackCycleTick === getAttackHitOffsetTicks(unit.creatureId)) {
          const castleDefense = getBuildingStats("castle");
          const damage = resolveDamage(creatureStats.attackDamage, creatureStats.attackType, { armorType: castleDefense.armorType, armor: castleDefense.armor });
          enemyCastleBuilding.hp = Math.max(0, enemyCastleBuilding.hp - damage);
        }
        continue;
      }
    }

    // Unit is in "moving" state
    const WAYPOINT_REACH_DIST = 15;
    const speed = creatureStats.moveSpeedPerTick;
    const r = creatureStats.hitboxRadius;

    // If pursuing a unit target, steer toward it (with periodic pathfinding recalc)
    if (unit.attackTargetId) {
      const target = world.units.find((u) => u.id === unit.attackTargetId);
      if (target && target.hp > 0) {
        const startX = unit.x;
        const startY = unit.y;
        const castleObstacles = castleObstacleRects(world);
        const approachPoint = findChaseApproachPoint(world, unit, target, castleObstacles);
        const CHASE_RECALC_INTERVAL = 10; // recalculate path every 10 ticks
        const needsRecalc = !unit.chaseRecalcTick || (world.tick - unit.chaseRecalcTick) >= CHASE_RECALC_INTERVAL;

        if (needsRecalc) {
          unit.waypoints = findPath(
            unit.x, unit.y,
            approachPoint.x, approachPoint.y,
            world.buildings,
            castleObstacles,
            creatureStats.hitboxRadius,
            LANE_MIN_X, LANE_MAX_X, LANE_MIN_Y, LANE_MAX_Y,
          );
          unit.chaseRecalcTick = world.tick;
        }

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

        // Steer toward next waypoint or directly toward target
        let targetX: number;
        let targetY: number;
        if (unit.waypoints.length > 0) {
          targetX = unit.waypoints[0].x;
          targetY = unit.waypoints[0].y;
        } else {
          targetX = approachPoint.x;
          targetY = approachPoint.y;
        }

        const toTargetX = targetX - unit.x;
        const toTargetY = targetY - unit.y;
        const toTargetDist = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);

        if (toTargetDist > 0) {
          const moveSpeed = Math.min(speed, toTargetDist);
          unit.vx = (toTargetX / toTargetDist) * moveSpeed;
          unit.vy = (toTargetY / toTargetDist) * moveSpeed;
        }

        // Debug: detect steering direction flip during chase
        const prevChaseVx = (unit as any)._prevSteerVx as number | undefined;
        if (
          typeof prevChaseVx === "number" &&
          Math.abs(prevChaseVx) > 0.001 &&
          Math.abs(unit.vx) > 0.001 &&
          (prevChaseVx > 0) !== (unit.vx > 0)
        ) {
          (unit as any)._steerFlipCount = ((unit as any)._steerFlipCount ?? 0) + 1;
          if ((unit as any)._steerFlipCount >= 2) {
            console.warn(
              `[STEER-FLIP] ${unit.id} tick=${world.tick} pos=${formatPoint(unit.x, unit.y)} ` +
              `prevVx=${prevChaseVx.toFixed(3)} newVx=${unit.vx.toFixed(3)} ` +
              `target=${formatPoint(targetX, targetY)} toTargetDist=${toTargetDist.toFixed(1)} ` +
              `wp=${unit.waypoints.length} chaseTarget=${unit.attackTargetId} ` +
              `wpSource=${unit.waypoints.length > 0 ? "waypoint" : "approach-point"}`,
            );
          }
        } else {
          (unit as any)._steerFlipCount = 0;
        }
        (unit as any)._prevSteerVx = unit.vx;

        unit.x += unit.vx;
        unit.y += unit.vy;
        moveDebugByUnitId.set(unit.id, {
          mode: "chase",
          fromX: startX,
          fromY: startY,
          intendedX: unit.x,
          intendedY: unit.y,
          targetX,
          targetY,
          waypointCount: unit.waypoints.length,
        });

        // Check if in attack range of target unit
        const dx = target.x - unit.x;
        const dy = target.y - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const attackDist = r + creatureStats.attackRange + getCreatureStats(target.creatureId).hitboxRadius;
        if (dist <= attackDist) {
          unit.vx = 0;
          unit.vy = 0;
          unit.state = "attacking_unit";
          unit.attackCycleStartTick = world.tick;
        }
        continue;
      } else {
        // Target gone — clear and fall through to building/castle march
        unit.attackTargetId = undefined;
        unit.chaseRecalcTick = undefined;
      }
    }

    // If pursuing a building target, steer toward it
    if (unit.attackTargetBuildingId) {
      const targetBuilding = world.buildings.find((b) => b.id === unit.attackTargetBuildingId);
      if (targetBuilding && targetBuilding.hp > 0) {
        const startX = unit.x;
        const startY = unit.y;
        const bRect = buildingRect(targetBuilding);
        const approachPt = closestPointOnRect(unit.x, unit.y, bRect.x, bRect.y, bRect.w, bRect.h);
        const castleObstacles = castleObstacleRects(world);
        const CHASE_RECALC_INTERVAL = 10;
        const needsRecalc = !unit.chaseRecalcTick || (world.tick - unit.chaseRecalcTick) >= CHASE_RECALC_INTERVAL;

        if (needsRecalc) {
          unit.waypoints = findPath(
            unit.x, unit.y,
            approachPt.x, approachPt.y,
            world.buildings,
            castleObstacles,
            creatureStats.hitboxRadius,
            LANE_MIN_X, LANE_MAX_X, LANE_MIN_Y, LANE_MAX_Y,
          );
          unit.chaseRecalcTick = world.tick;
        }

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

        let targetX: number;
        let targetY: number;
        if (unit.waypoints.length > 0) {
          targetX = unit.waypoints[0].x;
          targetY = unit.waypoints[0].y;
        } else {
          targetX = approachPt.x;
          targetY = approachPt.y;
        }

        const toTargetX = targetX - unit.x;
        const toTargetY = targetY - unit.y;
        const toTargetDist = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);

        if (toTargetDist > 0) {
          const moveSpeed = Math.min(speed, toTargetDist);
          unit.vx = (toTargetX / toTargetDist) * moveSpeed;
          unit.vy = (toTargetY / toTargetDist) * moveSpeed;
        }

        unit.x += unit.vx;
        unit.y += unit.vy;
        moveDebugByUnitId.set(unit.id, {
          mode: "chase",
          fromX: startX,
          fromY: startY,
          intendedX: unit.x,
          intendedY: unit.y,
          targetX,
          targetY,
          waypointCount: unit.waypoints.length,
        });

        // Check if in attack range of target building
        const dSq = distSqToRect(unit.x, unit.y, bRect.x, bRect.y, bRect.w, bRect.h);
        const attackDist = r + creatureStats.attackRange;
        if (dSq <= attackDist * attackDist) {
          unit.vx = 0;
          unit.vy = 0;
          unit.state = "attacking_building";
          unit.attackCycleStartTick = world.tick;
        }
        continue;
      } else {
        // Building gone — clear and fall through to normal castle march
        unit.attackTargetBuildingId = undefined;
        unit.chaseRecalcTick = undefined;
      }
    }

    // Normal movement: follow waypoints toward enemy castle
    const startX = unit.x;
    const startY = unit.y;
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

    // Steer toward next waypoint, or best free position around enemy castle
    let targetX: number;
    let targetY: number;
    if (unit.waypoints.length > 0) {
      targetX = unit.waypoints[0].x;
      targetY = unit.waypoints[0].y;
    } else {
      const enemyCastle = getEnemyCastle(world, unit.owner);
      const ecRectVal = buildingRect(enemyCastle);
      // Find a position around the castle that isn't crowded by other units
      const ecx = ecRectVal.x + ecRectVal.w / 2;
      const ecy = ecRectVal.y + ecRectVal.h / 2;
      const standoff = r + creatureStats.attackRange * 0.8;
      const hw = ecRectVal.w / 2 + standoff;
      const hh = ecRectVal.h / 2 + standoff;

      // Sample positions around the castle perimeter
      const SAMPLES = 20;
      let bestX = unit.x;
      let bestY = unit.y;
      let bestScore = Infinity;

      for (let i = 0; i < SAMPLES; i++) {
        const angle = (i / SAMPLES) * Math.PI * 2;
        // Map angle to rect perimeter
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const sx = Math.abs(cos) > 0.001 ? hw / Math.abs(cos) : Infinity;
        const sy = Math.abs(sin) > 0.001 ? hh / Math.abs(sin) : Infinity;
        const scale = Math.min(sx, sy);
        const px = Math.max(LANE_MIN_X + r, Math.min(LANE_MAX_X - r, ecx + cos * scale));
        const py = Math.max(LANE_MIN_Y + r, Math.min(LANE_MAX_Y - r, ecy + sin * scale));

        // Score: distance to unit + crowding penalty
        const dx = px - unit.x;
        const dy = py - unit.y;
        const distToUnit = Math.sqrt(dx * dx + dy * dy);

        let crowd = 0;
        const crowdR = r * 3;
        const crowdRSq = crowdR * crowdR;
        for (const other of world.units) {
          if (other.id === unit.id) continue;
          const odx = px - other.x;
          const ody = py - other.y;
          if (odx * odx + ody * ody < crowdRSq) crowd++;
        }

        const score = distToUnit + crowd * 150;
        if (score < bestScore) {
          bestScore = score;
          bestX = px;
          bestY = py;
        }
      }

      targetX = bestX;
      targetY = bestY;
    }
    const toTargetX = targetX - unit.x;
    const toTargetY = targetY - unit.y;
    const toTargetDist = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);

    if (toTargetDist > 0) {
      const moveSpeed = Math.min(speed, toTargetDist);
      unit.vx = (toTargetX / toTargetDist) * moveSpeed;
      unit.vy = (toTargetY / toTargetDist) * moveSpeed;
    }

    // Debug: detect steering direction flip between consecutive ticks
    const prevVx = unit.x - startX === 0 ? unit.vx : (unit as any)._prevSteerVx;
    const newVx = unit.vx;
    if (
      typeof prevVx === "number" &&
      Math.abs(prevVx) > 0.001 &&
      Math.abs(newVx) > 0.001 &&
      (prevVx > 0) !== (newVx > 0)
    ) {
      (unit as any)._steerFlipCount = ((unit as any)._steerFlipCount ?? 0) + 1;
      if ((unit as any)._steerFlipCount >= 2) {
        console.warn(
          `[STEER-FLIP] ${unit.id} tick=${world.tick} pos=${formatPoint(unit.x, unit.y)} ` +
          `prevVx=${prevVx.toFixed(3)} newVx=${newVx.toFixed(3)} ` +
          `target=${formatPoint(targetX, targetY)} toTargetDist=${toTargetDist.toFixed(1)} ` +
          `wp=${unit.waypoints.length} hasAttackTarget=${!!unit.attackTargetId} ` +
          `wpSource=${unit.waypoints.length > 0 ? "waypoint" : "castle-sampling"}`,
        );
      }
    } else {
      (unit as any)._steerFlipCount = 0;
    }
    (unit as any)._prevSteerVx = newVx;

    unit.x += unit.vx;
    unit.y += unit.vy;
    moveDebugByUnitId.set(unit.id, {
      mode: "castle",
      fromX: startX,
      fromY: startY,
      intendedX: unit.x,
      intendedY: unit.y,
      targetX,
      targetY,
      waypointCount: unit.waypoints.length,
    });

    // Attack check: enemy castle within attack range (only if not pursuing a unit)
    if (!unit.attackTargetId) {
      for (const castleBuilding of world.buildings.filter(b => b.buildingId === "castle")) {
        if (castleBuilding.owner !== unit.owner && unit.state === "moving") {
          const cr = buildingRect(castleBuilding);
          const dSq = distSqToRect(unit.x, unit.y, cr.x, cr.y, cr.w, cr.h);
          const attackDist = r + creatureStats.attackRange;
          if (dSq <= attackDist * attackDist) {
            unit.vx = 0;
            unit.vy = 0;
            unit.state = "attacking";
            unit.attackCycleStartTick = world.tick;
          }
        }
      }
    }
  }

  // Iterative collision resolution — multiple passes to prevent push-through
  const COLLISION_ITERATIONS = 4;
  for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
    // Unit vs unit (circle vs circle, push apart)
    // Flying units don't collide with ground units
    for (let i = 0; i < world.units.length; i++) {
      const a = world.units[i];
      const ra = getCreatureStats(a.creatureId).hitboxRadius;
      for (let j = i + 1; j < world.units.length; j++) {
        const b = world.units[j];
        // Skip collision between flying and ground units
        if (a.flying !== b.flying) continue;
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

        const aAttacking = a.state === "attacking" || a.state === "attacking_unit";
        const bAttacking = b.state === "attacking" || b.state === "attacking_unit";

        if (aAttacking && !bAttacking) {
          // Only push b
          b.x += nx * overlap;
          b.y += ny * overlap;
        } else if (bAttacking && !aAttacking) {
          // Only push a
          a.x -= nx * overlap;
          a.y -= ny * overlap;
        } else {
          // Both attacking or both moving — split equally
          const half = overlap / 2;
          a.x -= nx * half;
          a.y -= ny * half;
          b.x += nx * half;
          b.y += ny * half;
        }
      }
    }

    // Unit vs buildings including castles (push out) — flying units skip building collision
    for (const unit of world.units) {
      if (unit.flying) continue;
      const r = getCreatureStats(unit.creatureId).hitboxRadius;
      for (const building of world.buildings) {
        const bStats = getBuildingStats(building.buildingId);
        const bx = building.x - bStats.hitboxWidth / 2;
        const by = building.y - bStats.hitboxHeight / 2;
        const sep = resolveCircleVsRect(unit.x, unit.y, r, bx, by, bStats.hitboxWidth, bStats.hitboxHeight);
        if (sep) {
          unit.x += sep.dx;
          unit.y += sep.dy;
        }
      }
    }

    // Clamp units within world bounds
    for (const unit of world.units) {
      const r = getCreatureStats(unit.creatureId).hitboxRadius;
      unit.x = Math.max(LANE_MIN_X + r, Math.min(LANE_MAX_X - r, unit.x));
      unit.y = Math.max(LANE_MIN_Y + r, Math.min(LANE_MAX_Y - r, unit.y));
    }
  }

  // Debug: detect position oscillation after collision (facing trembling bug)
  // The snapshot sends u.vx (set before collision), but u.x is modified by collision.
  // Compare effective displacement (post-collision) across consecutive ticks.
  for (const unit of world.units) {
    const moveDebug = moveDebugByUnitId.get(unit.id);
    if (!moveDebug) continue;

    const effectiveDx = unit.x - moveDebug.fromX;
    const prevEffectiveDx = (unit as any)._prevEffectiveDx as number | undefined;
    (unit as any)._prevEffectiveDx = effectiveDx;

    if (
      typeof prevEffectiveDx === "number" &&
      Math.abs(prevEffectiveDx) > 0.1 &&
      Math.abs(effectiveDx) > 0.1 &&
      (prevEffectiveDx > 0) !== (effectiveDx > 0)
    ) {
      unit.facingFlipCount = (unit.facingFlipCount ?? 0) + 1;
      if (unit.facingFlipCount >= 2) {
        const nearbyObstacles: string[] = [];
        for (const building of world.buildings) {
          const bStats = getBuildingStats(building.buildingId);
          const dx = unit.x - building.x;
          const dy = unit.y - building.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < bStats.hitboxWidth + 50) {
            nearbyObstacles.push(
              `${building.id}(${building.buildingId})@${formatPoint(building.x, building.y)} dist=${dist.toFixed(1)}`,
            );
          }
        }

        console.warn(
          `[BOUNCE] ${unit.id} tick=${world.tick} pos=${formatPoint(unit.x, unit.y)} ` +
          `effectiveDx=${effectiveDx.toFixed(3)} prevDx=${prevEffectiveDx.toFixed(3)} ` +
          `intendedVx=${unit.vx.toFixed(3)} state=${unit.state} ` +
          `target=${formatPoint(moveDebug.targetX, moveDebug.targetY)} ` +
          `wp=${moveDebug.waypointCount} mode=${moveDebug.mode} ` +
          `flips=${unit.facingFlipCount} nearObstacles=[${nearbyObstacles.join("; ")}]`,
        );
      }
    } else {
      unit.facingFlipCount = 0;
    }
  }

  // Re-check attack range after all collisions (push-apart may have moved units out of range)
  for (const unit of world.units) {
    if (unit.state === "attacking") {
      const creatureStats = getCreatureStats(unit.creatureId);
      const ecRect = buildingRect(getEnemyCastle(world, unit.owner));
      const dSq = distSqToRect(unit.x, unit.y, ecRect.x, ecRect.y, ecRect.w, ecRect.h);
      const maxDist = creatureStats.hitboxRadius + creatureStats.attackRange;
      if (dSq > maxDist * maxDist) {
        unit.state = "moving";
        unit.waypoints = [];
      }
    } else if (unit.state === "attacking_unit") {
      const target = unit.attackTargetId ? world.units.find((u) => u.id === unit.attackTargetId) : undefined;
      if (!target || target.hp <= 0) {
        unit.state = "moving";
        unit.attackTargetId = undefined;
        unit.waypoints = [];
      } else {
        const creatureStats = getCreatureStats(unit.creatureId);
        const dx = target.x - unit.x;
        const dy = target.y - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = creatureStats.hitboxRadius + creatureStats.attackRange + getCreatureStats(target.creatureId).hitboxRadius;
        if (dist > maxDist) {
          unit.state = "moving";
          unit.waypoints = [];
        }
      }
    }
  }

  // Stuck detection: recalculate path when a moving unit hasn't progressed
  const STUCK_THRESHOLD = 0.5; // min distance per tick to not be "stuck"
  const STUCK_TICKS_BEFORE_REPATH = 5;
  for (const unit of world.units) {
    if (unit.state !== "moving") {
      unit.stuckTicks = 0;
      continue;
    }
    const dx = unit.x - (unit.prevX ?? unit.x);
    const dy = unit.y - (unit.prevY ?? unit.y);
    const movedDist = Math.sqrt(dx * dx + dy * dy);
    const speed = getCreatureStats(unit.creatureId).moveSpeedPerTick;
    const moveDebug = moveDebugByUnitId.get(unit.id);
    const startTargetDist = moveDebug
      ? Math.sqrt((moveDebug.targetX - moveDebug.fromX) ** 2 + (moveDebug.targetY - moveDebug.fromY) ** 2)
      : 0;
    const endTargetDist = moveDebug
      ? Math.sqrt((moveDebug.targetX - unit.x) ** 2 + (moveDebug.targetY - unit.y) ** 2)
      : 0;
    const progressTowardGoal = startTargetDist - endTargetDist;
    const MIN_PROGRESS_TO_RESET_STUCK = 0.15;
    if (movedDist < STUCK_THRESHOLD && speed > 0 && progressTowardGoal < MIN_PROGRESS_TO_RESET_STUCK) {
      unit.stuckTicks = (unit.stuckTicks ?? 0) + 1;
      if (unit.stuckTicks === 1) {
        console.log(
          `[STUCK] ${unit.id} tick=${world.tick} pos=${formatPoint(unit.x, unit.y)} moved=${movedDist.toFixed(3)} ` +
          `speed=${speed} wp=${unit.waypoints.length} vx=${unit.vx.toFixed(2)} vy=${unit.vy.toFixed(2)} ` +
          `${buildStuckDebugContext(world, unit, moveDebug)}`,
        );
      }
    } else {
      unit.stuckTicks = 0;
    }

    if (unit.stuckTicks >= STUCK_TICKS_BEFORE_REPATH) {
      // Build obstacle list including attacking units (treated as circular obstacles)
      const creatureStats = getCreatureStats(unit.creatureId);
      const castleObstacles = castleObstacleRects(world);
      // Inflate attacking unit obstacles so they block multiple grid cells (cell size = 20)
      const inflateRadius = creatureStats.hitboxRadius * 3;
      const attackingUnits = world.units
        .filter((u) => u.id !== unit.id && (u.state === "attacking" || u.state === "attacking_unit"))
        .map((u) => ({ id: u.id, x: u.x, y: u.y, state: u.state }));
      const attackingUnitObstacles = attackingUnits.map((u) => {
        return { x: u.x - inflateRadius, y: u.y - inflateRadius, w: inflateRadius * 2, h: inflateRadius * 2 };
      });

      const enemyCastle = buildingRect(getEnemyCastle(world, unit.owner));
      let targetX: number;
      let targetY: number;
      if (unit.attackTargetId) {
        const target = world.units.find((u) => u.id === unit.attackTargetId);
        if (target) {
          const approachPoint = findChaseApproachPoint(
            world,
            unit,
            target,
            [...castleObstacles, ...attackingUnitObstacles],
          );
          targetX = approachPoint.x;
          targetY = approachPoint.y;
        } else {
          targetX = unit.x;
          targetY = unit.y;
        }
      } else {
        // Find a free attack position around the castle perimeter, avoiding attacking units
        const ecx = enemyCastle.x + enemyCastle.w / 2;
        const ecy = enemyCastle.y + enemyCastle.h / 2;
        const standoff = creatureStats.hitboxRadius + creatureStats.attackRange * 0.8;
        const hw = enemyCastle.w / 2 + standoff;
        const hh = enemyCastle.h / 2 + standoff;
        const SAMPLES = 24;
        let bestX = unit.x;
        let bestY = unit.y;
        let bestScore = Infinity;
        for (let i = 0; i < SAMPLES; i++) {
          const angle = (i / SAMPLES) * Math.PI * 2;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const sx = Math.abs(cos) > 0.001 ? hw / Math.abs(cos) : Infinity;
          const sy = Math.abs(sin) > 0.001 ? hh / Math.abs(sin) : Infinity;
          const scale = Math.min(sx, sy);
          const px = Math.max(LANE_MIN_X + creatureStats.hitboxRadius, Math.min(LANE_MAX_X - creatureStats.hitboxRadius, ecx + cos * scale));
          const py = Math.max(LANE_MIN_Y + creatureStats.hitboxRadius, Math.min(LANE_MAX_Y - creatureStats.hitboxRadius, ecy + sin * scale));
          const dx = px - unit.x;
          const dy = py - unit.y;
          const distToUnit = Math.sqrt(dx * dx + dy * dy);
          let crowd = 0;
          const crowdR = creatureStats.hitboxRadius * 4;
          const crowdRSq = crowdR * crowdR;
          for (const other of world.units) {
            if (other.id === unit.id) continue;
            const odx = px - other.x;
            const ody = py - other.y;
            if (odx * odx + ody * ody < crowdRSq) crowd++;
          }
          const score = distToUnit + crowd * 200;
          if (score < bestScore) {
            bestScore = score;
            bestX = px;
            bestY = py;
          }
        }
        targetX = bestX;
        targetY = bestY;
      }

      const oldWp = unit.waypoints.length;
      const pathResult = findPathDetailed(
        unit.x, unit.y,
        targetX, targetY,
        world.buildings,
        [...castleObstacles, ...attackingUnitObstacles],
        creatureStats.hitboxRadius,
        LANE_MIN_X, LANE_MAX_X, LANE_MIN_Y, LANE_MAX_Y,
        { failureMode: "empty_on_failure" },
      );
      let escapePlan: EscapePlan | null = null;
      if (pathResult.status === "ok") {
        unit.waypoints = pathResult.waypoints;
      } else {
        escapePlan = buildEscapePlan(
          world,
          unit,
          targetX,
          targetY,
          [...castleObstacles, ...attackingUnitObstacles],
        );
        if (escapePlan) {
          unit.waypoints = [escapePlan.waypoint, ...escapePlan.followUpWaypoints];
        } else {
          unit.waypoints = [];
        }
      }
      const obstacleSummary = attackingUnits.length > 0
        ? attackingUnits
          .slice(0, 4)
          .map((u) => `${u.id}:${u.state}@${formatPoint(u.x, u.y)}`)
          .join(",")
        : "none";
      console.log(
        `[STUCK-REPATH] ${unit.id} tick=${world.tick} pos=${formatPoint(unit.x, unit.y)} target=${formatPoint(targetX, targetY)} ` +
        `atkObstacles=${attackingUnitObstacles.length} obstacleIds=${obstacleSummary} oldWp=${oldWp} newWp=${unit.waypoints.length} ` +
        `pathStatus=${pathResult.status} startOpen=${pathResult.startOpenNeighbors} goalOpen=${pathResult.goalOpenNeighbors}`,
      );
      if (unit.waypoints.length > 0) {
        console.log(`[STUCK-REPATH]   first wp=(${unit.waypoints[0].x.toFixed(1)},${unit.waypoints[0].y.toFixed(1)}) last wp=(${unit.waypoints[unit.waypoints.length - 1].x.toFixed(1)},${unit.waypoints[unit.waypoints.length - 1].y.toFixed(1)})`);
      } else {
        console.log(`[STUCK-REPATH]   NO PATH FOUND — unit is trapped`);
      }
      if (escapePlan) {
        console.log(
          `[STUCK-ESCAPE] ${unit.id} tick=${world.tick} escape=${formatPoint(escapePlan.waypoint.x, escapePlan.waypoint.y)} ` +
          `mode=${escapePlan.status} score=${escapePlan.score.toFixed(1)} startOpen=${escapePlan.startOpenNeighbors} ` +
          `followUpWp=${escapePlan.followUpWaypoints.length}`,
        );
      }
      console.log(`[STUCK-CTX] ${unit.id} tick=${world.tick} ${buildStuckDebugContext(world, unit, moveDebug)}`);
      unit.stuckTicks = 0;
    }
  }

  // Remove dead buildings (non-castle) and clean up target references
  const deadBuildingIds = new Set(
    world.buildings.filter((b) => b.hp <= 0 && b.buildingId !== "castle").map((b) => b.id),
  );
  if (deadBuildingIds.size > 0) {
    world.buildings = world.buildings.filter((b) => !deadBuildingIds.has(b.id));
    for (const unit of world.units) {
      if (unit.attackTargetBuildingId && deadBuildingIds.has(unit.attackTargetBuildingId)) {
        unit.attackTargetBuildingId = undefined;
        unit.chaseRecalcTick = undefined;
        if (unit.state === "attacking_building") {
          unit.state = "moving";
          unit.waypoints = [];
        }
      }
    }
  }

  // Remove dead units and clean up target references
  const deadIds = new Set(world.units.filter((u) => u.hp <= 0).map((u) => u.id));
  if (deadIds.size > 0) {
    world.units = world.units.filter((u) => u.hp > 0);
    for (const unit of world.units) {
      if (unit.attackTargetId && deadIds.has(unit.attackTargetId)) {
        unit.attackTargetId = undefined;
        unit.chaseRecalcTick = undefined;
        if (unit.state === "attacking_unit") {
          unit.state = "moving";
          unit.waypoints = [];
        }
      }
    }
  }

  // Audit: log violations every second (20 ticks)
  if (world.tick % 20 === 0 && world.units.length > 0) {
    const violations: string[] = [];

    for (const unit of world.units) {
      const stats = getCreatureStats(unit.creatureId);
      const r = stats.hitboxRadius;

      // Check attack range violation
      if (unit.state === "attacking") {
        const ec = buildingRect(getEnemyCastle(world, unit.owner));
        const dist = Math.sqrt(distSqToRect(unit.x, unit.y, ec.x, ec.y, ec.w, ec.h));
        const maxDist = r + stats.attackRange;
        if (dist > maxDist) {
          violations.push(`[RANGE] ${unit.id} attacking at dist=${dist.toFixed(1)} > max=${maxDist}`);
        }
      }

      // Check unit-unit overlap
      for (const other of world.units) {
        if (other.id <= unit.id) continue;
        const or = getCreatureStats(other.creatureId).hitboxRadius;
        const dx = unit.x - other.x;
        const dy = unit.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = r + or;
        if (dist < minDist - 1) {
          violations.push(`[OVERLAP] ${unit.id}-${other.id} dist=${dist.toFixed(1)} < min=${minDist}`);
        }
      }

      // Check unit-building overlap (includes castles)
      for (const b of world.buildings) {
        const bs = getBuildingStats(b.buildingId);
        const bx = b.x - bs.hitboxWidth / 2;
        const by = b.y - bs.hitboxHeight / 2;
        const sep = resolveCircleVsRect(unit.x, unit.y, r, bx, by, bs.hitboxWidth, bs.hitboxHeight);
        if (sep && (Math.abs(sep.dx) > 1 || Math.abs(sep.dy) > 1)) {
          violations.push(`[BLDG-COL] ${unit.id} inside building ${b.id} sep=(${sep.dx.toFixed(1)},${sep.dy.toFixed(1)})`);
        }
      }
    }

  }
}

export function buildSnapshot(world: WorldState): SnapshotMessage {
  const creatureStats = Object.fromEntries(
    CREATURE_IDS.map((creatureId) => {
      const stats = getCreatureStats(creatureId);
      return [
        creatureId,
        {
          hp: stats.hp,
          moveSpeedPerTick: stats.moveSpeedPerTick,
          attackDamage: stats.attackDamage,
          attackType: stats.attackType,
          attackRange: stats.attackRange,
          attackIntervalTicks: stats.attackIntervalTicks,
          armorType: stats.armorType,
          armor: stats.armor,
          hitboxRadius: stats.hitboxRadius,
          visionRange: stats.visionRange,
          canFly: stats.canFly,
        },
      ];
    }),
  ) as SnapshotMessage["creatureStats"];

  return {
    type: "snapshot",
    tick: world.tick,
    serverTime: Date.now(),
    units: world.units.map((u) => {
      const creatureStats = getCreatureStats(u.creatureId);
      const attackIntervalTicks = creatureStats.attackIntervalTicks;
      const isAttacking = u.state === "attacking" || u.state === "attacking_unit" || u.state === "attacking_building";
      const attackCycleTick =
        isAttacking ? (world.tick - u.attackCycleStartTick) % attackIntervalTicks : undefined;
      const attackHitOffsetTicks = isAttacking ? getAttackHitOffsetTicks(u.creatureId) : undefined;

      return {
        id: u.id,
        creatureId: u.creatureId,
        owner: u.owner,
        x: u.x,
        y: u.y,
        vx: u.vx,
        vy: u.vy,
        hp: u.hp,
        maxHp: creatureStats.hp,
        state: u.state,
        flying: u.flying,
        attackCycleTick,
        attackIntervalTicks: isAttacking ? attackIntervalTicks : undefined,
        attackHitOffsetTicks,
        waypoints: u.waypoints.length > 0 ? u.waypoints : undefined,
        attackTargetX: isAttacking ? u.attackTargetX : undefined,
        attackTargetY: isAttacking ? u.attackTargetY : undefined,
        attackTargetId: u.attackTargetId ?? undefined,
      };
    }),
    buildings: world.buildings.map((b) => ({
      id: b.id,
      owner: b.owner,
      buildingId: b.buildingId,
      x: b.x,
      y: b.y,
      hp: b.hp,
      maxHp: b.maxHp,
      spawnTicksRemaining: b.spawnTicksRemaining,
      spawnIntervalTicks: b.spawnIntervalTicks,
      paused: b.paused,
    })),
    creatureStats,
  };
}
