import type { CreatureId } from "./creatures.js";

export type PlayerId = "player1" | "player2";
export type UnitState = "moving" | "attacking" | "attacking_unit";

export type IncomingMessage = {
  type: string;
  [key: string]: unknown;
};

export type BuildingSnapshot = {
  id: string;
  owner: PlayerId;
  creatureId: CreatureId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  spawnTicksRemaining: number;
  spawnIntervalTicks: number;
  paused: boolean;
};

export type Building = BuildingSnapshot;

export type UnitSnapshot = {
  id: string;
  creatureId: CreatureId;
  owner: PlayerId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  state: UnitState;
  attackCycleTick?: number;
  attackIntervalTicks?: number;
  attackHitOffsetTicks?: number;
  waypoints?: { x: number; y: number }[];
  attackTargetX?: number;
  attackTargetY?: number;
  attackTargetId?: string;
};

export type Waypoint = { x: number; y: number };

export type Unit = UnitSnapshot & {
  attackCycleStartTick: number;
  waypoints: Waypoint[];
  attackTargetId?: string;
  chaseRecalcTick?: number;
  stuckTicks?: number;
  prevX?: number;
  prevY?: number;
};

export type WorldState = {
  tick: number;
  nextUnitId: number;
  nextBuildingId: number;
  castle: {
    player1: number;
    player2: number;
  };
  units: Unit[];
  buildings: Building[];
};

export type WelcomeMessage = {
  type: "welcome";
  tickRate: number;
  playerId: PlayerId;
};

export type ErrorMessage = {
  type: "error";
  reason: string;
};

export type CreatureStatsSnapshot = {
  hp: number;
  moveSpeedPerTick: number;
  attackDamage: number;
  attackRange: number;
  attackIntervalTicks: number;
  hitboxRadius: number;
  visionRange: number;
};

export type CastleRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SnapshotMessage = {
  type: "snapshot";
  tick: number;
  serverTime: number;
  castle: {
    player1: number;
    player2: number;
  };
  castleRects: {
    player1: CastleRect;
    player2: CastleRect;
  };
  units: UnitSnapshot[];
  buildings: BuildingSnapshot[];
  creatureStats: Record<string, CreatureStatsSnapshot>;
};
