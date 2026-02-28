export type PlayerId = "player1" | "player2";

export type Unit = {
  id: string;
  owner: PlayerId;
  x: number;
  vx: number;
  hp: number;
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
};

export type PongMsg = {
  type: "pong";
  clientTime: number;
  serverTime: number;
};

export type ServerMsg = WelcomeMsg | ErrorMsg | SnapshotMsg | PongMsg;
