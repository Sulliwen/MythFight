import type { PlayerId, SnapshotMessage, Unit, WorldState } from "./types.js";

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const LANE_MIN_X = 0;
export const LANE_MAX_X = 1000;
export const UNIT_SPEED_PER_TICK = 8;
export const CASTLE_DAMAGE = 10;

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

function createUnit(owner: PlayerId, id: number): Unit {
  if (owner === "player1") {
    return {
      id: `u${id}`,
      owner,
      x: LANE_MIN_X + 20,
      vx: +UNIT_SPEED_PER_TICK,
      hp: 1,
    };
  }

  return {
    id: `u${id}`,
    owner,
    x: LANE_MAX_X - 20,
    vx: -UNIT_SPEED_PER_TICK,
    hp: 1,
  };
}

export function spawnUnit(world: WorldState, owner: PlayerId): Unit {
  const unit = createUnit(owner, world.nextUnitId++);
  world.units.push(unit);
  return unit;
}

export function stepWorld(world: WorldState): void {
  world.tick += 1;

  for (const unit of world.units) {
    unit.x += unit.vx;
  }

  const survivors: Unit[] = [];
  for (const unit of world.units) {
    if (unit.owner === "player1" && unit.x >= LANE_MAX_X) {
      world.castle.player2 = Math.max(0, world.castle.player2 - CASTLE_DAMAGE);
      continue;
    }
    if (unit.owner === "player2" && unit.x <= LANE_MIN_X) {
      world.castle.player1 = Math.max(0, world.castle.player1 - CASTLE_DAMAGE);
      continue;
    }
    survivors.push(unit);
  }

  world.units = survivors;
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
    units: world.units.map((u) => ({ ...u })),
  };
}