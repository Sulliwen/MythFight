export type PlayerId = "player1" | "player2";
export type UnitState = "moving" | "attacking";
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
  state: UnitState;
  attackCycleTick?: number;
  attackIntervalTicks?: number;
  attackHitOffsetTicks?: number;
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

export type SnapshotMsg = {
  type: "snapshot";
  tick: number;
  serverTime: number;
  castle: {
    player1: number;
    player2: number;
  };
  units: Unit[];
  buildings: BuildingSnapshot[];
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
