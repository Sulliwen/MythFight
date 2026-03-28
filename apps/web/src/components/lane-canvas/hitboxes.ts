import type { Graphics } from "pixi.js";
import type { ProjectedBuilding, ProjectedUnit } from "./types";

const HITBOX_COLOR = 0xff0000;
const CASTLE_HITBOX_INSET_PX = 3;
const MIN_HITBOX_SIZE_PX = 2;

export type RectHitbox = {
  kind: "rect";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CircleHitbox = {
  kind: "circle";
  id: string;
  x: number;
  y: number;
  radius: number;
};

export type GameHitbox = RectHitbox | CircleHitbox;

type SceneHitboxInput = {
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
  buildings: ProjectedBuilding[];
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
  const { castles, buildings, units, unitHitboxRadius } = input;
  const castlePlayer1Rect = insetRect(castles.player1, CASTLE_HITBOX_INSET_PX);
  const castlePlayer2Rect = insetRect(castles.player2, CASTLE_HITBOX_INSET_PX);

  const castlePlayer1Hitbox: RectHitbox = {
    kind: "rect",
    id: "castle-player1",
    x: castlePlayer1Rect.x,
    y: castlePlayer1Rect.y,
    width: castlePlayer1Rect.width,
    height: castlePlayer1Rect.height,
  };

  const castlePlayer2Hitbox: RectHitbox = {
    kind: "rect",
    id: "castle-player2",
    x: castlePlayer2Rect.x,
    y: castlePlayer2Rect.y,
    width: castlePlayer2Rect.width,
    height: castlePlayer2Rect.height,
  };

  const buildingHitboxes: RectHitbox[] = buildings.map((b) => {
    const w = b.spriteWidth;
    const h = b.spriteHeight;
    return {
      kind: "rect",
      id: `building-${b.id}`,
      x: b.x - w * 0.5,
      y: b.y - h * 0.9,
      width: w,
      height: h,
    };
  });

  const unitHitboxes: CircleHitbox[] = units.map((unit) => ({
    kind: "circle",
    id: `unit-${unit.id}`,
    x: unit.x,
    y: unit.y,
    radius: unitHitboxRadius,
  }));

  return [castlePlayer1Hitbox, castlePlayer2Hitbox, ...buildingHitboxes, ...unitHitboxes];
}

export function hitTest(x: number, y: number, hitboxes: GameHitbox[]): GameHitbox | null {
  for (let i = hitboxes.length - 1; i >= 0; i--) {
    const hb = hitboxes[i];
    if (hb.kind === "rect") {
      if (x >= hb.x && x <= hb.x + hb.width && y >= hb.y && y <= hb.y + hb.height) return hb;
    } else {
      const dx = x - hb.x;
      const dy = y - hb.y;
      if (dx * dx + dy * dy <= hb.radius * hb.radius) return hb;
    }
  }
  return null;
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
