import { DEFAULT_CREATURE_ID, getAttackHitOffsetTicks, getCreatureStats, type CreatureId } from "./creatures.js";
import type { PlayerId, SnapshotMessage, Unit, WorldState } from "./types.js";

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const LANE_MIN_X = 0;
export const LANE_MAX_X = 1000;

export function createWorld(): WorldState {
  return {
    tick: 0,
    nextUnitId: 1,
    castle: {
      player1: 100,
      player2: 100,
    },
    units: [],
  };
}

export function resetWorld(world: WorldState): void {
  world.tick = 0;
  world.nextUnitId = 1;
  world.castle.player1 = 100;
  world.castle.player2 = 100;
  world.units = [];
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
      const attackCycleTick =
        u.state === "attacking" ? (world.tick - u.attackCycleStartTick) % creatureStats.attackIntervalTicks : undefined;

      return {
        id: u.id,
        creatureId: u.creatureId,
        owner: u.owner,
        x: u.x,
        vx: u.vx,
        hp: u.hp,
        state: u.state,
        attackCycleTick,
      };
    }),
  };
}
