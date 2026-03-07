export type CreatureId = "golem";

export type CreatureStats = {
  hp: number;
  moveSpeedPerTick: number;
  attackDamage: number;
  attackIntervalTicks: number;
  attackAnimationFrameCount: number;
  attackHitFrameIndex: number;
  castleAttackPositionOffset: number;
};

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
  },
};

export function getCreatureStats(creatureId: CreatureId): CreatureStats {
  return CREATURE_STATS[creatureId];
}

export function getAttackHitOffsetTicks(creatureId: CreatureId): number {
  const stats = getCreatureStats(creatureId);
  return Math.floor((stats.attackIntervalTicks * stats.attackHitFrameIndex) / stats.attackAnimationFrameCount);
}
