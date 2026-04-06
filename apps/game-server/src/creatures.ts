import { isArmorType, isAttackType, type ArmorType, type AttackType } from "./combat.js";

export type CreatureId = "golem";

export function isCreatureId(value: unknown): value is CreatureId {
  return value === "golem";
}

export type CreatureStats = {
  hp: number;
  moveSpeedPerTick: number;
  attackDamage: number;
  attackType: AttackType;
  attackRange: number;
  attackIntervalTicks: number;
  attackAnimationFrameCount: number;
  attackHitFrameIndex: number;
  armorType: ArmorType;
  armor: number;
  hitboxRadius: number;
  visionRange: number;
};

export type BuildingStats = {
  hp: number;
  hitboxWidth: number;
  hitboxHeight: number;
  spawnIntervalTicks: number;
};

const BUILDING_STATS: Record<CreatureId, BuildingStats> = {
  golem: {
    hp: 200,
    hitboxWidth: 70,
    hitboxHeight: 70,
    spawnIntervalTicks: 100, // 5 seconds at 20 TPS
  },
};

export function getBuildingStats(creatureId: CreatureId): BuildingStats {
  return BUILDING_STATS[creatureId];
}

export const DEFAULT_CREATURE_ID: CreatureId = "golem";

const CREATURE_STATS: Record<CreatureId, CreatureStats> = {
  golem: {
    hp: 100,
    moveSpeedPerTick: 1,
    attackDamage: 50,
    attackType: "siege",
    attackRange: 5,
    attackIntervalTicks: 100,
    attackAnimationFrameCount: 6,
    attackHitFrameIndex: 3, // 0-based -> frame 4/6
    armorType: "heavy",
    armor: 50,
    hitboxRadius: 12,
    visionRange: 100,
  },
};

export type CreatureStatsUpdate = Partial<CreatureStats>;

type CreatureStatsUpdateValidationResult =
  | { ok: true; stats: CreatureStatsUpdate }
  | { ok: false; reason: string };

const NUMERIC_CREATURE_STAT_KEYS = [
  "hp",
  "moveSpeedPerTick",
  "attackDamage",
  "attackRange",
  "attackIntervalTicks",
  "attackAnimationFrameCount",
  "attackHitFrameIndex",
  "armor",
  "hitboxRadius",
  "visionRange",
] as const;

const CREATURE_STAT_KEYS = [
  ...NUMERIC_CREATURE_STAT_KEYS,
  "attackType",
  "armorType",
] as const;

export function getCreatureStats(creatureId: CreatureId): CreatureStats {
  return CREATURE_STATS[creatureId];
}

export function updateCreatureStats(creatureId: CreatureId, partial: CreatureStatsUpdate): void {
  const stats = CREATURE_STATS[creatureId];
  if (!stats) return;

  for (const key of CREATURE_STAT_KEYS) {
    const nextValue = partial[key];
    if (nextValue !== undefined) {
      stats[key] = nextValue as never;
    }
  }
}

export function getAttackHitOffsetTicks(creatureId: CreatureId): number {
  const stats = getCreatureStats(creatureId);
  return Math.floor((stats.attackIntervalTicks * stats.attackHitFrameIndex) / stats.attackAnimationFrameCount);
}

export function validateCreatureStatsUpdate(input: unknown): CreatureStatsUpdateValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, reason: "invalid_update_creature_stats" };
  }

  const rawStats = input as Record<string, unknown>;
  const stats: CreatureStatsUpdate = {};

  for (const key of Object.keys(rawStats)) {
    if (!CREATURE_STAT_KEYS.includes(key as (typeof CREATURE_STAT_KEYS)[number])) {
      return { ok: false, reason: "invalid_update_creature_stats_key" };
    }
  }

  for (const key of NUMERIC_CREATURE_STAT_KEYS) {
    const value = rawStats[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { ok: false, reason: "invalid_update_creature_stats_value" };
    }
    stats[key] = value;
  }

  if (rawStats.attackType !== undefined) {
    if (!isAttackType(rawStats.attackType)) {
      return { ok: false, reason: "invalid_update_creature_attack_type" };
    }
    stats.attackType = rawStats.attackType;
  }

  if (rawStats.armorType !== undefined) {
    if (!isArmorType(rawStats.armorType)) {
      return { ok: false, reason: "invalid_update_creature_armor_type" };
    }
    stats.armorType = rawStats.armorType;
  }

  return { ok: true, stats };
}
