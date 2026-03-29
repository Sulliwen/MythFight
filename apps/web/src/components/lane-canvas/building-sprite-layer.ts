import { Assets, Container, Graphics, Sprite, type Texture } from "pixi.js";
import { GOLEM_HOUSE_TEXTURE_URL } from "./constants";
import type { ProjectedBuilding } from "./types";

const HP_BAR_WIDTH = 40;
const HP_BAR_HEIGHT = 4;
const HP_BAR_OFFSET_Y = -8;
const HP_BAR_BG = 0x1e293b;
const HP_BAR_BORDER = 0x475569;
const HP_BAR_FILL_HIGH = 0x22c55e;
const HP_BAR_FILL_MID = 0xf59e0b;
const HP_BAR_FILL_LOW = 0xef4444;

function hpColor(ratio: number): number {
  if (ratio > 0.6) return HP_BAR_FILL_HIGH;
  if (ratio > 0.3) return HP_BAR_FILL_MID;
  return HP_BAR_FILL_LOW;
}

type BuildingEntry = {
  sprite: Sprite;
  hpBar: Graphics;
};

export class BuildingSpriteLayer {
  private readonly container: Container;
  private readonly entries = new Map<string, BuildingEntry>();
  private texture: Texture | null = null;

  constructor(container: Container) {
    this.container = container;
  }

  async loadTextures(): Promise<void> {
    try {
      this.texture = await Assets.load<Texture>(GOLEM_HOUSE_TEXTURE_URL);
    } catch (error) {
      console.error("Unable to load building textures.", error);
    }
  }

  renderBuildings(buildings: ProjectedBuilding[]): void {
    if (!this.texture) return;

    const visibleIds = new Set<string>();

    for (const building of buildings) {
      visibleIds.add(building.id);

      let entry = this.entries.get(building.id);
      if (!entry) {
        const sprite = new Sprite(this.texture);
        sprite.anchor.set(0.5, 0.5);

        const hpBar = new Graphics();
        this.container.addChild(sprite);
        this.container.addChild(hpBar);
        entry = { sprite, hpBar };
        this.entries.set(building.id, entry);
      }

      // Size sprite to match world hitbox dimensions (already in screen pixels)
      entry.sprite.width = building.spriteWidth;
      entry.sprite.height = building.spriteHeight;
      entry.sprite.position.set(building.x, building.y);
      entry.sprite.zIndex = building.y;
      entry.sprite.tint = 0xffffff;

      // Draw HP bar above the building sprite
      const ratio = building.maxHp > 0 ? Math.max(0, building.hp / building.maxHp) : 0;
      const barX = building.x - HP_BAR_WIDTH / 2;
      const barY = building.y - building.spriteHeight / 2 + HP_BAR_OFFSET_Y;

      const g = entry.hpBar;
      g.clear();
      g.zIndex = building.y + 0.1;

      // Background
      g.rect(barX, barY, HP_BAR_WIDTH, HP_BAR_HEIGHT);
      g.fill({ color: HP_BAR_BG, alpha: 0.8 });

      // Fill
      const fillWidth = HP_BAR_WIDTH * ratio;
      if (fillWidth > 0) {
        g.rect(barX, barY, fillWidth, HP_BAR_HEIGHT);
        g.fill({ color: hpColor(ratio), alpha: 0.9 });
      }

      // Border
      g.rect(barX, barY, HP_BAR_WIDTH, HP_BAR_HEIGHT);
      g.stroke({ color: HP_BAR_BORDER, width: 1, alpha: 0.6 });
    }

    for (const [id, entry] of this.entries.entries()) {
      if (visibleIds.has(id)) continue;
      this.container.removeChild(entry.sprite);
      this.container.removeChild(entry.hpBar);
      entry.sprite.destroy();
      entry.hpBar.destroy();
      this.entries.delete(id);
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      entry.sprite.parent?.removeChild(entry.sprite);
      entry.hpBar.parent?.removeChild(entry.hpBar);
      entry.sprite.destroy();
      entry.hpBar.destroy();
    }
    this.entries.clear();
  }

  destroy(): void {
    this.clear();
  }
}
