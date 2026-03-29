export type PlayerId = "player1" | "player2";
export type UnitState = "moving" | "attacking" | "attacking_unit";
export type CreatureId = "golem";

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

export type Unit = {
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

export type WelcomeMsg = {
  type: "welcome";
  tickRate: number;
  playerId: PlayerId;
};

export type ErrorMsg = {
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

export type SnapshotMsg = {
  type: "snapshot";
  tick: number;
  serverTime: number;
  castle: {
    player1: number;
    player2: number;
  };
  castleRects?: {
    player1: CastleRect;
    player2: CastleRect;
  };
  units: Unit[];
  buildings: BuildingSnapshot[];
  creatureStats?: Record<string, CreatureStatsSnapshot>;
};

export type PongMsg = {
  type: "pong";
  clientTime: number;
  serverTime: number;
};

export type ServerMsg = WelcomeMsg | ErrorMsg | SnapshotMsg | PongMsg;

export type SelectionTarget =
  | { kind: "castle"; owner: PlayerId }
  | { kind: "building"; id: string }
  | { kind: "unit"; id: string }
  | null;
