import { DEFAULT_CREATURE_ID, getAttackHitOffsetTicks, getBuildingStats, getCreatureStats, type CreatureId } from "./creatures.js";
import type { Building, PlayerId, SnapshotMessage, Unit, WorldState } from "./types.js";

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const LANE_MIN_X = 0;
export const LANE_MAX_X = 1000;
export const LANE_MIN_Y = 0;
export const LANE_MAX_Y = 300;

export function createWorld(): WorldState {
  return {
    tick: 0,
    nextUnitId: 1,
    nextBuildingId: 1,
    castle: {
      player1: 100,
      player2: 100,
    },
    units: [],
    buildings: [],
  };
}

export function resetWorld(world: WorldState): void {
  world.tick = 0;
  world.nextUnitId = 1;
  world.nextBuildingId = 1;
  world.castle.player1 = 100;
  world.castle.player2 = 100;
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
  const r = stats.hitboxRadius;

  // Must place on own side
  const midX = (LANE_MIN_X + LANE_MAX_X) / 2;
  if (owner === "player1" && x > midX) {
    return { ok: false, reason: "must_place_on_own_side" };
  }
  if (owner === "player2" && x < midX) {
    return { ok: false, reason: "must_place_on_own_side" };
  }

  // Must be within bounds (with hitbox margin)
  if (x - r < LANE_MIN_X || x + r > LANE_MAX_X || y - r < LANE_MIN_Y || y + r > LANE_MAX_Y) {
    return { ok: false, reason: "out_of_bounds" };
  }

  // Must not overlap existing buildings
  for (const existing of world.buildings) {
    const existingR = getBuildingStats(existing.creatureId).hitboxRadius;
    const dx = x - existing.x;
    const dy = y - existing.y;
    const minDist = r + existingR;
    if (dx * dx + dy * dy < minDist * minDist) {
      return { ok: false, reason: "overlaps_existing_building" };
    }
  }

  const building: Building = {
    id: `b${world.nextBuildingId++}`,
    owner,
    creatureId,
    x,
    y,
  };
  world.buildings.push(building);
  return { ok: true, building };
}

function createUnit(owner: PlayerId, id: number, creatureId: CreatureId): Unit {
  const creatureStats = getCreatureStats(creatureId);
  const speedPerTick = creatureStats.moveSpeedPerTick;

  if (owner === "player1") {
    return {
      id: `u${id}`,
      creatureId,
      owner,
      x: LANE_MIN_X + 20,
      vx: +speedPerTick,
      hp: creatureStats.hp,
      state: "moving",
      attackCycleStartTick: 0,
    };
  }

  return {
    id: `u${id}`,
    creatureId,
    owner,
    x: LANE_MAX_X - 20,
    vx: -speedPerTick,
    hp: creatureStats.hp,
    state: "moving",
    attackCycleStartTick: 0,
  };
}

export function spawnUnit(world: WorldState, owner: PlayerId, creatureId: CreatureId = DEFAULT_CREATURE_ID): Unit {
  const unit = createUnit(owner, world.nextUnitId++, creatureId);
  world.units.push(unit);
  return unit;
}

export function stepWorld(world: WorldState): void {
  world.tick += 1;

  for (const unit of world.units) {
    const creatureStats = getCreatureStats(unit.creatureId);

    if (unit.state === "moving") {
      unit.x += unit.vx;

      if (unit.owner === "player1" && unit.x >= LANE_MAX_X) {
        unit.x = LANE_MAX_X - creatureStats.castleAttackPositionOffset;
        unit.vx = 0;
        unit.state = "attacking";
        unit.attackCycleStartTick = world.tick;
      } else if (unit.owner === "player2" && unit.x <= LANE_MIN_X) {
        unit.x = LANE_MIN_X + creatureStats.castleAttackPositionOffset;
        unit.vx = 0;
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
        vx: u.vx,
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
    })),
  };
}
