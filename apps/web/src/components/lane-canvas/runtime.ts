import { Application, Assets, Container, Graphics, Sprite, type Texture } from "pixi.js";
import {
  CASTLE_PLAYER1_TEXTURE_URL,
  CASTLE_PLAYER2_TEXTURE_URL,
  GOLEM_HOUSE_TEXTURE_URL,
  INTERPOLATION_DELAY_MS,
  PLAYER1_LANE_OFFSET_RATIO,
  PLAYER2_LANE_OFFSET_RATIO,
  WORLD_MAX_X,
  WORLD_MAX_Y,
  WORLD_MIN_X,
  WORLD_MIN_Y,
} from "./constants";
import { BuildingSpriteLayer } from "./building-sprite-layer";
import { defineGameHitboxes, drawHitboxOverlay, hitTest, type GameHitbox } from "./hitboxes";
import { drawImageOutlines } from "./image-outlines";
import { getInterpolationPair, interpolateUnits } from "./interpolation";
import { clamp, getCanvasSize } from "./math";
import { computeTextureTrimRatios, NO_TRIM, type TextureTrimOptions, type TextureTrimRatios } from "./texture-trim";
import { UnitSpriteLayer } from "./unit-sprite-layer";
import type { LaneCanvasRuntimeBindings, ProjectedBuilding, ProjectedUnit } from "./types";

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
      const y = laneCenterY + laneHeight * (unit.owner === "player1" ? PLAYER1_LANE_OFFSET_RATIO : PLAYER2_LANE_OFFSET_RATIO);
      return {
        id: unit.id,
        owner: unit.owner,
        x,
        y,
        vx: unit.vx,
        state: unit.state,
        attackCycleTick: unit.attackCycleTick,
        attackIntervalTicks: unit.attackIntervalTicks,
        attackHitOffsetTicks: unit.attackHitOffsetTicks,
      };
    })
    .sort((left, right) => left.y - right.y);
}

const BUILDING_HITBOX_RADIUS = 40; // must match server BuildingStats

// Convert screen coordinates to world coordinates, clamping to valid building placement bounds
function screenToWorld(
  screenX: number,
  screenY: number,
  gameAreaX: number,
  gameAreaY: number,
  gameAreaWidth: number,
  gameAreaHeight: number,
): { worldX: number; worldY: number } {
  const rawX = WORLD_MIN_X + ((screenX - gameAreaX) / gameAreaWidth) * (WORLD_MAX_X - WORLD_MIN_X);
  const rawY = WORLD_MIN_Y + ((screenY - gameAreaY) / gameAreaHeight) * (WORLD_MAX_Y - WORLD_MIN_Y);
  const worldX = clamp(rawX, WORLD_MIN_X + BUILDING_HITBOX_RADIUS, WORLD_MAX_X - BUILDING_HITBOX_RADIUS);
  const worldY = clamp(rawY, WORLD_MIN_Y + BUILDING_HITBOX_RADIUS, WORLD_MAX_Y - BUILDING_HITBOX_RADIUS);
  return { worldX, worldY };
}

function isValidBuildingPlacement(worldX: number, player: "player1" | "player2"): boolean {
  const midX = (WORLD_MIN_X + WORLD_MAX_X) / 2;
  return player === "player1" ? worldX <= midX : worldX >= midX;
}

// Convert world coordinates to screen coordinates
function worldToScreen(
  worldX: number,
  worldY: number,
  gameAreaX: number,
  gameAreaY: number,
  gameAreaWidth: number,
  gameAreaHeight: number,
): { screenX: number; screenY: number } {
  const screenX = gameAreaX + ((worldX - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X)) * gameAreaWidth;
  const screenY = gameAreaY + ((worldY - WORLD_MIN_Y) / (WORLD_MAX_Y - WORLD_MIN_Y)) * gameAreaHeight;
  return { screenX, screenY };
}

export function startLaneCanvasRuntime(bindings: LaneCanvasRuntimeBindings): () => void {
  const {
    host,
    snapshotsRef,
    showHitboxDebugRef,
    showImageOutlineDebugRef,
    showBuildZoneDebugRef,
    showGameAreaDebugRef,
    buildModeRef,
    onPlaceBuildingRef,
    onSelectRef,
    controlledPlayerRef,
  } = bindings;
  let currentHitboxes: GameHitbox[] = [];
  let castlePlayer1TrimRatios: TextureTrimRatios = NO_TRIM;
  let castlePlayer2TrimRatios: TextureTrimRatios = NO_TRIM;

  let destroyed = false;
  let app: Application | null = null;
  let castlePlayer1Sprite: Sprite | null = null;
  let castlePlayer2Sprite: Sprite | null = null;
  let unitContainer: Container | null = null;
  let buildingContainer: Container | null = null;
  let hitboxGraphics: Graphics | null = null;
  let imageOutlineGraphics: Graphics | null = null;
  let unitSpriteLayer: UnitSpriteLayer | null = null;
  let buildingSpriteLayer: BuildingSpriteLayer | null = null;
  let ghostSprite: Sprite | null = null;
  let ghostTexture: Texture | null = null;
  let castleHpGraphics: Graphics | null = null;
  let buildZoneGraphics: Graphics | null = null;
  let gameAreaGraphics: Graphics | null = null;
  let resizeObserver: ResizeObserver | null = null;

  // Track current game area for coordinate conversion
  let currentGameArea = { x: 0, y: 0, width: 1, height: 1 };
  // Track mouse position in screen space
  let mouseScreenX = 0;
  let mouseScreenY = 0;
  let mouseInCanvas = false;

  const onPointerMove = (event: PointerEvent) => {
    const canvas = app?.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseScreenX = event.clientX - rect.left;
    mouseScreenY = event.clientY - rect.top;
    mouseInCanvas = true;
  };

  const onPointerLeave = () => {
    mouseInCanvas = false;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;

    const canvas = app?.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;

    if (buildModeRef.current.active) {
      const { worldX, worldY } = screenToWorld(
        sx, sy,
        currentGameArea.x, currentGameArea.y,
        currentGameArea.width, currentGameArea.height,
      );
      onPlaceBuildingRef.current?.(worldX, worldY, buildModeRef.current.creatureId);
      return;
    }

    // Selection mode
    const hit = hitTest(sx, sy, currentHitboxes);
    if (!hit) {
      onSelectRef.current?.(null);
      return;
    }
    if (hit.id.startsWith("castle-")) {
      const owner = hit.id.replace("castle-", "") as "player1" | "player2";
      onSelectRef.current?.({ kind: "castle", owner });
    } else if (hit.id.startsWith("building-")) {
      onSelectRef.current?.({ kind: "building", id: hit.id.replace("building-", "") });
    } else if (hit.id.startsWith("unit-")) {
      onSelectRef.current?.({ kind: "unit", id: hit.id.replace("unit-", "") });
    }
  };

  const renderFrame = () => {
    if (
      !app ||
      !castlePlayer1Sprite ||
      !castlePlayer2Sprite ||
      !unitSpriteLayer ||
      !buildingSpriteLayer ||
      !hitboxGraphics ||
      !imageOutlineGraphics
    ) {
      return;
    }

    const width = app.screen.width;
    const height = app.screen.height;

    const laneCenterY = height * 0.62;
    const laneHeight = clamp(height * 0.13, 52, 120);
    const castleHeight = clamp(height * 0.3, 92, 216);
    const castleWidthP1 = castlePlayer1Sprite.texture.width > 0
      ? (castlePlayer1Sprite.texture.width / castlePlayer1Sprite.texture.height) * castleHeight
      : castleHeight;
    const castleWidthP2 = castlePlayer2Sprite.texture.width > 0
      ? (castlePlayer2Sprite.texture.width / castlePlayer2Sprite.texture.height) * castleHeight
      : castleHeight;

    // Place castles near screen edges
    const castleMargin = 8;
    const leftCastleX = castleWidthP1 * 0.5 + castleMargin;
    const rightCastleX = width - castleWidthP2 * 0.5 - castleMargin;

    // Lane spans between the opaque inner edges of each castle
    const laneLeftX = leftCastleX + castleWidthP1 * (0.5 - castlePlayer1TrimRatios.right);
    const laneRightX = rightCastleX - castleWidthP2 * (0.5 - castlePlayer2TrimRatios.left);

    // Center castles vertically on screen (anchor is 0.5, 1 so base = center + half opaque height)
    const castleOpaqueHeightP1 = castleHeight * (1 - castlePlayer1TrimRatios.top - castlePlayer1TrimRatios.bottom);
    const castleOpaqueHeightP2 = castleHeight * (1 - castlePlayer2TrimRatios.top - castlePlayer2TrimRatios.bottom);
    const castlesBaseYPlayer1 = height * 0.5 + castleOpaqueHeightP1 * 0.5 + castleHeight * castlePlayer1TrimRatios.bottom;
    const castlesBaseYPlayer2 = height * 0.5 + castleOpaqueHeightP2 * 0.5 + castleHeight * castlePlayer2TrimRatios.bottom;

    // Define game area for coordinate mapping: the entire visible canvas
    const gameAreaX = 0;
    const gameAreaY = 0;
    const gameAreaWidth = width;
    const gameAreaHeight = height;
    currentGameArea = { x: gameAreaX, y: gameAreaY, width: gameAreaWidth, height: gameAreaHeight };

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

    // Draw castle HP bars
    const CASTLE_HP_MAX = 1000;
    const CASTLE_HP_BAR_W = 60;
    const CASTLE_HP_BAR_H = 6;
    const renderTime = Date.now() - INTERPOLATION_DELAY_MS;
    const pair = getInterpolationPair(snapshotsRef.current, renderTime);

    if (castleHpGraphics) {
      castleHpGraphics.clear();
      if (pair) {
        const castleHp = pair.b.castle;
        const drawCastleHpBar = (cx: number, topY: number, hp: number) => {
          const ratio = clamp(hp / CASTLE_HP_MAX, 0, 1);
          const barX = cx - CASTLE_HP_BAR_W / 2;
          const barY = topY - 12;
          castleHpGraphics!.rect(barX, barY, CASTLE_HP_BAR_W, CASTLE_HP_BAR_H);
          castleHpGraphics!.fill({ color: 0x1e293b, alpha: 0.8 });
          const fillW = CASTLE_HP_BAR_W * ratio;
          if (fillW > 0) {
            const color = ratio > 0.6 ? 0x22c55e : ratio > 0.3 ? 0xf59e0b : 0xef4444;
            castleHpGraphics!.rect(barX, barY, fillW, CASTLE_HP_BAR_H);
            castleHpGraphics!.fill({ color, alpha: 0.9 });
          }
          castleHpGraphics!.rect(barX, barY, CASTLE_HP_BAR_W, CASTLE_HP_BAR_H);
          castleHpGraphics!.stroke({ color: 0x475569, width: 1, alpha: 0.6 });
        };
        const castleTopY1 = castlesBaseYPlayer1 - castleHeight * (1 - castlePlayer1TrimRatios.top);
        const castleTopY2 = castlesBaseYPlayer2 - castleHeight * (1 - castlePlayer2TrimRatios.top);
        drawCastleHpBar(leftCastleX, castleTopY1, castleHp.player1);
        drawCastleHpBar(rightCastleX, castleTopY2, castleHp.player2);
      }
    }

    // Render buildings from snapshot
    const buildingScale = clamp((laneHeight * 0.6) / 256, 0.05, 0.3);

    let projectedBuildings: ProjectedBuilding[] = [];
    if (pair) {
      const latestSnapshot = pair.b;
      projectedBuildings = (latestSnapshot.buildings ?? []).map((b) => {
        const { screenX, screenY } = worldToScreen(b.x, b.y, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
        const tw = ghostTexture ? ghostTexture.width * buildingScale : 0;
        const th = ghostTexture ? ghostTexture.height * buildingScale : 0;
        return { id: b.id, owner: b.owner, creatureId: b.creatureId, x: screenX, y: screenY, hp: b.hp, maxHp: b.maxHp, spriteWidth: tw, spriteHeight: th };
      });
      buildingSpriteLayer.renderBuildings(projectedBuildings, buildingScale);
    } else {
      buildingSpriteLayer.clear();
    }

    // Render ghost sprite in build mode (snap to clamped world position)
    if (ghostSprite && ghostTexture) {
      if (buildModeRef.current.active && mouseInCanvas) {
        const { worldX, worldY } = screenToWorld(
          mouseScreenX, mouseScreenY,
          gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight,
        );
        const { screenX: snappedX, screenY: snappedY } = worldToScreen(
          worldX, worldY,
          gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight,
        );

        ghostSprite.visible = true;
        ghostSprite.position.set(snappedX, snappedY);
        ghostSprite.scale.set(buildingScale);

        const valid = isValidBuildingPlacement(worldX, controlledPlayerRef.current);
        ghostSprite.tint = valid ? 0x44ff44 : 0xff4444;
        ghostSprite.alpha = 0.6;
      } else {
        ghostSprite.visible = false;
      }
    }

    // Draw build zone outline when overlay setting is enabled
    if (buildZoneGraphics) {
      buildZoneGraphics.clear();
      if (showBuildZoneDebugRef.current) {
        const player = controlledPlayerRef.current;
        const halfWidth = gameAreaWidth / 2;
        const zoneX = player === "player1" ? gameAreaX : gameAreaX + halfWidth;
        const zoneW = halfWidth;

        const borderColor = player === "player1" ? 0x4a9eff : 0xff6b6b;
        // Filled background
        buildZoneGraphics.rect(zoneX, gameAreaY, zoneW, gameAreaHeight);
        buildZoneGraphics.fill({ color: borderColor, alpha: 0.08 });
        // Border outline
        buildZoneGraphics.rect(zoneX, gameAreaY, zoneW, gameAreaHeight);
        buildZoneGraphics.stroke({ color: borderColor, width: 2, alpha: 0.6 });
      }
    }

    // Draw game area outline when overlay setting is enabled
    if (gameAreaGraphics) {
      gameAreaGraphics.clear();
      if (showGameAreaDebugRef.current) {
        gameAreaGraphics.rect(gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
        gameAreaGraphics.stroke({ color: 0xffa500, width: 2, alpha: 0.7 });
      }
    }

    // Update cursor style
    if (app.canvas) {
      app.canvas.style.cursor = buildModeRef.current.active ? "crosshair" : "default";
    }

    let projectedUnits: ProjectedUnit[] = [];
    if (pair) {
      const interpolatedUnits = interpolateUnits(pair.a.units, pair.b.units, pair.alpha);
      projectedUnits = projectUnitsToLane(interpolatedUnits, laneLeftX, laneRightX, laneCenterY, laneHeight);

      const referenceFrameHeight = unitSpriteLayer.getReferenceFrameHeight();
      const golemScale = clamp((laneHeight * 0.78) / referenceFrameHeight, 0.08, 0.24);
      const unitYOffset = laneHeight * 0.1;

      unitSpriteLayer.renderUnits(projectedUnits, golemScale, unitYOffset);
    } else {
      unitSpriteLayer.clear();
    }

    if (showImageOutlineDebugRef.current) {
      const buildingOutlines = projectedBuildings.map((b) => ({
        x: b.x - b.spriteWidth * 0.5,
        y: b.y - b.spriteHeight * 0.9,
        width: b.spriteWidth,
        height: b.spriteHeight,
      }));
      drawImageOutlines(imageOutlineGraphics, [
        {
          x: castlePlayer1OpaqueX,
          y: castlePlayer1OpaqueY,
          width: castlePlayer1OpaqueWidth,
          height: castlePlayer1OpaqueHeight,
        },
        {
          x: castlePlayer2OpaqueX,
          y: castlePlayer2OpaqueY,
          width: castlePlayer2OpaqueWidth,
          height: castlePlayer2OpaqueHeight,
        },
        ...buildingOutlines,
      ]);
    } else {
      imageOutlineGraphics.clear();
    }

    currentHitboxes = defineGameHitboxes({
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
      buildings: projectedBuildings,
      units: projectedUnits,
      unitHitboxRadius: laneHeight * 0.24,
    });

    if (showHitboxDebugRef.current) {
      drawHitboxOverlay(hitboxGraphics, currentHitboxes);
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

    // Register pointer events on the canvas
    pixiApp.canvas.addEventListener("pointermove", onPointerMove);
    pixiApp.canvas.addEventListener("pointerleave", onPointerLeave);
    pixiApp.canvas.addEventListener("pointerdown", onPointerDown);

    const [castleP1Texture, castleP2Texture, golemHouseTexture] = await Promise.all([
      Assets.load<Texture>(CASTLE_PLAYER1_TEXTURE_URL),
      Assets.load<Texture>(CASTLE_PLAYER2_TEXTURE_URL),
      Assets.load<Texture>(GOLEM_HOUSE_TEXTURE_URL),
    ]);
    const [castleP1Trim, castleP2Trim] = await Promise.all([
      computeTextureTrimRatios(CASTLE_PLAYER1_TEXTURE_URL, CASTLE_TRIM_OPTIONS),
      computeTextureTrimRatios(CASTLE_PLAYER2_TEXTURE_URL, CASTLE_TRIM_OPTIONS),
    ]);

    if (destroyed) {
      pixiApp.destroy(true);
      return;
    }

    castlePlayer1TrimRatios = castleP1Trim;
    castlePlayer2TrimRatios = castleP2Trim;
    ghostTexture = golemHouseTexture;

    const sceneContainer = new Container();

    castlePlayer1Sprite = new Sprite(castleP1Texture);
    castlePlayer1Sprite.anchor.set(0.5, 1);

    castlePlayer2Sprite = new Sprite(castleP2Texture);
    castlePlayer2Sprite.anchor.set(0.5, 1);

    buildingContainer = new Container();
    buildingContainer.sortableChildren = true;

    unitContainer = new Container();
    unitContainer.sortableChildren = true;

    // Ghost sprite for build mode preview
    ghostSprite = new Sprite(golemHouseTexture);
    ghostSprite.anchor.set(0.5, 0.9);
    ghostSprite.visible = false;

    imageOutlineGraphics = new Graphics();
    hitboxGraphics = new Graphics();
    castleHpGraphics = new Graphics();
    buildZoneGraphics = new Graphics();
    gameAreaGraphics = new Graphics();

    sceneContainer.addChild(gameAreaGraphics);
    sceneContainer.addChild(castlePlayer1Sprite);
    sceneContainer.addChild(castlePlayer2Sprite);
    sceneContainer.addChild(castleHpGraphics);
    sceneContainer.addChild(buildZoneGraphics);
    sceneContainer.addChild(buildingContainer);
    sceneContainer.addChild(unitContainer);
    sceneContainer.addChild(ghostSprite);
    sceneContainer.addChild(imageOutlineGraphics);
    sceneContainer.addChild(hitboxGraphics);

    pixiApp.stage.addChild(sceneContainer);

    buildingSpriteLayer = new BuildingSpriteLayer(buildingContainer);
    await buildingSpriteLayer.loadTextures();

    unitSpriteLayer = new UnitSpriteLayer(unitContainer);
    await unitSpriteLayer.loadFrames();

    if (destroyed) {
      buildingSpriteLayer.destroy();
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
    const canvas = app?.canvas;
    if (canvas) {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerdown", onPointerDown);
    }
    buildingSpriteLayer?.destroy();
    unitSpriteLayer?.destroy();
    resizeObserver?.disconnect();
    if (app) app.destroy(true, { children: true });
    host.innerHTML = "";
  };
}
