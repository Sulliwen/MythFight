export type CreatureId = "golem";

export type CreatureStats = {
  hp: number;
  moveSpeedPerTick: number;
  attackDamage: number;
  attackRange: number;
  attackIntervalTicks: number;
  attackAnimationFrameCount: number;
  attackHitFrameIndex: number;
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
    attackRange: 5,
    attackIntervalTicks: 100,
    attackAnimationFrameCount: 6,
    attackHitFrameIndex: 3, // 0-based -> frame 4/6
    hitboxRadius: 12,
    visionRange: 100,
  },
};

export function getCreatureStats(creatureId: CreatureId): CreatureStats {
  return CREATURE_STATS[creatureId];
}

export function updateCreatureStats(creatureId: CreatureId, partial: Partial<CreatureStats>): void {
  const stats = CREATURE_STATS[creatureId];
  if (!stats) return;
  Object.assign(stats, partial);
}

export function getAttackHitOffsetTicks(creatureId: CreatureId): number {
  const stats = getCreatureStats(creatureId);
  return Math.floor((stats.attackIntervalTicks * stats.attackHitFrameIndex) / stats.attackAnimationFrameCount);
}
