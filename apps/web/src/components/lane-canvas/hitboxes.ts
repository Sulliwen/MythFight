import type { ProjectedBuilding, ProjectedUnit } from "./types";

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
  buildings: ProjectedBuilding[];
  units: ProjectedUnit[];
};

export function defineGameHitboxes(input: SceneHitboxInput): GameHitbox[] {
  const { buildings, units } = input;

  const buildingHitboxes: RectHitbox[] = buildings.map((b) => ({
    kind: "rect",
    id: `building-${b.id}`,
    x: b.x - b.spriteWidth * 0.5,
    y: b.y - b.spriteHeight * 0.5,
    width: b.spriteWidth,
    height: b.spriteHeight,
  }));

  const unitHitboxes: RectHitbox[] = units.map((unit) => {
    const width = Math.max(unit.hitboxRadius * 2, unit.selectionWidth);
    const height = Math.max(unit.hitboxRadius * 2, unit.selectionHeight);
    return {
      kind: "rect",
      id: `unit-${unit.id}`,
      x: unit.x - width / 2,
      y: unit.y - height * 0.96,
      width,
      height,
    };
  });

  return [...buildingHitboxes, ...unitHitboxes];
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
