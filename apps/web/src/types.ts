export type PlayerId = "player1" | "player2";
export type UnitState = "moving" | "attacking" | "attacking_unit";
export type CreatureId = "golem" | "soldier" | "griffon";
export type BuildingId = "castle" | "golem_workshop" | "barracks" | "griffon_aery";
export type AttackType = "normal" | "piercing" | "siege" | "magic" | "chaos" | "spells" | "hero";
export type ArmorType = "light" | "medium" | "heavy" | "fortified" | "hero" | "unarmored";

export type BuildingSnapshot = {
  id: string;
  owner: PlayerId;
  buildingId: BuildingId;
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
  attackType: AttackType;
  attackRange: number;
  attackIntervalTicks: number;
  armorType: ArmorType;
  armor: number;
  hitboxRadius: number;
  visionRange: number;
};

export type SnapshotMsg = {
  type: "snapshot";
  tick: number;
  serverTime: number;
  units: Unit[];
  buildings: BuildingSnapshot[];
  creatureStats?: Record<CreatureId, CreatureStatsSnapshot>;
};

export type PongMsg = {
  type: "pong";
  clientTime: number;
  serverTime: number;
};

export type ServerMsg = WelcomeMsg | ErrorMsg | SnapshotMsg | PongMsg;

export type SelectionTarget =
  | { kind: "building"; id: string }
  | { kind: "unit"; id: string }
  | null;
