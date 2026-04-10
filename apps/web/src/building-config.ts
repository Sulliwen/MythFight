import type { TranslationKey } from "./i18n";
import type { ArmorType, BuildingId, CreatureId } from "./types";

export const BUILDING_IDS: BuildingId[] = ["castle", "golem_workshop", "barracks", "griffon_aery"];

export const CREATURE_TO_BUILDING: Record<CreatureId, BuildingId> = {
  golem: "golem_workshop",
  soldier: "barracks",
  griffon: "griffon_aery",
};

export type BuildingPresentation = {
  nameKey: TranslationKey;
  textureUrl: string;
  hp: number;
  hitboxWidth: number;
  hitboxHeight: number;
  spriteWidth: number;
  spriteHeight: number;
  armorType: ArmorType;
  armor: number;
  spawnsCreature?: CreatureId;
  spawnIntervalTicks?: number;
};

export const BUILDING_PRESENTATION: Record<BuildingId, BuildingPresentation> = {
  castle: {
    nameKey: "buildings.castle",
    textureUrl: "/sprites/JC/buildings/castle.png",
    hp: 1000,
    hitboxWidth: 100,
    hitboxHeight: 60,
    spriteWidth: 100,
    spriteHeight: 100,
    armorType: "fortified",
    armor: 50,
  },
  golem_workshop: {
    nameKey: "buildings.golem_workshop",
    textureUrl: "/sprites/JC/buildings/Golem_house.png",
    hp: 200,
    hitboxWidth: 70,
    hitboxHeight: 70,
    spriteWidth: 70,
    spriteHeight: 70,
    armorType: "fortified",
    armor: 10,
    spawnsCreature: "golem",
    spawnIntervalTicks: 1200,
  },
  barracks: {
    nameKey: "buildings.barracks",
    textureUrl: "/sprites/JC/buildings/barracks.png",
    hp: 140,
    hitboxWidth: 64,
    hitboxHeight: 64,
    spriteWidth: 64,
    spriteHeight: 64,
    armorType: "fortified",
    armor: 5,
    spawnsCreature: "soldier",
    spawnIntervalTicks: 600,
  },
  griffon_aery: {
    nameKey: "buildings.griffon_aery",
    textureUrl: "/sprites/JC/buildings/griffon_aery.png",
    hp: 180,
    hitboxWidth: 78,
    hitboxHeight: 78,
    spriteWidth: 78,
    spriteHeight: 78,
    armorType: "fortified",
    armor: 8,
    spawnsCreature: "griffon",
    spawnIntervalTicks: 1400,
  },
};

export function getBuildingPresentation(buildingId: BuildingId): BuildingPresentation {
  return BUILDING_PRESENTATION[buildingId];
}

export function getBuildingFootprint(buildingId: BuildingId): { width: number; height: number } {
  const p = BUILDING_PRESENTATION[buildingId];
  return { width: p.hitboxWidth, height: p.hitboxHeight };
}

export function getBuildingSpriteSize(buildingId: BuildingId): { width: number; height: number } {
  const p = BUILDING_PRESENTATION[buildingId];
  return { width: p.spriteWidth, height: p.spriteHeight };
}

/** BuildingIds that spawn creatures (i.e. not castles) */
export const SPAWNER_BUILDING_IDS = BUILDING_IDS.filter(
  (id) => BUILDING_PRESENTATION[id].spawnsCreature != null,
);
