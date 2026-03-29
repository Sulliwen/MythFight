export type CreatureId = "golem";

export type CreatureStats = {
  hp: number;
  moveSpeedPerTick: number;
  attackDamage: number;
  attackIntervalTicks: number;
  attackAnimationFrameCount: number;
  attackHitFrameIndex: number;
  castleAttackPositionOffset: number;
  hitboxRadius: number;
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
    hitboxWidth: 117,
    hitboxHeight: 60,
    spawnIntervalTicks: 100, // 5 seconds at 20 TPS
  },
};

export function getBuildingStats(creatureId: CreatureId): BuildingStats {
  return BUILDING_STATS[creatureId];
}

export const DEFAULT_CREATURE_ID: CreatureId = "golem";

const CREATURE_STATS: Record<CreatureId, CreatureStats> = {
  golem: {
    hp: 1,
    moveSpeedPerTick: 8,
    attackDamage: 2,
    attackIntervalTicks: 20,
    attackAnimationFrameCount: 6,
    attackHitFrameIndex: 3, // 0-based -> frame 4/6
    castleAttackPositionOffset: 8,
    hitboxRadius: 12,
  },
};

export function getCreatureStats(creatureId: CreatureId): CreatureStats {
  return CREATURE_STATS[creatureId];
}

export function getAttackHitOffsetTicks(creatureId: CreatureId): number {
  const stats = getCreatureStats(creatureId);
  return Math.floor((stats.attackIntervalTicks * stats.attackHitFrameIndex) / stats.attackAnimationFrameCount);
}
