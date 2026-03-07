import { AnimatedSprite, Assets, type Container, type Texture } from "pixi.js";
import { ATTACK_CYCLE_TICKS, GOLEM_ATTACK_FRAME_ASSET_URLS, GOLEM_WALK_FRAME_ASSET_URLS } from "./constants";
import type { ProjectedUnit, UnitAnimationMode, UnitSpriteEntry } from "./types";

export class UnitSpriteLayer {
  private readonly container: Container;
  private readonly entries = new Map<string, UnitSpriteEntry>();
  private walkFrames: Texture[] = [];
  private attackFrames: Texture[] = [];

  constructor(container: Container) {
    this.container = container;
  }

  async loadFrames(): Promise<void> {
    try {
      this.walkFrames = await Promise.all(
        GOLEM_WALK_FRAME_ASSET_URLS.map((frameAssetUrl) => Assets.load<Texture>(frameAssetUrl))
      );
      if (this.walkFrames.length === 0) {
        console.warn("Golem walk animation loaded without frames.");
      }

      this.attackFrames = await Promise.all(
        GOLEM_ATTACK_FRAME_ASSET_URLS.map((frameAssetUrl) => Assets.load<Texture>(frameAssetUrl))
      );
      if (this.attackFrames.length === 0) {
        console.warn("Golem attack animation loaded without frames.");
      }
    } catch (error) {
      console.error("Unable to load golem animation frames.", error);
    }
  }

  getReferenceFrameHeight(defaultHeight = 314): number {
    return this.walkFrames[0]?.height ?? this.attackFrames[0]?.height ?? defaultHeight;
  }

  renderUnits(units: ProjectedUnit[], golemScale: number, unitYOffset: number): void {
    const visibleUnitIds = new Set<string>();

    for (const unit of units) {
      visibleUnitIds.add(unit.id);

      const mode: UnitAnimationMode = unit.state === "attacking" ? "attack" : "walk";
      const textures = this.getTexturesForMode(mode);
      let entry = this.entries.get(unit.id);

      if (!entry && textures.length > 0) {
        const sprite = new AnimatedSprite({
          textures,
          animationSpeed: mode === "attack" ? 0 : 0.14,
          autoPlay: mode !== "attack",
          loop: true,
          updateAnchor: true,
        });
        sprite.anchor.set(0.5, 0.96);
        this.container.addChild(sprite);
        entry = { sprite, mode };
        this.entries.set(unit.id, entry);
      }

      if (!entry) continue;

      if (entry.mode !== mode && textures.length > 0) {
        entry.sprite.textures = textures;
        if (mode === "attack") {
          entry.sprite.animationSpeed = 0;
          entry.sprite.gotoAndStop(0);
        } else {
          entry.sprite.animationSpeed = 0.14;
          entry.sprite.gotoAndPlay(0);
        }
        entry.mode = mode;
      }

      if (mode === "attack" && textures.length > 0) {
        const cycleTick = ((unit.attackCycleTick ?? 0) + ATTACK_CYCLE_TICKS) % ATTACK_CYCLE_TICKS;
        const attackFrame = Math.floor((cycleTick / ATTACK_CYCLE_TICKS) * textures.length) % textures.length;
        if (Math.floor(entry.sprite.currentFrame) !== attackFrame) {
          entry.sprite.gotoAndStop(attackFrame);
        }
      } else if (!entry.sprite.playing) {
        entry.sprite.play();
      }

      const facingRight = Math.abs(unit.vx) > 0.001 ? unit.vx >= 0 : unit.owner === "player1";
      entry.sprite.scale.set(facingRight ? golemScale : -golemScale, golemScale);
      entry.sprite.position.set(unit.x, unit.y + unitYOffset);
      entry.sprite.zIndex = unit.y;
      entry.sprite.tint = unit.owner === "player1" ? 0xe7f2ff : 0xffecec;
    }

    for (const [unitId, entry] of this.entries.entries()) {
      if (visibleUnitIds.has(unitId)) continue;
      this.container.removeChild(entry.sprite);
      entry.sprite.destroy();
      this.entries.delete(unitId);
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      entry.sprite.parent?.removeChild(entry.sprite);
      entry.sprite.destroy();
    }
    this.entries.clear();
  }

  destroy(): void {
    this.clear();
  }

  private getTexturesForMode(mode: UnitAnimationMode): Texture[] {
    const walkTextures = this.walkFrames.length > 0 ? this.walkFrames : this.attackFrames;
    const attackTextures = this.attackFrames.length > 0 ? this.attackFrames : this.walkFrames;
    return mode === "attack" ? attackTextures : walkTextures;
  }
}
