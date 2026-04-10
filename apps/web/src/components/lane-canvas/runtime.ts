import { Application, Assets, Container, Graphics, Sprite, type Texture } from "pixi.js";
import {
  CASTLE_PLAYER1_TEXTURE_URL,
  CASTLE_PLAYER2_TEXTURE_URL,
  INTERPOLATION_DELAY_MS,
  WORLD_MAX_X,
  WORLD_MAX_Y,
  WORLD_MIN_X,
  WORLD_MIN_Y,
} from "./constants";
import { BuildingSpriteLayer } from "./building-sprite-layer";
import { defineGameHitboxes, hitTest, type GameHitbox } from "./hitboxes";
import { drawImageOutlines } from "./image-outlines";
import { getInterpolationPair, interpolateUnits } from "./interpolation";
import { clamp, getCanvasSize } from "./math";
import { UnitSpriteLayer } from "./unit-sprite-layer";
import type { LaneCanvasRuntimeBindings, ProjectedBuilding, ProjectedUnit } from "./types";
import { CREATURE_IDS, DEFAULT_CREATURE_ID, getBuildingFootprint, getCreaturePresentation } from "../../creature-config";
import type { CreatureId, CreatureStatsSnapshot, SnapshotMsg } from "../../types";

function projectUnits(
  snapshotsUnits: ReturnType<typeof interpolateUnits>,
  gameAreaX: number,
  gameAreaY: number,
  gameAreaWidth: number,
  gameAreaHeight: number,
): ProjectedUnit[] {
  return snapshotsUnits
    .map((unit) => {
      const x = gameAreaX + ((unit.x - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X)) * gameAreaWidth;
      const y = gameAreaY + ((unit.y - WORLD_MIN_Y) / (WORLD_MAX_Y - WORLD_MIN_Y)) * gameAreaHeight;
      return {
        id: unit.id,
        creatureId: unit.creatureId,
        owner: unit.owner,
        x,
        y,
        vx: unit.vx,
        hp: unit.hp,
        maxHp: unit.maxHp,
        state: unit.state,
        attackCycleTick: unit.attackCycleTick,
        attackIntervalTicks: unit.attackIntervalTicks,
        attackHitOffsetTicks: unit.attackHitOffsetTicks,
        attackTargetId: unit.attackTargetId,
        hitboxRadius: 0,
        renderScale: 0,
        selectionWidth: 0,
        selectionHeight: 0,
      };
    })
    .sort((left, right) => left.y - right.y);
}

// Castle visual position (fixed — matches server)
const CASTLE_VISUAL_CENTER_Y = 280;
const CASTLE_VISUAL_H = 100;
const CASTLE_P1_X = 120;
const CASTLE_P2_X = 880;
// Fallback castle hitbox (used before first snapshot arrives)
const CASTLE_COL_W = 100;
const CASTLE_COL_H = 60;
const CASTLE_COL_BOTTOM_INSET = 20;
const CASTLE_COL_BOTTOM = CASTLE_VISUAL_CENTER_Y + CASTLE_VISUAL_H / 2 - CASTLE_COL_BOTTOM_INSET;
const CASTLE_COL_P1 = { x: CASTLE_P1_X - CASTLE_COL_W / 2, y: CASTLE_COL_BOTTOM - CASTLE_COL_H, w: CASTLE_COL_W, h: CASTLE_COL_H };
const CASTLE_COL_P2 = { x: CASTLE_P2_X - CASTLE_COL_W / 2, y: CASTLE_COL_BOTTOM - CASTLE_COL_H, w: CASTLE_COL_W, h: CASTLE_COL_H };
const PATHFINDING_CELL_SIZE = 20;

const FALLBACK_CREATURE_STATS: CreatureStatsSnapshot = {
  hp: 100,
  moveSpeedPerTick: 1,
  attackDamage: 50,
  attackType: "siege",
  attackRange: 5,
  attackIntervalTicks: 100,
  armorType: "heavy",
  armor: 50,
  hitboxRadius: 12,
  visionRange: 100,
};

// Convert screen coordinates to world coordinates, clamping to valid building placement bounds
function screenToWorld(
  screenX: number,
  screenY: number,
  gameAreaX: number,
  gameAreaY: number,
  gameAreaWidth: number,
  gameAreaHeight: number,
  creatureId: CreatureId,
): { worldX: number; worldY: number } {
  const footprint = getBuildingFootprint(creatureId);
  const rawX = WORLD_MIN_X + ((screenX - gameAreaX) / gameAreaWidth) * (WORLD_MAX_X - WORLD_MIN_X);
  const rawY = WORLD_MIN_Y + ((screenY - gameAreaY) / gameAreaHeight) * (WORLD_MAX_Y - WORLD_MIN_Y);
  const worldX = clamp(rawX, WORLD_MIN_X + footprint.width / 2, WORLD_MAX_X - footprint.width / 2);
  const worldY = clamp(rawY, WORLD_MIN_Y + footprint.height / 2, WORLD_MAX_Y - footprint.height / 2);
  return { worldX, worldY };
}

function isValidBuildingPlacement(
  worldX: number,
  worldY: number,
  player: "player1" | "player2",
  creatureId: CreatureId,
  existingBuildings: { x: number; y: number; creatureId: CreatureId }[],
): boolean {
  // Must be on own side
  const midX = (WORLD_MIN_X + WORLD_MAX_X) / 2;
  if (player === "player1" ? worldX > midX : worldX < midX) return false;

  // Must not overlap existing buildings (AABB collision)
  const footprint = getBuildingFootprint(creatureId);
  const hw = footprint.width / 2;
  const hh = footprint.height / 2;
  for (const b of existingBuildings) {
    const existingFootprint = getBuildingFootprint(b.creatureId);
    const eHw = existingFootprint.width / 2;
    const eHh = existingFootprint.height / 2;
    if (
      worldX - hw < b.x + eHw &&
      worldX + hw > b.x - eHw &&
      worldY - hh < b.y + eHh &&
      worldY + hh > b.y - eHh
    ) return false;
  }

  return true;
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

function worldRectToScreen(
  cx: number, cy: number, w: number, h: number,
  gaX: number, gaY: number, gaW: number, gaH: number,
): { x: number; y: number; w: number; h: number } {
  const sx = gaX + ((cx - w / 2 - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X)) * gaW;
  const sy = gaY + ((cy - h / 2 - WORLD_MIN_Y) / (WORLD_MAX_Y - WORLD_MIN_Y)) * gaH;
  return { x: sx, y: sy, w: (w / (WORLD_MAX_X - WORLD_MIN_X)) * gaW, h: (h / (WORLD_MAX_Y - WORLD_MIN_Y)) * gaH };
}

function worldToScreenRadius(r: number, gaW: number): number {
  return (r / (WORLD_MAX_X - WORLD_MIN_X)) * gaW;
}

function getCreatureStats(snapshot: SnapshotMsg | null, creatureId: CreatureId): CreatureStatsSnapshot {
  return snapshot?.creatureStats?.[creatureId] ?? FALLBACK_CREATURE_STATS;
}

export function startLaneCanvasRuntime(bindings: LaneCanvasRuntimeBindings): () => void {
  const {
    host,
    snapshotsRef,
    showImageOutlineDebugRef,
    showBuildZoneDebugRef,
    showGameAreaDebugRef,
    showCollisionDebugRef,
    showGridDebugRef,
    showAttackRangeDebugRef,
    showVisionDebugRef,
    showPathwayDebugRef,
    buildModeRef,
    onPlaceBuildingRef,
    onSelectRef,
    controlledPlayerRef,
  } = bindings;
  let currentHitboxes: GameHitbox[] = [];

  let destroyed = false;
  let app: Application | null = null;
  let castlePlayer1Sprite: Sprite | null = null;
  let castlePlayer2Sprite: Sprite | null = null;
  let unitContainer: Container | null = null;
  let buildingContainer: Container | null = null;
  let imageOutlineGraphics: Graphics | null = null;
  let unitSpriteLayer: UnitSpriteLayer | null = null;
  let buildingSpriteLayer: BuildingSpriteLayer | null = null;
  let ghostSprite: Sprite | null = null;
  const ghostTextures = new Map<CreatureId, Texture>();
  let castleHpGraphics: Graphics | null = null;
  let collisionDebugGraphics: Graphics | null = null;
  let gridDebugGraphics: Graphics | null = null;
  let visionDebugGraphics: Graphics | null = null;
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
        buildModeRef.current.creatureId,
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
      !imageOutlineGraphics
    ) {
      return;
    }

    const width = app.screen.width;
    const height = app.screen.height;

    // Define game area for coordinate mapping: the entire visible canvas
    const gameAreaX = 0;
    const gameAreaY = 0;
    const gameAreaWidth = width;
    const gameAreaHeight = height;
    currentGameArea = { x: gameAreaX, y: gameAreaY, width: gameAreaWidth, height: gameAreaHeight };

    // Read castle hitbox rects from server snapshot (top-left corner + size)
    const latestSnapshot = snapshotsRef.current.length > 0 ? snapshotsRef.current[snapshotsRef.current.length - 1] : null;
    const cr1 = latestSnapshot?.castleRects?.player1 ?? CASTLE_COL_P1;
    const cr2 = latestSnapshot?.castleRects?.player2 ?? CASTLE_COL_P2;

    // Castle hitbox rects (from server snapshot, top-left + size)
    const castle1Hitbox = worldRectToScreen(cr1.x + cr1.w / 2, cr1.y + cr1.h / 2, cr1.w, cr1.h, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
    const castle2Hitbox = worldRectToScreen(cr2.x + cr2.w / 2, cr2.y + cr2.h / 2, cr2.w, cr2.h, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);

    // Castle sprite: fixed visual position, independent of hitbox
    const castle1Visual = worldRectToScreen(CASTLE_P1_X, CASTLE_VISUAL_CENTER_Y, CASTLE_COL_W, CASTLE_VISUAL_H, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
    const castle2Visual = worldRectToScreen(CASTLE_P2_X, CASTLE_VISUAL_CENTER_Y, CASTLE_COL_W, CASTLE_VISUAL_H, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);

    // Sprite anchor is (0.5, 1) — position at center-x, bottom-y of visual rect
    const leftCastleX = castle1Visual.x + castle1Visual.w / 2;
    const leftCastleBaseY = castle1Visual.y + castle1Visual.h;
    const rightCastleX = castle2Visual.x + castle2Visual.w / 2;
    const rightCastleBaseY = castle2Visual.y + castle2Visual.h;

    castlePlayer1Sprite.position.set(leftCastleX, leftCastleBaseY);
    castlePlayer1Sprite.width = castle1Visual.w;
    castlePlayer1Sprite.height = castle1Visual.h;

    castlePlayer2Sprite.position.set(rightCastleX, rightCastleBaseY);
    castlePlayer2Sprite.width = castle2Visual.w;
    castlePlayer2Sprite.height = castle2Visual.h;

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
        drawCastleHpBar(leftCastleX, castle1Hitbox.y, castleHp.player1);
        drawCastleHpBar(rightCastleX, castle2Hitbox.y, castleHp.player2);
      }
    }

    let projectedBuildings: ProjectedBuilding[] = [];
    if (pair) {
      const latestSnapshot = pair.b;
      projectedBuildings = (latestSnapshot.buildings ?? []).map((b) => {
        const footprint = getBuildingFootprint(b.creatureId);
        const { screenX, screenY } = worldToScreen(b.x, b.y, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
        return {
          id: b.id,
          owner: b.owner,
          creatureId: b.creatureId,
          x: screenX,
          y: screenY,
          hp: b.hp,
          maxHp: b.maxHp,
          spriteWidth: (footprint.width / (WORLD_MAX_X - WORLD_MIN_X)) * gameAreaWidth,
          spriteHeight: (footprint.height / (WORLD_MAX_Y - WORLD_MIN_Y)) * gameAreaHeight,
        };
      });
      buildingSpriteLayer.renderBuildings(projectedBuildings);
    } else {
      buildingSpriteLayer.clear();
    }

    // Render ghost sprite in build mode (snap to clamped world position)
    if (ghostSprite) {
      if (buildModeRef.current.active && mouseInCanvas) {
        const activeCreatureId = buildModeRef.current.creatureId;
        const activeFootprint = getBuildingFootprint(activeCreatureId);
        const activeGhostTexture = ghostTextures.get(activeCreatureId);
        if (activeGhostTexture && ghostSprite.texture !== activeGhostTexture) {
          ghostSprite.texture = activeGhostTexture;
        }

        const { worldX, worldY } = screenToWorld(
          mouseScreenX, mouseScreenY,
          gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight,
          activeCreatureId,
        );
        const { screenX: snappedX, screenY: snappedY } = worldToScreen(
          worldX, worldY,
          gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight,
        );

        ghostSprite.visible = true;
        ghostSprite.position.set(snappedX, snappedY);
        ghostSprite.width = (activeFootprint.width / (WORLD_MAX_X - WORLD_MIN_X)) * gameAreaWidth;
        ghostSprite.height = (activeFootprint.height / (WORLD_MAX_Y - WORLD_MIN_Y)) * gameAreaHeight;

        const existingWorldBuildings = pair
          ? (pair.b.buildings ?? []).map((b) => ({ x: b.x, y: b.y, creatureId: b.creatureId }))
          : [];
        const valid = isValidBuildingPlacement(
          worldX,
          worldY,
          controlledPlayerRef.current,
          activeCreatureId,
          existingWorldBuildings,
        );
        ghostSprite.tint = valid ? 0xffffff : 0xff4444;
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
      const activeUnitSpriteLayer = unitSpriteLayer;
      const interpolatedUnits = interpolateUnits(pair.a.units, pair.b.units, pair.alpha);
      projectedUnits = projectUnits(interpolatedUnits, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight).map((unit) => {
        const creatureStats = getCreatureStats(pair.b, unit.creatureId);
        const presentation = getCreaturePresentation(unit.creatureId);
        const referenceFrameSize = activeUnitSpriteLayer.getReferenceFrameSize(unit.creatureId);
        const baseScale = clamp((gameAreaHeight * 0.10) / referenceFrameSize.height, 0.08, 0.24);
        const renderScale = baseScale * presentation.unitScale;
        return {
          ...unit,
          hitboxRadius: worldToScreenRadius(creatureStats.hitboxRadius, gameAreaWidth),
          renderScale,
          selectionWidth: referenceFrameSize.width * renderScale,
          selectionHeight: referenceFrameSize.height * renderScale,
        };
      });

      const unitYOffset = 0;

      unitSpriteLayer.renderUnits(projectedUnits, unitYOffset);
    } else {
      unitSpriteLayer.clear();
    }

    if (showImageOutlineDebugRef.current) {
      const buildingOutlines = projectedBuildings.map((b) => ({
        x: b.x - b.spriteWidth * 0.5,
        y: b.y - b.spriteHeight * 0.5,
        width: b.spriteWidth,
        height: b.spriteHeight,
      }));
      const unitOutlines = projectedUnits.map((u) => {
        return { x: u.x - u.selectionWidth / 2, y: u.y - u.selectionHeight * 0.96, width: u.selectionWidth, height: u.selectionHeight };
      });
      drawImageOutlines(imageOutlineGraphics, [
        { x: castle1Visual.x, y: castle1Visual.y, width: castle1Visual.w, height: castle1Visual.h },
        { x: castle2Visual.x, y: castle2Visual.y, width: castle2Visual.w, height: castle2Visual.h },
        ...buildingOutlines,
        ...unitOutlines,
      ]);
    } else {
      imageOutlineGraphics.clear();
    }

    currentHitboxes = defineGameHitboxes({
      castles: {
        player1: { x: castle1Hitbox.x, y: castle1Hitbox.y, width: castle1Hitbox.w, height: castle1Hitbox.h },
        player2: { x: castle2Hitbox.x, y: castle2Hitbox.y, width: castle2Hitbox.w, height: castle2Hitbox.h },
      },
      buildings: projectedBuildings,
      units: projectedUnits,
    });

    // Draw collision hitboxes from server world coordinates (yellow)
    if (collisionDebugGraphics) {
      collisionDebugGraphics.clear();
      if (showCollisionDebugRef.current) {
        const COL_COLOR = 0xffff00;

        // Castle collision rects (from server snapshot)
        for (const ch of [castle1Hitbox, castle2Hitbox]) {
          collisionDebugGraphics.rect(ch.x, ch.y, ch.w, ch.h).stroke({ color: COL_COLOR, width: 2, alpha: 0.8 });
        }

        // Building collision rects — same as selection (sprite-based, anchor 0.5/0.9)
        for (const b of projectedBuildings) {
          collisionDebugGraphics.rect(b.x - b.spriteWidth / 2, b.y - b.spriteHeight * 0.5, b.spriteWidth, b.spriteHeight)
            .stroke({ color: COL_COLOR, width: 2, alpha: 0.8 });
        }

        // Unit collision circles
        for (const u of projectedUnits) {
          collisionDebugGraphics.circle(u.x, u.y, u.hitboxRadius)
            .stroke({ color: COL_COLOR, width: 2, alpha: 0.8 });
        }

      }

      // Draw attack range circles and attack target points
      if (showAttackRangeDebugRef.current) {
        const RANGE_COLOR = 0xff8800;
        const ATK_POINT_COLOR = 0xff0000;
        const latestForRange = pair ? pair.b.units : [];

        for (const u of projectedUnits) {
          const creatureStats = getCreatureStats(pair?.b ?? null, u.creatureId);
          const attackRangeScreen = worldToScreenRadius(creatureStats.hitboxRadius + creatureStats.attackRange, gameAreaWidth);
          collisionDebugGraphics.circle(u.x, u.y, attackRangeScreen)
            .stroke({ color: RANGE_COLOR, width: 1, alpha: 0.5 });
        }

        // Draw attack target points for attacking units (castle or unit)
        for (const u of latestForRange) {
          if ((u.state !== "attacking" && u.state !== "attacking_unit") || u.attackTargetX == null || u.attackTargetY == null) continue;
          const { screenX: ux, screenY: uy } = worldToScreen(u.x, u.y, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
          const { screenX: tx, screenY: ty } = worldToScreen(u.attackTargetX, u.attackTargetY, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
          // Line from unit to attack point
          collisionDebugGraphics.moveTo(ux, uy).lineTo(tx, ty).stroke({ color: ATK_POINT_COLOR, width: 1, alpha: 0.7 });
          // Attack target point
          collisionDebugGraphics.circle(tx, ty, 4).fill({ color: ATK_POINT_COLOR, alpha: 0.9 });
        }
      }
    }

    // Draw pathfinding grid overlay
    if (gridDebugGraphics) {
      gridDebugGraphics.clear();
      if (showGridDebugRef.current) {
        const GRID_COLOR = 0x888888;
        const cols = Math.ceil((WORLD_MAX_X - WORLD_MIN_X) / PATHFINDING_CELL_SIZE);
        const rows = Math.ceil((WORLD_MAX_Y - WORLD_MIN_Y) / PATHFINDING_CELL_SIZE);

        // Vertical lines
        for (let cx = 0; cx <= cols; cx++) {
          const worldX = WORLD_MIN_X + cx * PATHFINDING_CELL_SIZE;
          const { screenX: sx } = worldToScreen(worldX, 0, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
          const { screenY: sy0 } = worldToScreen(0, WORLD_MIN_Y, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
          const { screenY: sy1 } = worldToScreen(0, WORLD_MAX_Y, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
          gridDebugGraphics.moveTo(sx, sy0).lineTo(sx, sy1).stroke({ color: GRID_COLOR, width: 1, alpha: 0.5 });
        }

        // Horizontal lines
        for (let cy = 0; cy <= rows; cy++) {
          const worldY = WORLD_MIN_Y + cy * PATHFINDING_CELL_SIZE;
          const { screenY: sy } = worldToScreen(0, worldY, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
          const { screenX: sx0 } = worldToScreen(WORLD_MIN_X, 0, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
          const { screenX: sx1 } = worldToScreen(WORLD_MAX_X, 0, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
          gridDebugGraphics.moveTo(sx0, sy).lineTo(sx1, sy).stroke({ color: GRID_COLOR, width: 1, alpha: 0.5 });
        }
      }
    }

    // Draw unit waypoint paths
    if (showPathwayDebugRef.current && collisionDebugGraphics && pair) {
      const PATH_COLOR = 0x00ffaa;
      const CHASE_PATH_COLOR = 0xff88ff;
      const latestUnits = pair.b.units;
      for (const u of latestUnits) {
        const isChasing = u.attackTargetId != null;
        const pathColor = isChasing ? CHASE_PATH_COLOR : PATH_COLOR;
        const { screenX: ux, screenY: uy } = worldToScreen(u.x, u.y, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);

        if (u.waypoints && u.waypoints.length > 0) {
          // Line from unit to first waypoint
          const { screenX: w0x, screenY: w0y } = worldToScreen(u.waypoints[0].x, u.waypoints[0].y, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
          collisionDebugGraphics.moveTo(ux, uy).lineTo(w0x, w0y).stroke({ color: pathColor, width: 1, alpha: 0.6 });
          collisionDebugGraphics.circle(w0x, w0y, 3).fill({ color: pathColor, alpha: 0.7 });

          // Lines between waypoints
          for (let i = 1; i < u.waypoints.length; i++) {
            const { screenX: prevX, screenY: prevY } = worldToScreen(u.waypoints[i - 1].x, u.waypoints[i - 1].y, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
            const { screenX: wpX, screenY: wpY } = worldToScreen(u.waypoints[i].x, u.waypoints[i].y, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
            collisionDebugGraphics.moveTo(prevX, prevY).lineTo(wpX, wpY).stroke({ color: pathColor, width: 1, alpha: 0.6 });
            collisionDebugGraphics.circle(wpX, wpY, 3).fill({ color: pathColor, alpha: 0.7 });
          }
        } else if (u.state === "moving") {
          if (isChasing) {
            // No waypoints but chasing: draw line to target unit
            const target = latestUnits.find((t) => t.id === u.attackTargetId);
            if (target) {
              const { screenX: tx, screenY: ty } = worldToScreen(target.x, target.y, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
              collisionDebugGraphics.moveTo(ux, uy).lineTo(tx, ty).stroke({ color: pathColor, width: 1, alpha: 0.6 });
              collisionDebugGraphics.circle(tx, ty, 3).fill({ color: pathColor, alpha: 0.7 });
            }
          } else {
            // No waypoints, no chase: draw line toward enemy castle
            const castleTarget = u.owner === "player1" ? CASTLE_COL_P2 : CASTLE_COL_P1;
            const { screenX: cx, screenY: cy } = worldToScreen(castleTarget.x, castleTarget.y, gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
            collisionDebugGraphics.moveTo(ux, uy).lineTo(cx, cy).stroke({ color: pathColor, width: 1, alpha: 0.3 });
          }
        }
      }
    }

    // Draw vision range overlay
    if (visionDebugGraphics) {
      visionDebugGraphics.clear();
      if (showVisionDebugRef.current) {
        for (const u of projectedUnits) {
          const creatureStats = getCreatureStats(pair?.b ?? null, u.creatureId);
          const visionRadiusScreenX = worldToScreenRadius(creatureStats.visionRange, gameAreaWidth);
          const visionRadiusScreenY = (creatureStats.visionRange / (WORLD_MAX_Y - WORLD_MIN_Y)) * gameAreaHeight;
          const color = u.owner === "player1" ? 0x4a9eff : 0xff6b6b;
          visionDebugGraphics.ellipse(u.x, u.y, visionRadiusScreenX, visionRadiusScreenY)
            .fill({ color, alpha: 0.08 });
          visionDebugGraphics.ellipse(u.x, u.y, visionRadiusScreenX, visionRadiusScreenY)
            .stroke({ color, width: 1, alpha: 0.3 });
        }
      }
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

    const buildingTextures = await Promise.all(
      CREATURE_IDS.map(async (creatureId) => ({
        creatureId,
        texture: await Assets.load<Texture>(getCreaturePresentation(creatureId).buildingTextureUrl),
      })),
    );
    const [castleP1Texture, castleP2Texture] = await Promise.all([
      Assets.load<Texture>(CASTLE_PLAYER1_TEXTURE_URL),
      Assets.load<Texture>(CASTLE_PLAYER2_TEXTURE_URL),
    ]);

    if (destroyed) {
      pixiApp.destroy(true);
      return;
    }

    for (const { creatureId, texture } of buildingTextures) {
      ghostTextures.set(creatureId, texture);
    }

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
    ghostSprite = new Sprite(ghostTextures.get(DEFAULT_CREATURE_ID) ?? castleP1Texture);
    ghostSprite.anchor.set(0.5, 0.5);
    ghostSprite.visible = false;

    imageOutlineGraphics = new Graphics();
    collisionDebugGraphics = new Graphics();
    gridDebugGraphics = new Graphics();
    visionDebugGraphics = new Graphics();
    castleHpGraphics = new Graphics();
    buildZoneGraphics = new Graphics();
    gameAreaGraphics = new Graphics();

    sceneContainer.addChild(gridDebugGraphics);
    sceneContainer.addChild(gameAreaGraphics);
    sceneContainer.addChild(castlePlayer1Sprite);
    sceneContainer.addChild(castlePlayer2Sprite);
    sceneContainer.addChild(castleHpGraphics);
    sceneContainer.addChild(buildZoneGraphics);
    sceneContainer.addChild(buildingContainer);
    sceneContainer.addChild(unitContainer);
    sceneContainer.addChild(ghostSprite);
    sceneContainer.addChild(imageOutlineGraphics);
    sceneContainer.addChild(visionDebugGraphics);
    sceneContainer.addChild(collisionDebugGraphics);

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
