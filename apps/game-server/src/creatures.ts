import { isArmorType, isAttackType, type ArmorType, type AttackType } from "./combat.js";

// ── Creature IDs ────────────────────────────────────────────────────────────

export const CREATURE_IDS = ["golem", "soldier", "griffon"] as const;

export type CreatureId = (typeof CREATURE_IDS)[number];

export function isCreatureId(value: unknown): value is CreatureId {
  return typeof value === "string" && CREATURE_IDS.includes(value as CreatureId);
}

// ── Building IDs ────────────────────────────────────────────────────────────

export const BUILDING_IDS = ["castle", "golem_workshop", "barracks", "griffon_aery"] as const;

export type BuildingId = (typeof BUILDING_IDS)[number];

export function isBuildingId(value: unknown): value is BuildingId {
  return typeof value === "string" && BUILDING_IDS.includes(value as BuildingId);
}

export const CREATURE_TO_BUILDING: Record<CreatureId, BuildingId> = {
  golem: "golem_workshop",
  soldier: "barracks",
  griffon: "griffon_aery",
};

// ── Creature Stats ──────────────────────────────────────────────────────────

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
  canFly: boolean;
};

export const DEFAULT_CREATURE_ID: CreatureId = "golem";

const CREATURE_STATS: Record<CreatureId, CreatureStats> = {
  golem: {
    hp: 100,
    moveSpeedPerTick: 1,
    attackDamage: 600,
    attackType: "siege",
    attackRange: 5,
    attackIntervalTicks: 100,
    attackAnimationFrameCount: 6,
    attackHitFrameIndex: 3,
    armorType: "heavy",
    armor: 50,
    hitboxRadius: 12,
    visionRange: 100,
    canFly: false,
  },
  soldier: {
    hp: 55,
    moveSpeedPerTick: 1.8,
    attackDamage: 84,
    attackType: "normal",
    attackRange: 10,
    attackIntervalTicks: 28,
    attackAnimationFrameCount: 1,
    attackHitFrameIndex: 0,
    armorType: "medium",
    armor: 4,
    hitboxRadius: 9,
    visionRange: 110,
    canFly: false,
  },
  griffon: {
    hp: 125,
    moveSpeedPerTick: 1.4,
    attackDamage: 340,
    attackType: "magic",
    attackRange: 18,
    attackIntervalTicks: 40,
    attackAnimationFrameCount: 1,
    attackHitFrameIndex: 0,
    armorType: "medium",
    armor: 2,
    hitboxRadius: 14,
    visionRange: 150,
    canFly: true,
  },
};

export function getCreatureStats(creatureId: CreatureId): CreatureStats {
  return CREATURE_STATS[creatureId];
}

export function getAttackHitOffsetTicks(creatureId: CreatureId): number {
  const stats = getCreatureStats(creatureId);
  return Math.floor((stats.attackIntervalTicks * stats.attackHitFrameIndex) / stats.attackAnimationFrameCount);
}

// ── Building Stats ──────────────────────────────────────────────────────────

export type BuildingStats = {
  hp: number;
  hitboxWidth: number;
  hitboxHeight: number;
  armorType: ArmorType;
  armor: number;
  spawnsCreature?: CreatureId;
  spawnIntervalTicks?: number;
};

const BUILDING_STATS: Record<BuildingId, BuildingStats> = {
  castle: {
    hp: 1000,
    hitboxWidth: 100,
    hitboxHeight: 60,
    armorType: "fortified",
    armor: 50,
  },
  golem_workshop: {
    hp: 200,
    hitboxWidth: 70,
    hitboxHeight: 70,
    armorType: "fortified",
    armor: 10,
    spawnsCreature: "golem",
    spawnIntervalTicks: 1200,
  },
  barracks: {
    hp: 140,
    hitboxWidth: 64,
    hitboxHeight: 64,
    armorType: "fortified",
    armor: 5,
    spawnsCreature: "soldier",
    spawnIntervalTicks: 600,
  },
  griffon_aery: {
    hp: 180,
    hitboxWidth: 78,
    hitboxHeight: 78,
    armorType: "fortified",
    armor: 8,
    spawnsCreature: "griffon",
    spawnIntervalTicks: 1400,
  },
};

export function getBuildingStats(buildingId: BuildingId): BuildingStats {
  return BUILDING_STATS[buildingId];
}

// ── Creature Stats Update (debug) ──────────────────────────────────────────

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

const BOOLEAN_CREATURE_STAT_KEYS = [
  "canFly",
] as const;

const CREATURE_STAT_KEYS = [
  ...NUMERIC_CREATURE_STAT_KEYS,
  ...BOOLEAN_CREATURE_STAT_KEYS,
  "attackType",
  "armorType",
] as const;

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

  for (const key of BOOLEAN_CREATURE_STAT_KEYS) {
    const value = rawStats[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      return { ok: false, reason: "invalid_update_creature_stats_value" };
    }
    stats[key] = value;
  }

  return { ok: true, stats };
}
