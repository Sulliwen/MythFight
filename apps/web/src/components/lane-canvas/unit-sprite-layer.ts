import { AnimatedSprite, Assets, type Container, Graphics, Text, type Texture } from "pixi.js";
import { ATTACK_CYCLE_TICKS, GOLEM_ATTACK_FRAME_ASSET_URLS, GOLEM_IDLE_FRAME_ASSET_URLS, GOLEM_WALK_FRAME_ASSET_URLS } from "./constants";
import type { ProjectedUnit, UnitAnimationMode, UnitSpriteEntry } from "./types";

const HP_BAR_WIDTH = 30;
const HP_BAR_HEIGHT = 3;
const HP_BAR_OFFSET_Y = -6;
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

const WALK_ANIMATION_SPEED = 0.14;
const IDLE_ANIMATION_SPEED = 0.06;
const MAX_ATTACK_TICKS_PER_FRAME_BEFORE_IDLE = 4;
const GOLEM_ATTACK_SFX_FRAME_INDEX = 3; // frame 4/6 with 0-based indexing
const ATTACK_SFX_MIN_INTERVAL_MS = 45;

type UnitAnimationSelection = {
  mode: UnitAnimationMode;
  attackFrame?: number;
};

function positiveModulo(value: number, modulo: number): number {
  if (modulo <= 0) return 0;
  const result = value % modulo;
  return result < 0 ? result + modulo : result;
}

function didCrossTick(previousTick: number, currentTick: number, targetTick: number, cycleLength: number): boolean {
  const prev = positiveModulo(previousTick, cycleLength);
  const curr = positiveModulo(currentTick, cycleLength);
  const target = positiveModulo(targetTick, cycleLength);

  if (prev === curr) return false;
  if (prev < curr) return target > prev && target <= curr;
  return target > prev || target <= curr;
}

type AttackSfxPlayer = {
  play: () => void;
  destroy: () => void;
};

function createAttackSfxPlayer(): AttackSfxPlayer {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") {
    return { play: () => undefined, destroy: () => undefined };
  }

  let audioContext: AudioContext | null = null;
  let lastPlayAt = 0;

  const ensureContext = (): AudioContext => {
    audioContext ??= new AudioContext();
    return audioContext;
  };

  const unlock = () => {
    try {
      const ctx = ensureContext();
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
    } catch (error) {
      console.warn("Unable to unlock attack SFX audio context.", error);
    }
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);

  return {
    play: () => {
      const nowMs = performance.now();
      if (nowMs - lastPlayAt < ATTACK_SFX_MIN_INTERVAL_MS) return;

      try {
        const ctx = ensureContext();
        if (ctx.state !== "running") {
          void ctx.resume();
          return;
        }

        const now = ctx.currentTime;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(210, now);
        oscillator.frequency.exponentialRampToValueAtTime(118, now + 0.075);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

        oscillator.connect(gain);
        gain.connect(ctx.destination);

        oscillator.start(now);
        oscillator.stop(now + 0.12);
        lastPlayAt = nowMs;
      } catch (error) {
        console.warn("Unable to play golem attack SFX.", error);
      }
    },
    destroy: () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    },
  };
}

export class UnitSpriteLayer {
  private readonly container: Container;
  private readonly entries = new Map<string, UnitSpriteEntry>();
  private readonly attackSfx = createAttackSfxPlayer();
  private walkFrames: Texture[] = [];
  private attackFrames: Texture[] = [];
  private idleFrames: Texture[] = [];

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

      this.idleFrames = await Promise.all(
        GOLEM_IDLE_FRAME_ASSET_URLS.map((frameAssetUrl) => Assets.load<Texture>(frameAssetUrl))
      );
      if (this.idleFrames.length === 0) {
        console.warn("Golem idle animation loaded without frames.");
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

      const animation = this.selectAnimation(unit);
      const mode = animation.mode;
      const textures = this.getTexturesForMode(mode);
      let entry = this.entries.get(unit.id);

      if (!entry && textures.length > 0) {
        const sprite = new AnimatedSprite({
          textures,
          animationSpeed: this.getAnimationSpeed(mode),
          autoPlay: mode !== "attack",
          loop: true,
          updateAnchor: true,
        });
        sprite.anchor.set(0.5, 0.96);
        this.container.addChild(sprite);

        const labelText = unit.id.replace(/^u/, "");
        const label = new Text({
          text: labelText,
          style: { fontSize: 10, fill: 0xffffff, fontFamily: "monospace" },
        });
        label.anchor.set(0.5, 0);
        this.container.addChild(label);

        const hpBar = new Graphics();
        this.container.addChild(hpBar);

        entry = { sprite, label, hpBar, mode, lastAttackFrame: undefined, lastAttackCycleTick: undefined };
        this.entries.set(unit.id, entry);
      }

      if (!entry) continue;

      if ((entry.mode !== mode || entry.sprite.textures !== textures) && textures.length > 0) {
        this.configureSpriteForMode(entry.sprite, mode, textures, animation.attackFrame);
        entry.mode = mode;
      }

      if (mode === "attack") {
        const attackFrame = animation.attackFrame ?? 0;
        if (this.shouldPlayAttackSfx(entry, unit, attackFrame)) {
          this.attackSfx.play();
        }
        if (Math.floor(entry.sprite.currentFrame) !== attackFrame) {
          entry.sprite.gotoAndStop(attackFrame);
        }
        entry.lastAttackFrame = attackFrame;
        entry.lastAttackCycleTick = unit.attackCycleTick;
      } else if (!entry.sprite.playing && textures.length > 0) {
        entry.sprite.play();
        entry.lastAttackFrame = undefined;
        entry.lastAttackCycleTick = undefined;
      } else {
        entry.lastAttackFrame = undefined;
        entry.lastAttackCycleTick = undefined;
      }

      const facingRight = Math.abs(unit.vx) > 0.001 ? unit.vx >= 0 : unit.owner === "player1";
      entry.sprite.scale.set(facingRight ? golemScale : -golemScale, golemScale);
      entry.sprite.position.set(unit.x, unit.y + unitYOffset);
      entry.sprite.zIndex = unit.y;
      entry.sprite.tint = unit.owner === "player1" ? 0xe7f2ff : 0xffecec;

      entry.label.position.set(unit.x, unit.y + unitYOffset + 4);
      entry.label.zIndex = unit.y + 0.1;

      // Draw HP bar above sprite
      const spriteHeight = entry.sprite.height;
      const ratio = unit.maxHp > 0 ? Math.max(0, unit.hp / unit.maxHp) : 0;
      const barX = unit.x - HP_BAR_WIDTH / 2;
      const barY = unit.y + unitYOffset - spriteHeight + HP_BAR_OFFSET_Y;

      const g = entry.hpBar;
      g.clear();
      g.zIndex = unit.y + 0.2;

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

    for (const [unitId, entry] of this.entries.entries()) {
      if (visibleUnitIds.has(unitId)) continue;
      this.container.removeChild(entry.sprite);
      this.container.removeChild(entry.label);
      this.container.removeChild(entry.hpBar);
      entry.sprite.destroy();
      entry.label.destroy();
      entry.hpBar.destroy();
      this.entries.delete(unitId);
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      entry.sprite.parent?.removeChild(entry.sprite);
      entry.label.parent?.removeChild(entry.label);
      entry.hpBar.parent?.removeChild(entry.hpBar);
      entry.sprite.destroy();
      entry.label.destroy();
      entry.hpBar.destroy();
    }
    this.entries.clear();
  }

  destroy(): void {
    this.clear();
    this.attackSfx.destroy();
  }

  private shouldPlayAttackSfx(entry: UnitSpriteEntry, unit: ProjectedUnit, attackFrame: number): boolean {
    if (attackFrame !== GOLEM_ATTACK_SFX_FRAME_INDEX) return false;

    const attackCycleTick = unit.attackCycleTick;
    const previousCycleTick = entry.lastAttackCycleTick;
    if (typeof attackCycleTick !== "number" || typeof previousCycleTick !== "number") {
      return entry.lastAttackFrame !== GOLEM_ATTACK_SFX_FRAME_INDEX;
    }

    const cycleLength = Math.max(1, unit.attackIntervalTicks ?? ATTACK_CYCLE_TICKS);
    const hitOffsetTick = unit.attackHitOffsetTicks ?? Math.floor((cycleLength * GOLEM_ATTACK_SFX_FRAME_INDEX) / 6);

    return didCrossTick(previousCycleTick, attackCycleTick, hitOffsetTick, cycleLength);
  }

  private selectAnimation(unit: ProjectedUnit): UnitAnimationSelection {
    if (unit.state !== "attacking" && unit.state !== "attacking_unit") {
      return { mode: "walk" };
    }

    const attackFrameCount = this.getTexturesForMode("attack").length;
    if (attackFrameCount === 0) {
      return { mode: "walk" };
    }

    const attackCycleTicks = Math.max(1, unit.attackIntervalTicks ?? ATTACK_CYCLE_TICKS);
    const cycleTick = positiveModulo(unit.attackCycleTick ?? 0, attackCycleTicks);
    const ticksPerFrame = attackCycleTicks / attackFrameCount;

    if (ticksPerFrame <= MAX_ATTACK_TICKS_PER_FRAME_BEFORE_IDLE) {
      return {
        mode: "attack",
        attackFrame: Math.floor((cycleTick / attackCycleTicks) * attackFrameCount) % attackFrameCount,
      };
    }

    const idleAwareTicksPerFrame = MAX_ATTACK_TICKS_PER_FRAME_BEFORE_IDLE;
    const activeAttackWindowTicks = attackFrameCount * idleAwareTicksPerFrame;
    const hitOffsetTick = positiveModulo(unit.attackHitOffsetTicks ?? Math.floor(attackCycleTicks / 2), attackCycleTicks);
    const hitFrameIndex = Math.max(
      0,
      Math.min(attackFrameCount - 1, Math.floor((hitOffsetTick / attackCycleTicks) * attackFrameCount))
    );
    const attackWindowStartTick = positiveModulo(
      hitOffsetTick - hitFrameIndex * idleAwareTicksPerFrame,
      attackCycleTicks
    );
    const elapsedSinceWindowStart = positiveModulo(cycleTick - attackWindowStartTick, attackCycleTicks);

    if (elapsedSinceWindowStart >= activeAttackWindowTicks) {
      return { mode: "idle" };
    }

    return {
      mode: "attack",
      attackFrame: Math.min(attackFrameCount - 1, Math.floor(elapsedSinceWindowStart / idleAwareTicksPerFrame)),
    };
  }

  private configureSpriteForMode(
    sprite: AnimatedSprite,
    mode: UnitAnimationMode,
    textures: Texture[],
    attackFrame: number | undefined
  ): void {
    sprite.textures = textures;
    sprite.animationSpeed = this.getAnimationSpeed(mode);

    if (mode === "attack") {
      sprite.gotoAndStop(attackFrame ?? 0);
      return;
    }

    sprite.gotoAndPlay(0);
  }

  private getAnimationSpeed(mode: UnitAnimationMode): number {
    if (mode === "attack") return 0;
    if (mode === "idle") return IDLE_ANIMATION_SPEED;
    return WALK_ANIMATION_SPEED;
  }

  private getTexturesForMode(mode: UnitAnimationMode): Texture[] {
    const walkTextures = this.walkFrames.length > 0 ? this.walkFrames : this.attackFrames;
    const attackTextures = this.attackFrames.length > 0 ? this.attackFrames : this.walkFrames;
    const idleTextures = this.idleFrames.length > 0 ? this.idleFrames : walkTextures;
    if (mode === "attack") {
      return attackTextures;
    }
    if (mode === "idle") {
      return idleTextures;
    }
    return walkTextures;
  }
}
