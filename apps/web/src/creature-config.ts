import type { TranslationKey } from "./i18n";
import type { CreatureId } from "./types";

export const CREATURE_IDS: CreatureId[] = ["soldier", "golem", "griffon"];
export const DEFAULT_CREATURE_ID: CreatureId = "golem";

type CreaturePresentation = {
  unitNameKey: TranslationKey;
  unitScale: number;
  attackSfxFrameIndex: number;
  frames: {
    idle: string[];
    walk: string[];
    attack: string[];
  };
  flyFrames?: {
    idle: string[];
    walk: string[];
    attack: string[];
  };
};

function buildFrameAssetUrls(basePath: string, frameCount: number): string[] {
  return Array.from({ length: frameCount }, (_, index) => `${basePath}/${index + 1}.png`);
}

export const CREATURE_PRESENTATION: Record<CreatureId, CreaturePresentation> = {
  golem: {
    unitNameKey: "units.golem",
    unitScale: 1,
    attackSfxFrameIndex: 3,
    frames: {
      idle: buildFrameAssetUrls("/sprites/JC/creatures/golem/idle", 5),
      walk: buildFrameAssetUrls("/sprites/JC/creatures/golem/walk", 6),
      attack: buildFrameAssetUrls("/sprites/JC/creatures/golem/attack", 6),
    },
  },
  soldier: {
    unitNameKey: "units.soldier",
    unitScale: 0.72,
    attackSfxFrameIndex: 3,
    frames: {
      idle: buildFrameAssetUrls("/sprites/JC/creatures/soldier/idle", 6),
      walk: buildFrameAssetUrls("/sprites/JC/creatures/soldier/walk", 6),
      attack: buildFrameAssetUrls("/sprites/JC/creatures/soldier/attack", 6),
    },
  },
  griffon: {
    unitNameKey: "units.griffon",
    unitScale: 0.88,
    attackSfxFrameIndex: 3,
    frames: {
      idle: buildFrameAssetUrls("/sprites/JC/creatures/griffon/idle", 6),
      walk: buildFrameAssetUrls("/sprites/JC/creatures/griffon/walk", 6),
      attack: buildFrameAssetUrls("/sprites/JC/creatures/griffon/attack", 6),
    },
    flyFrames: {
      idle: buildFrameAssetUrls("/sprites/JC/creatures/griffon/flight", 6),
      walk: buildFrameAssetUrls("/sprites/JC/creatures/griffon/flight", 6),
      attack: buildFrameAssetUrls("/sprites/JC/creatures/griffon/attack", 6),
    },
  },
};

export function getCreaturePresentation(creatureId: CreatureId): CreaturePresentation {
  return CREATURE_PRESENTATION[creatureId];
}
