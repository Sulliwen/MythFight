import type { CreatureId } from "./types";

export const CREATURE_IDS: CreatureId[] = ["golem", "soldier", "griffon"];
export const DEFAULT_CREATURE_ID: CreatureId = "golem";

type CreatureBuildingStats = {
  hp: number;
  hitboxWidth: number;
  hitboxHeight: number;
  spawnIntervalTicks: number;
};

type CreaturePresentation = {
  unitName: string;
  buildingName: string;
  buildingTextureUrl: string;
  unitScale: number;
  attackSfxFrameIndex: number;
  frames: {
    idle: string[];
    walk: string[];
    attack: string[];
  };
};

export const CREATURE_BUILDING_STATS: Record<CreatureId, CreatureBuildingStats> = {
  golem: {
    hp: 200,
    hitboxWidth: 70,
    hitboxHeight: 70,
    spawnIntervalTicks: 1200,
  },
  soldier: {
    hp: 140,
    hitboxWidth: 64,
    hitboxHeight: 64,
    spawnIntervalTicks: 600,
  },
  griffon: {
    hp: 180,
    hitboxWidth: 78,
    hitboxHeight: 78,
    spawnIntervalTicks: 1400,
  },
};

function buildFrameAssetUrls(basePath: string, frameCount: number): string[] {
  return Array.from({ length: frameCount }, (_, index) => `${basePath}/${index + 1}.png`);
}

export const CREATURE_PRESENTATION: Record<CreatureId, CreaturePresentation> = {
  golem: {
    unitName: "Golem",
    buildingName: "Atelier du golem",
    buildingTextureUrl: "/sprites/JC/buildings/Golem_house.png",
    unitScale: 1,
    attackSfxFrameIndex: 3,
    frames: {
      idle: buildFrameAssetUrls("/sprites/JC/creatures/golem/idle", 5),
      walk: buildFrameAssetUrls("/sprites/JC/creatures/golem/walk", 6),
      attack: buildFrameAssetUrls("/sprites/JC/creatures/golem/attack", 6),
    },
  },
  soldier: {
    unitName: "Soldat",
    buildingName: "Caserne",
    buildingTextureUrl: "/sprites/JC/buildings/barracks.png",
    unitScale: 0.72,
    attackSfxFrameIndex: 3,
    frames: {
      idle: buildFrameAssetUrls("/sprites/JC/creatures/soldier/idle", 6),
      walk: buildFrameAssetUrls("/sprites/JC/creatures/soldier/walk", 6),
      attack: buildFrameAssetUrls("/sprites/JC/creatures/soldier/attack", 6),
    },
  },
  griffon: {
    unitName: "Griffon",
    buildingName: "Perchoir",
    buildingTextureUrl: "/sprites/JC/buildings/griffon_aery.png",
    unitScale: 0.88,
    attackSfxFrameIndex: 3,
    frames: {
      idle: buildFrameAssetUrls("/sprites/JC/creatures/griffon/idle", 6),
      walk: buildFrameAssetUrls("/sprites/JC/creatures/griffon/walk", 6),
      attack: buildFrameAssetUrls("/sprites/JC/creatures/griffon/attack", 6),
    },
  },
};

export function getCreaturePresentation(creatureId: CreatureId): CreaturePresentation {
  return CREATURE_PRESENTATION[creatureId];
}

export function getBuildingFootprint(creatureId: CreatureId): { width: number; height: number } {
  const stats = CREATURE_BUILDING_STATS[creatureId];
  return { width: stats.hitboxWidth, height: stats.hitboxHeight };
}
