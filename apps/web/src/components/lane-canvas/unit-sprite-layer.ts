import { AnimatedSprite, Assets, type Container, Graphics, Text, type Texture } from "pixi.js";
import { ATTACK_CYCLE_TICKS } from "./constants";
import type { ProjectedUnit, UnitAnimationMode, UnitSpriteEntry } from "./types";
import { CREATURE_IDS, getCreaturePresentation } from "../../creature-config";
import type { CreatureId } from "../../types";

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
const ATTACK_SFX_MIN_INTERVAL_MS = 45;

type UnitAnimationSelection = {
  mode: UnitAnimationMode;
  attackFrame?: number;
};

type CreatureTextureSet = {
  walk: Texture[];
  attack: Texture[];
  idle: Texture[];
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
        console.warn("Unable to play attack SFX.", error);
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
  private readonly textureSets: Record<CreatureId, CreatureTextureSet> = {
    golem: { walk: [], attack: [], idle: [] },
    soldier: { walk: [], attack: [], idle: [] },
    griffon: { walk: [], attack: [], idle: [] },
  };
  private readonly flyTextureSets: Partial<Record<CreatureId, CreatureTextureSet>> = {};

  constructor(container: Container) {
    this.container = container;
  }

  async loadFrames(): Promise<void> {
    try {
      await Promise.all(
        CREATURE_IDS.map(async (creatureId) => {
          const presentation = getCreaturePresentation(creatureId);
          const [walk, attack, idle] = await Promise.all([
            Promise.all(presentation.frames.walk.map((frameAssetUrl) => Assets.load<Texture>(frameAssetUrl))),
            Promise.all(presentation.frames.attack.map((frameAssetUrl) => Assets.load<Texture>(frameAssetUrl))),
            Promise.all(presentation.frames.idle.map((frameAssetUrl) => Assets.load<Texture>(frameAssetUrl))),
          ]);
          this.textureSets[creatureId] = { walk, attack, idle };

          if (presentation.flyFrames) {
            const [flyWalk, flyAttack, flyIdle] = await Promise.all([
              Promise.all(presentation.flyFrames.walk.map((url) => Assets.load<Texture>(url))),
              Promise.all(presentation.flyFrames.attack.map((url) => Assets.load<Texture>(url))),
              Promise.all(presentation.flyFrames.idle.map((url) => Assets.load<Texture>(url))),
            ]);
            this.flyTextureSets[creatureId] = { walk: flyWalk, attack: flyAttack, idle: flyIdle };
          }
        }),
      );
    } catch (error) {
      console.error("Unable to load unit animation frames.", error);
    }
  }

  getReferenceFrameSize(creatureId: CreatureId, defaultSize = { width: 314, height: 314 }): { width: number; height: number } {
    const textures = this.textureSets[creatureId];
    const texture = textures.walk[0] ?? textures.attack[0] ?? textures.idle[0];
    if (!texture) return defaultSize;
    return { width: texture.width, height: texture.height };
  }

  renderUnits(units: ProjectedUnit[], unitYOffset: number): void {
    const visibleUnitIds = new Set<string>();

    for (const unit of units) {
      visibleUnitIds.add(unit.id);

      const animation = this.selectAnimation(unit);
      const mode = animation.mode;
      const textures = this.getTexturesForMode(unit.creatureId, mode, unit.flying);
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

      // Debug: detect facing direction flip (trembling bug)
      const prevFacingRight = entry.sprite.scale.x > 0;
      if (prevFacingRight !== facingRight) {
        const now = performance.now();
        const lastFlipTime = (entry as any)._lastFlipTime as number | undefined;
        const flipCount = ((entry as any)._flipCount as number | undefined) ?? 0;
        const flipWindowStart = (entry as any)._flipWindowStart as number | undefined;

        if (lastFlipTime && now - lastFlipTime < 200) {
          (entry as any)._flipCount = flipCount + 1;
          if (!flipWindowStart) (entry as any)._flipWindowStart = now;
        } else {
          (entry as any)._flipCount = 1;
          (entry as any)._flipWindowStart = now;
        }
        (entry as any)._lastFlipTime = now;

        const currentFlipCount = (entry as any)._flipCount as number;
        if (currentFlipCount >= 3) {
          console.warn(
            `[FACING-FLIP] ${unit.id} flipped ${currentFlipCount}x in ${(now - ((entry as any)._flipWindowStart as number)).toFixed(0)}ms | ` +
            `vx=${unit.vx.toFixed(4)} pos=(${unit.x.toFixed(1)},${unit.y.toFixed(1)}) ` +
            `state=${unit.state} owner=${unit.owner} facingRight=${facingRight}`,
          );
        }
      }

      // Flying units float upward visually and are semi-transparent
      const flyOffset = unit.flying ? -30 : 0;

      entry.sprite.scale.set(facingRight ? unit.renderScale : -unit.renderScale, unit.renderScale);
      entry.sprite.position.set(unit.x, unit.y + unitYOffset + flyOffset);
      entry.sprite.zIndex = unit.y;
      entry.sprite.tint = unit.owner === "player1" ? 0xe7f2ff : 0xffecec;
      entry.sprite.alpha = unit.flying ? 0.7 : 1.0;

      entry.label.position.set(unit.x, unit.y + unitYOffset + flyOffset + 4);
      entry.label.zIndex = unit.y + 0.1;

      const spriteHeight = entry.sprite.height;
      const ratio = unit.maxHp > 0 ? Math.max(0, unit.hp / unit.maxHp) : 0;
      const barX = unit.x - HP_BAR_WIDTH / 2;
      const barY = unit.y + unitYOffset + flyOffset - spriteHeight + HP_BAR_OFFSET_Y;

      const g = entry.hpBar;
      g.clear();
      g.zIndex = unit.y + 0.2;
      g.rect(barX, barY, HP_BAR_WIDTH, HP_BAR_HEIGHT);
      g.fill({ color: HP_BAR_BG, alpha: 0.8 });

      const fillWidth = HP_BAR_WIDTH * ratio;
      if (fillWidth > 0) {
        g.rect(barX, barY, fillWidth, HP_BAR_HEIGHT);
        g.fill({ color: hpColor(ratio), alpha: 0.9 });
      }

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
    const sfxFrameIndex = getCreaturePresentation(unit.creatureId).attackSfxFrameIndex;
    if (attackFrame !== sfxFrameIndex) return false;

    const attackCycleTick = unit.attackCycleTick;
    const previousCycleTick = entry.lastAttackCycleTick;
    if (typeof attackCycleTick !== "number" || typeof previousCycleTick !== "number") {
      return entry.lastAttackFrame !== sfxFrameIndex;
    }

    const cycleLength = Math.max(1, unit.attackIntervalTicks ?? ATTACK_CYCLE_TICKS);
    const attackFrameCount = Math.max(1, this.getTexturesForMode(unit.creatureId, "attack", unit.flying).length);
    const hitOffsetTick = unit.attackHitOffsetTicks ?? Math.floor((cycleLength * sfxFrameIndex) / attackFrameCount);

    return didCrossTick(previousCycleTick, attackCycleTick, hitOffsetTick, cycleLength);
  }

  private selectAnimation(unit: ProjectedUnit): UnitAnimationSelection {
    if (unit.state !== "attacking" && unit.state !== "attacking_unit" && unit.state !== "attacking_building") {
      return { mode: "walk" };
    }

    const attackFrameCount = this.getTexturesForMode(unit.creatureId, "attack", unit.flying).length;
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
      Math.min(attackFrameCount - 1, Math.floor((hitOffsetTick / attackCycleTicks) * attackFrameCount)),
    );
    const attackWindowStartTick = positiveModulo(
      hitOffsetTick - hitFrameIndex * idleAwareTicksPerFrame,
      attackCycleTicks,
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
    attackFrame: number | undefined,
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

  private getTexturesForMode(creatureId: CreatureId, mode: UnitAnimationMode, flying = false): Texture[] {
    const textureSet = (flying && this.flyTextureSets[creatureId]) ? this.flyTextureSets[creatureId] : this.textureSets[creatureId];
    const walkTextures = textureSet.walk.length > 0 ? textureSet.walk : textureSet.attack;
    const attackTextures = textureSet.attack.length > 0 ? textureSet.attack : textureSet.walk;
    const idleTextures = textureSet.idle.length > 0 ? textureSet.idle : walkTextures;

    if (mode === "attack") return attackTextures;
    if (mode === "idle") return idleTextures;
    return walkTextures;
  }
}
