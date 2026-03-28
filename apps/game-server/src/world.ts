import { DEFAULT_CREATURE_ID, getAttackHitOffsetTicks, getBuildingStats, getCreatureStats, type CreatureId } from "./creatures.js";
import type { Building, PlayerId, SnapshotMessage, Unit, WorldState } from "./types.js";

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const LANE_MIN_X = 0;
export const LANE_MAX_X = 1000;
export const LANE_MIN_Y = 0;
export const LANE_MAX_Y = 300;

// Fixed castle world positions
export const CASTLE_PLAYER1_X = 20;
export const CASTLE_PLAYER1_Y = 150;
export const CASTLE_PLAYER2_X = 980;
export const CASTLE_PLAYER2_Y = 150;
export const CASTLE_ATTACK_RADIUS = 30;

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
  return { ok: true, building };
}

type SpawnUnitResult =
  | { ok: true; unit: Unit }
  | { ok: false; reason: string };

function spawnUnitFromBuilding(world: WorldState, building: Building): Unit {
  const creatureStats = getCreatureStats(building.creatureId);
  const speed = creatureStats.moveSpeedPerTick;

  const targetX = building.owner === "player1" ? CASTLE_PLAYER2_X : CASTLE_PLAYER1_X;
  const targetY = building.owner === "player1" ? CASTLE_PLAYER2_Y : CASTLE_PLAYER1_Y;

  const dx = targetX - building.x;
  const dy = targetY - building.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const nx = dist > 0 ? dx / dist : (building.owner === "player1" ? 1 : -1);
  const ny = dist > 0 ? dy / dist : 0;

  const unit: Unit = {
    id: `u${world.nextUnitId++}`,
    creatureId: building.creatureId,
    owner: building.owner,
    x: building.x,
    y: building.y,
    vx: nx * speed,
    vy: ny * speed,
    hp: creatureStats.hp,
    state: "moving",
    attackCycleStartTick: 0,
  };
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

  for (const unit of world.units) {
    const creatureStats = getCreatureStats(unit.creatureId);

    if (unit.state === "moving") {
      unit.x += unit.vx;
      unit.y += unit.vy;

      // Check distance to enemy castle
      const targetX = unit.owner === "player1" ? CASTLE_PLAYER2_X : CASTLE_PLAYER1_X;
      const targetY = unit.owner === "player1" ? CASTLE_PLAYER2_Y : CASTLE_PLAYER1_Y;
      const dx = unit.x - targetX;
      const dy = unit.y - targetY;
      const distSq = dx * dx + dy * dy;

      if (distSq <= CASTLE_ATTACK_RADIUS * CASTLE_ATTACK_RADIUS) {
        // Stop at attack offset distance from castle
        const dist = Math.sqrt(distSq);
        if (dist > 0) {
          unit.x = targetX + (dx / dist) * creatureStats.castleAttackPositionOffset;
          unit.y = targetY + (dy / dist) * creatureStats.castleAttackPositionOffset;
        }
        unit.vx = 0;
        unit.vy = 0;
        unit.state = "attacking";
        unit.attackCycleStartTick = world.tick;
      }
      continue;
    }

    const attackCycleTick = (world.tick - unit.attackCycleStartTick) % creatureStats.attackIntervalTicks;
    if (attackCycleTick !== getAttackHitOffsetTicks(unit.creatureId)) {
      continue;
    }

    if (unit.owner === "player1") {
      world.castle.player2 = Math.max(0, world.castle.player2 - creatureStats.attackDamage);
    } else {
      world.castle.player1 = Math.max(0, world.castle.player1 - creatureStats.attackDamage);
    }
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
