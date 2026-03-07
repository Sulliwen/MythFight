import type { AnimatedSprite } from "pixi.js";
import type { MutableRefObject } from "react";
import type { PlayerId, SnapshotMsg, Unit } from "../../types";

export type LaneCanvasProps = {
  snapshots: SnapshotMsg[];
  showHitboxDebug?: boolean;
  showImageOutlineDebug?: boolean;
};

export type LaneCanvasStateRefs = {
  snapshotsRef: MutableRefObject<SnapshotMsg[]>;
  showHitboxDebugRef: MutableRefObject<boolean>;
  showImageOutlineDebugRef: MutableRefObject<boolean>;
};

export type LaneCanvasRuntimeBindings = LaneCanvasStateRefs & {
  host: HTMLDivElement;
};

export type InterpolationPair = {
  a: SnapshotMsg;
  b: SnapshotMsg;
  alpha: number;
};

export type InterpolatedUnit = {
  id: string;
  owner: PlayerId;
  x: number;
  vx: number;
  state: Unit["state"];
  attackCycleTick?: number;
};

export type ProjectedUnit = {
  id: string;
  owner: PlayerId;
  x: number;
  y: number;
  vx: number;
  state: Unit["state"];
  attackCycleTick?: number;
};

export type UnitAnimationMode = "walk" | "attack";

export type UnitSpriteEntry = {
  sprite: AnimatedSprite;
  mode: UnitAnimationMode;
};
