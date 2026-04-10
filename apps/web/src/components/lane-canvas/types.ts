import type { AnimatedSprite, Graphics, Text } from "pixi.js";
import type { MutableRefObject } from "react";
import type { CreatureId, PlayerId, SelectionTarget, SnapshotMsg, Unit } from "../../types";

export type BuildMode = {
  active: boolean;
  creatureId: CreatureId;
};

export type LaneCanvasProps = {
  snapshots: SnapshotMsg[];
  showImageOutlineDebug?: boolean;
  showBuildZoneDebug?: boolean;
  showGameAreaDebug?: boolean;
  showCollisionDebug?: boolean;
  showGridDebug?: boolean;
  showAttackRangeDebug?: boolean;
  showVisionDebug?: boolean;
  showPathwayDebug?: boolean;
  buildMode?: BuildMode;
  onPlaceBuilding?: (worldX: number, worldY: number, creatureId: CreatureId) => void;
  onSelect?: (target: SelectionTarget) => void;
  controlledPlayer?: PlayerId;
};

export type LaneCanvasStateRefs = {
  snapshotsRef: MutableRefObject<SnapshotMsg[]>;
  showImageOutlineDebugRef: MutableRefObject<boolean>;
  showBuildZoneDebugRef: MutableRefObject<boolean>;
  showGameAreaDebugRef: MutableRefObject<boolean>;
  showCollisionDebugRef: MutableRefObject<boolean>;
  showGridDebugRef: MutableRefObject<boolean>;
  showAttackRangeDebugRef: MutableRefObject<boolean>;
  showVisionDebugRef: MutableRefObject<boolean>;
  showPathwayDebugRef: MutableRefObject<boolean>;
  buildModeRef: MutableRefObject<BuildMode>;
  onPlaceBuildingRef: MutableRefObject<((worldX: number, worldY: number, creatureId: CreatureId) => void) | undefined>;
  onSelectRef: MutableRefObject<((target: SelectionTarget) => void) | undefined>;
  controlledPlayerRef: MutableRefObject<PlayerId>;
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
  creatureId: CreatureId;
  owner: PlayerId;
  x: number;
  y: number;
  vx: number;
  hp: number;
  maxHp: number;
  state: Unit["state"];
  attackCycleTick?: number;
  attackIntervalTicks?: number;
  attackHitOffsetTicks?: number;
  attackTargetId?: string;
};

export type ProjectedUnit = {
  id: string;
  creatureId: CreatureId;
  owner: PlayerId;
  x: number;
  y: number;
  vx: number;
  hp: number;
  maxHp: number;
  state: Unit["state"];
  attackCycleTick?: number;
  attackIntervalTicks?: number;
  attackHitOffsetTicks?: number;
  attackTargetId?: string;
  hitboxRadius: number;
  renderScale: number;
  selectionWidth: number;
  selectionHeight: number;
};

export type ProjectedBuilding = {
  id: string;
  owner: PlayerId;
  creatureId: CreatureId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  spriteWidth: number;
  spriteHeight: number;
};

export type UnitAnimationMode = "walk" | "attack" | "idle";

export type UnitSpriteEntry = {
  sprite: AnimatedSprite;
  label: Text;
  hpBar: Graphics;
  mode: UnitAnimationMode;
  lastAttackFrame?: number;
  lastAttackCycleTick?: number;
};
