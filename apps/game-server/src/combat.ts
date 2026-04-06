export const ATTACK_TYPES = [
  "normal",
  "piercing",
  "siege",
  "magic",
  "chaos",
  "spells",
  "hero",
] as const;

export type AttackType = (typeof ATTACK_TYPES)[number];

export const ARMOR_TYPES = [
  "light",
  "medium",
  "heavy",
  "fortified",
  "hero",
  "unarmored",
] as const;

export type ArmorType = (typeof ARMOR_TYPES)[number];

export type DefenseProfile = {
  armorType: ArmorType;
  armor: number;
};

type DamageMultiplierTable = Record<AttackType, Record<ArmorType, number>>;

const DAMAGE_MULTIPLIERS: DamageMultiplierTable = {
  normal: {
    light: 1,
    medium: 1.5,
    heavy: 1,
    fortified: 0.7,
    hero: 1,
    unarmored: 1,
  },
  piercing: {
    light: 2,
    medium: 0.75,
    heavy: 0.9,
    fortified: 0.35,
    hero: 0.5,
    unarmored: 1.5,
  },
  siege: {
    light: 1,
    medium: 0.5,
    heavy: 1,
    fortified: 1.5,
    hero: 0.5,
    unarmored: 1.5,
  },
  magic: {
    light: 1.25,
    medium: 0.75,
    heavy: 2,
    fortified: 0.35,
    hero: 0.5,
    unarmored: 1,
  },
  chaos: {
    light: 1,
    medium: 1,
    heavy: 1,
    fortified: 1,
    hero: 1,
    unarmored: 1,
  },
  spells: {
    light: 1,
    medium: 1,
    heavy: 1,
    fortified: 1,
    hero: 0.7,
    unarmored: 1,
  },
  hero: {
    light: 1,
    medium: 1,
    heavy: 1,
    fortified: 0.5,
    hero: 1,
    unarmored: 1,
  },
};

export const CASTLE_DEFENSE_PROFILE: DefenseProfile = {
  armorType: "fortified",
  armor: 5,
};

export function isAttackType(value: unknown): value is AttackType {
  return typeof value === "string" && ATTACK_TYPES.includes(value as AttackType);
}

export function isArmorType(value: unknown): value is ArmorType {
  return typeof value === "string" && ARMOR_TYPES.includes(value as ArmorType);
}

export function getDamageTypeMultiplier(attackType: AttackType, armorType: ArmorType): number {
  return DAMAGE_MULTIPLIERS[attackType][armorType];
}

export function getArmorDamageMultiplier(armor: number): number {
  if (armor >= 0) {
    const reduction = (0.06 * armor) / (1 + 0.06 * armor);
    return 1 - reduction;
  }

  return 2 - 0.94 ** (-armor);
}

export function resolveDamage(baseDamage: number, attackType: AttackType, defense: DefenseProfile): number {
  return baseDamage * getDamageTypeMultiplier(attackType, defense.armorType) * getArmorDamageMultiplier(defense.armor);
}
