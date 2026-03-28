import type { CreatureId } from "./creatures.js";

export type PlayerId = "player1" | "player2";
export type UnitState = "moving" | "attacking";

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
  state: UnitState;
  attackCycleTick?: number;
  attackIntervalTicks?: number;
  attackHitOffsetTicks?: number;
};

export type Unit = UnitSnapshot & {
  attackCycleStartTick: number;
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

export type SnapshotMessage = {
  type: "snapshot";
  tick: number;
  serverTime: number;
  castle: {
    player1: number;
    player2: number;
  };
  units: UnitSnapshot[];
  buildings: BuildingSnapshot[];
};
