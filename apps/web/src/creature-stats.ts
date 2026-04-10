import type { CreatureId } from "./types";

export type CreatureDisplayStats = {
  hp: number;
  moveSpeed: number;
  attackDamage: number;
};

export const CREATURE_DISPLAY_STATS: Record<CreatureId, CreatureDisplayStats> = {
  golem: { hp: 1, moveSpeed: 8, attackDamage: 2 },
  soldier: { hp: 55, moveSpeed: 18, attackDamage: 18 },
  griffon: { hp: 125, moveSpeed: 14, attackDamage: 34 },
};
