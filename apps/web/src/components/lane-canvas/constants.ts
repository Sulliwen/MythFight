export const WORLD_MIN_X = 0;
export const WORLD_MAX_X = 1000;
export const INTERPOLATION_DELAY_MS = 100;
export const ATTACK_CYCLE_TICKS = 20;

export const CASTLE_PLAYER1_TEXTURE_URL = "/sprites/JC/buildings/castle.png";
export const CASTLE_PLAYER2_TEXTURE_URL = "/sprites/JC/buildings/castle.png";

export const GOLEM_FRAME_COUNT = 6;

function buildFrameAssetUrls(basePath: string, frameCount: number): string[] {
  return Array.from({ length: frameCount }, (_, index) => `${basePath}/${index + 1}.png`);
}

export const GOLEM_WALK_FRAME_ASSET_URLS = buildFrameAssetUrls("/sprites/JC/golem/walk", GOLEM_FRAME_COUNT);
export const GOLEM_ATTACK_FRAME_ASSET_URLS = buildFrameAssetUrls("/sprites/JC/golem/attack", GOLEM_FRAME_COUNT);
export const GOLEM_HOUSE_TEXTURE_URL = "/sprites/JC/buildings/Golem_house.png";

export const WORLD_MIN_Y = 0;
export const WORLD_MAX_Y = 560;
