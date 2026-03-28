import { Assets, Container, Sprite, type Texture } from "pixi.js";
import { GOLEM_HOUSE_TEXTURE_URL } from "./constants";
import type { ProjectedBuilding } from "./types";

export class BuildingSpriteLayer {
  private readonly container: Container;
  private readonly entries = new Map<string, Sprite>();
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

  renderBuildings(buildings: ProjectedBuilding[], buildingScale: number): void {
    if (!this.texture) return;

    const visibleIds = new Set<string>();

    for (const building of buildings) {
      visibleIds.add(building.id);

      let sprite = this.entries.get(building.id);
      if (!sprite) {
        sprite = new Sprite(this.texture);
        sprite.anchor.set(0.5, 0.9);
        this.container.addChild(sprite);
        this.entries.set(building.id, sprite);
      }

      sprite.scale.set(buildingScale);
      sprite.position.set(building.x, building.y);
      sprite.zIndex = building.y;
      sprite.tint = 0xffffff;
    }

    for (const [id, sprite] of this.entries.entries()) {
      if (visibleIds.has(id)) continue;
      this.container.removeChild(sprite);
      sprite.destroy();
      this.entries.delete(id);
    }
  }

  clear(): void {
    for (const sprite of this.entries.values()) {
      sprite.parent?.removeChild(sprite);
      sprite.destroy();
    }
    this.entries.clear();
  }

  destroy(): void {
    this.clear();
  }
}
