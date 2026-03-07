import type { Graphics } from "pixi.js";
import type { ProjectedUnit } from "./types";

const HITBOX_COLOR = 0xff0000;
const ROAD_HITBOX_INSET_PX = 2;
const CASTLE_HITBOX_INSET_PX = 3;
const MIN_HITBOX_SIZE_PX = 2;

export type RectHitbox = {
  kind: "rect";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
};

export type CircleHitbox = {
  kind: "circle";
  id: string;
  x: number;
  y: number;
  radius: number;
  color: number;
};

export type GameHitbox = RectHitbox | CircleHitbox;

type SceneHitboxInput = {
  road: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  castles: {
    player1: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    player2: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  units: ProjectedUnit[];
  unitHitboxRadius: number;
};

function insetRect(
  rect: { x: number; y: number; width: number; height: number },
  insetPx: number
): { x: number; y: number; width: number; height: number } {
  const width = Math.max(MIN_HITBOX_SIZE_PX, rect.width - insetPx * 2);
  const height = Math.max(MIN_HITBOX_SIZE_PX, rect.height - insetPx * 2);
  return {
    x: rect.x + insetPx,
    y: rect.y + insetPx,
    width,
    height,
  };
}

export function defineGameHitboxes(input: SceneHitboxInput): GameHitbox[] {
  const { road, castles, units, unitHitboxRadius } = input;
  const roadRect = insetRect(road, ROAD_HITBOX_INSET_PX);
  const castlePlayer1Rect = insetRect(castles.player1, CASTLE_HITBOX_INSET_PX);
  const castlePlayer2Rect = insetRect(castles.player2, CASTLE_HITBOX_INSET_PX);

  const roadHitbox: RectHitbox = {
    kind: "rect",
    id: "road",
    x: roadRect.x,
    y: roadRect.y,
    width: roadRect.width,
    height: roadRect.height,
    color: HITBOX_COLOR,
  };

  const castlePlayer1Hitbox: RectHitbox = {
    kind: "rect",
    id: "castle-player1",
    x: castlePlayer1Rect.x,
    y: castlePlayer1Rect.y,
    width: castlePlayer1Rect.width,
    height: castlePlayer1Rect.height,
    color: HITBOX_COLOR,
  };

  const castlePlayer2Hitbox: RectHitbox = {
    kind: "rect",
    id: "castle-player2",
    x: castlePlayer2Rect.x,
    y: castlePlayer2Rect.y,
    width: castlePlayer2Rect.width,
    height: castlePlayer2Rect.height,
    color: HITBOX_COLOR,
  };

  const unitHitboxes: CircleHitbox[] = units.map((unit) => ({
    kind: "circle",
    id: `unit-${unit.id}`,
    x: unit.x,
    y: unit.y,
    radius: unitHitboxRadius,
    color: HITBOX_COLOR,
  }));

  return [roadHitbox, castlePlayer1Hitbox, castlePlayer2Hitbox, ...unitHitboxes];
}

export function drawHitboxOverlay(graphics: Graphics, hitboxes: GameHitbox[]): void {
  graphics.clear();

  for (const hitbox of hitboxes) {
    if (hitbox.kind === "rect") {
      graphics.rect(hitbox.x, hitbox.y, hitbox.width, hitbox.height).stroke({
        color: HITBOX_COLOR,
        width: 2,
        alpha: 0.92,
      });
      continue;
    }

    graphics.circle(hitbox.x, hitbox.y, hitbox.radius).stroke({
      color: HITBOX_COLOR,
      width: 2,
      alpha: 0.92,
    });
  }
}
