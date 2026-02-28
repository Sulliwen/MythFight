export type PlayerId = "player1" | "player2";

export type IncomingMessage = {
  type: string;
  [key: string]: unknown;
};

export type Unit = {
  id: string;
  owner: PlayerId;
  x: number;
  vx: number;
  hp: number;
};

export type WorldState = {
  tick: number;
  nextUnitId: number;
  castle: {
    player1: number;
    player2: number;
  };
  units: Unit[];
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
  units: Unit[];
};