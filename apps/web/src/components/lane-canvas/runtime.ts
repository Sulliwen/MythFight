import { Application, Assets, Container, Graphics, Sprite, type Texture } from "pixi.js";
import { clamp, getCanvasSize } from "../../scene/iso";
import {
  CASTLE_PLAYER1_TEXTURE_URL,
  CASTLE_PLAYER2_TEXTURE_URL,
  INTERPOLATION_DELAY_MS,
  ROAD_TEXTURE_URL,
  WORLD_MAX_X,
  WORLD_MIN_X,
} from "./constants";
import { defineGameHitboxes, drawHitboxOverlay } from "./hitboxes";
import { drawImageOutlines } from "./image-outlines";
import { getInterpolationPair, interpolateUnits } from "./interpolation";
import { computeTextureTrimRatios, NO_TRIM, type TextureTrimOptions, type TextureTrimRatios } from "./texture-trim";
import { UnitSpriteLayer } from "./unit-sprite-layer";
import type { LaneCanvasRuntimeBindings, ProjectedUnit } from "./types";

const ROAD_TRIM_OPTIONS: TextureTrimOptions = {
  alphaThreshold: 24,
  minOpaquePixelsPerEdge: 6,
  paddingPx: 1,
};

const CASTLE_TRIM_OPTIONS: TextureTrimOptions = {
  alphaThreshold: 20,
  minOpaquePixelsPerEdge: 3,
  paddingPx: 1,
};

function projectUnitsToLane(
  snapshotsUnits: ReturnType<typeof interpolateUnits>,
  laneStartX: number,
  laneEndX: number,
  laneCenterY: number,
  laneHeight: number
): ProjectedUnit[] {
  return snapshotsUnits
    .map((unit) => {
      const progress = clamp((unit.x - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X), 0, 1);
      const x = laneStartX + progress * (laneEndX - laneStartX);
      const y = laneCenterY + (unit.owner === "player1" ? -laneHeight * 0.16 : laneHeight * 0.16);
      return {
        id: unit.id,
        owner: unit.owner,
        x,
        y,
        vx: unit.vx,
        state: unit.state,
        attackCycleTick: unit.attackCycleTick,
      };
    })
    .sort((left, right) => left.y - right.y);
}

export function startLaneCanvasRuntime(bindings: LaneCanvasRuntimeBindings): () => void {
  const { host, snapshotsRef, showHitboxDebugRef, showImageOutlineDebugRef } = bindings;
  let roadTrimRatios: TextureTrimRatios = NO_TRIM;
  let castlePlayer1TrimRatios: TextureTrimRatios = NO_TRIM;
  let castlePlayer2TrimRatios: TextureTrimRatios = NO_TRIM;

  let destroyed = false;
  let app: Application | null = null;
  let routeSprite: Sprite | null = null;
  let castlePlayer1Sprite: Sprite | null = null;
  let castlePlayer2Sprite: Sprite | null = null;
  let unitContainer: Container | null = null;
  let hitboxGraphics: Graphics | null = null;
  let imageOutlineGraphics: Graphics | null = null;
  let unitSpriteLayer: UnitSpriteLayer | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const renderFrame = () => {
    if (
      !app ||
      !routeSprite ||
      !castlePlayer1Sprite ||
      !castlePlayer2Sprite ||
      !unitSpriteLayer ||
      !hitboxGraphics ||
      !imageOutlineGraphics
    ) {
      return;
    }

    const width = app.screen.width;
    const height = app.screen.height;

    const laneCenterY = height * 0.62;
    const laneHeight = clamp(height * 0.13, 52, 120);
    const roadVisualHeight = routeSprite.texture.height / 3;
    const laneBottomY = laneCenterY + laneHeight * 0.5;
    const roadCenterY = laneBottomY - roadVisualHeight * (0.5 - roadTrimRatios.bottom);

    const castleHeight = clamp(height * 0.3, 92, 216);
    const castleWidthP1 = castlePlayer1Sprite.texture.width > 0
      ? (castlePlayer1Sprite.texture.width / castlePlayer1Sprite.texture.height) * castleHeight
      : castleHeight;
    const castleWidthP2 = castlePlayer2Sprite.texture.width > 0
      ? (castlePlayer2Sprite.texture.width / castlePlayer2Sprite.texture.height) * castleHeight
      : castleHeight;

    const roadVisualWidth = Math.min(routeSprite.texture.width / 3, width - 120);
    const roadCenterX = width * 0.5;
    const roadLeftX = roadCenterX - roadVisualWidth * 0.5;
    const roadOpaqueX = roadLeftX + roadVisualWidth * roadTrimRatios.left;
    const roadOpaqueY = roadCenterY - roadVisualHeight * 0.5 + roadVisualHeight * roadTrimRatios.top;
    const roadOpaqueWidth = Math.max(1, roadVisualWidth * (1 - roadTrimRatios.left - roadTrimRatios.right));
    const roadOpaqueHeight = Math.max(1, roadVisualHeight * (1 - roadTrimRatios.top - roadTrimRatios.bottom));
    const roadOpaqueLeftX = roadOpaqueX;
    const roadOpaqueRightX = roadOpaqueX + roadOpaqueWidth;
    const castleRoadGap = 0;

    const leftCastleCenterToOpaqueRightPx = castleWidthP1 * (0.5 - castlePlayer1TrimRatios.right);
    const rightCastleCenterToOpaqueLeftPx = castleWidthP2 * (0.5 - castlePlayer2TrimRatios.left);
    const leftCastleIdealX = roadOpaqueLeftX - castleRoadGap - leftCastleCenterToOpaqueRightPx;
    const rightCastleIdealX = roadOpaqueRightX + castleRoadGap + rightCastleCenterToOpaqueLeftPx;
    const leftCastleX = Math.max(castleWidthP1 * 0.5 + 8, leftCastleIdealX);
    const rightCastleX = Math.min(width - castleWidthP2 * 0.5 - 8, rightCastleIdealX);

    const castlesBaseYPlayer1 = laneBottomY + castleHeight * castlePlayer1TrimRatios.bottom;
    const castlesBaseYPlayer2 = laneBottomY + castleHeight * castlePlayer2TrimRatios.bottom;
    const castlePlayer1OpaqueX = leftCastleX - castleWidthP1 * 0.5 + castleWidthP1 * castlePlayer1TrimRatios.left;
    const castlePlayer1OpaqueY = castlesBaseYPlayer1 - castleHeight + castleHeight * castlePlayer1TrimRatios.top;
    const castlePlayer1OpaqueWidth = Math.max(
      1,
      castleWidthP1 * (1 - castlePlayer1TrimRatios.left - castlePlayer1TrimRatios.right)
    );
    const castlePlayer1OpaqueHeight = Math.max(
      1,
      castleHeight * (1 - castlePlayer1TrimRatios.top - castlePlayer1TrimRatios.bottom)
    );
    const castlePlayer2OpaqueX = rightCastleX - castleWidthP2 * 0.5 + castleWidthP2 * castlePlayer2TrimRatios.left;
    const castlePlayer2OpaqueY = castlesBaseYPlayer2 - castleHeight + castleHeight * castlePlayer2TrimRatios.top;
    const castlePlayer2OpaqueWidth = Math.max(
      1,
      castleWidthP2 * (1 - castlePlayer2TrimRatios.left - castlePlayer2TrimRatios.right)
    );
    const castlePlayer2OpaqueHeight = Math.max(
      1,
      castleHeight * (1 - castlePlayer2TrimRatios.top - castlePlayer2TrimRatios.bottom)
    );

    castlePlayer1Sprite.position.set(leftCastleX, castlesBaseYPlayer1);
    castlePlayer1Sprite.width = castleWidthP1;
    castlePlayer1Sprite.height = castleHeight;

    castlePlayer2Sprite.position.set(rightCastleX, castlesBaseYPlayer2);
    castlePlayer2Sprite.width = castleWidthP2;
    castlePlayer2Sprite.height = castleHeight;

    routeSprite.position.set(roadCenterX, roadCenterY);
    routeSprite.width = roadVisualWidth;
    routeSprite.height = roadVisualHeight;

    const renderTime = Date.now() - INTERPOLATION_DELAY_MS;
    const pair = getInterpolationPair(snapshotsRef.current, renderTime);
    let projectedUnits: ProjectedUnit[] = [];
    if (pair) {
      const interpolatedUnits = interpolateUnits(pair.a.units, pair.b.units, pair.alpha);
      projectedUnits = projectUnitsToLane(interpolatedUnits, roadOpaqueLeftX, roadOpaqueRightX, laneCenterY, laneHeight);

      const referenceFrameHeight = unitSpriteLayer.getReferenceFrameHeight();
      const golemScale = clamp((laneHeight * 0.78) / referenceFrameHeight, 0.08, 0.24);
      const unitYOffset = laneHeight * 0.1;

      unitSpriteLayer.renderUnits(projectedUnits, golemScale, unitYOffset);
    } else {
      unitSpriteLayer.clear();
    }

    if (showImageOutlineDebugRef.current) {
      drawImageOutlines(imageOutlineGraphics, [
        {
          x: roadOpaqueX,
          y: roadOpaqueY,
          width: roadOpaqueWidth,
          height: roadOpaqueHeight,
          color: 0xf59e0b,
        },
        {
          x: castlePlayer1OpaqueX,
          y: castlePlayer1OpaqueY,
          width: castlePlayer1OpaqueWidth,
          height: castlePlayer1OpaqueHeight,
          color: 0x10b981,
        },
        {
          x: castlePlayer2OpaqueX,
          y: castlePlayer2OpaqueY,
          width: castlePlayer2OpaqueWidth,
          height: castlePlayer2OpaqueHeight,
          color: 0xf43f5e,
        },
      ]);
    } else {
      imageOutlineGraphics.clear();
    }

    if (showHitboxDebugRef.current) {
      const hitboxes = defineGameHitboxes({
        road: {
          x: roadOpaqueX,
          y: roadOpaqueY,
          width: roadOpaqueWidth,
          height: roadOpaqueHeight,
        },
        castles: {
          player1: {
            x: castlePlayer1OpaqueX,
            y: castlePlayer1OpaqueY,
            width: castlePlayer1OpaqueWidth,
            height: castlePlayer1OpaqueHeight,
          },
          player2: {
            x: castlePlayer2OpaqueX,
            y: castlePlayer2OpaqueY,
            width: castlePlayer2OpaqueWidth,
            height: castlePlayer2OpaqueHeight,
          },
        },
        units: projectedUnits,
        unitHitboxRadius: laneHeight * 0.24,
      });
      drawHitboxOverlay(hitboxGraphics, hitboxes);
    } else {
      hitboxGraphics.clear();
    }

    app.canvas.style.display = "block";
    app.canvas.style.width = `${width}px`;
    app.canvas.style.height = `${height}px`;
    app.canvas.style.margin = "0 auto";
  };

  const init = async () => {
    const initialSize = getCanvasSize(host);
    const pixiApp = new Application();
    await pixiApp.init({
      width: initialSize.width,
      height: initialSize.height,
      background: 0x0f1524,
      antialias: true,
    });

    if (destroyed) {
      pixiApp.destroy(true);
      return;
    }

    app = pixiApp;
    host.appendChild(pixiApp.canvas);

    const [roadTexture, castleP1Texture, castleP2Texture] = await Promise.all([
      Assets.load<Texture>(ROAD_TEXTURE_URL),
      Assets.load<Texture>(CASTLE_PLAYER1_TEXTURE_URL),
      Assets.load<Texture>(CASTLE_PLAYER2_TEXTURE_URL),
    ]);
    const [roadTrim, castleP1Trim, castleP2Trim] = await Promise.all([
      computeTextureTrimRatios(ROAD_TEXTURE_URL, ROAD_TRIM_OPTIONS),
      computeTextureTrimRatios(CASTLE_PLAYER1_TEXTURE_URL, CASTLE_TRIM_OPTIONS),
      computeTextureTrimRatios(CASTLE_PLAYER2_TEXTURE_URL, CASTLE_TRIM_OPTIONS),
    ]);

    if (destroyed) {
      pixiApp.destroy(true);
      return;
    }

    roadTrimRatios = roadTrim;
    castlePlayer1TrimRatios = castleP1Trim;
    castlePlayer2TrimRatios = castleP2Trim;

    const sceneContainer = new Container();
    routeSprite = new Sprite(roadTexture);
    routeSprite.anchor.set(0.5);

    castlePlayer1Sprite = new Sprite(castleP1Texture);
    castlePlayer1Sprite.anchor.set(0.5, 1);

    castlePlayer2Sprite = new Sprite(castleP2Texture);
    castlePlayer2Sprite.anchor.set(0.5, 1);

    unitContainer = new Container();
    unitContainer.sortableChildren = true;
    imageOutlineGraphics = new Graphics();
    hitboxGraphics = new Graphics();

    sceneContainer.addChild(routeSprite);
    sceneContainer.addChild(castlePlayer1Sprite);
    sceneContainer.addChild(castlePlayer2Sprite);
    sceneContainer.addChild(unitContainer);
    sceneContainer.addChild(imageOutlineGraphics);
    sceneContainer.addChild(hitboxGraphics);

    pixiApp.stage.addChild(sceneContainer);

    unitSpriteLayer = new UnitSpriteLayer(unitContainer);
    await unitSpriteLayer.loadFrames();

    if (destroyed) {
      unitSpriteLayer.destroy();
      pixiApp.destroy(true);
      return;
    }

    resizeObserver = new ResizeObserver(() => {
      if (!app) return;
      const nextSize = getCanvasSize(host);
      app.renderer.resize(nextSize.width, nextSize.height);
    });
    resizeObserver.observe(host);

    pixiApp.ticker.add(renderFrame);
  };

  void init();

  return () => {
    destroyed = true;
    unitSpriteLayer?.destroy();
    resizeObserver?.disconnect();
    if (app) app.destroy(true, { children: true });
    host.innerHTML = "";
  };
}
