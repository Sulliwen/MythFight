import type { LaneEditorSelection } from "../types";
import { clamp, uvToLocal } from "./iso";
import type { SceneElement } from "./sceneTypes";

const LANE_MIN_WIDTH = 0.2;
const LANE_MAX_WIDTH = 2.8;
const LANE_MIN_DEPTH = 0.08;
const LANE_MAX_DEPTH = 1.2;
const CASTLE_MIN_WIDTH = 0.04;
const CASTLE_MAX_WIDTH = 0.4;
const CASTLE_MIN_DEPTH = 0.06;
const CASTLE_MAX_DEPTH = 0.4;
const ROCK_MIN_WIDTH = 0.04;
const ROCK_MAX_WIDTH = 0.35;
const ROCK_MIN_DEPTH = 0.04;
const ROCK_MAX_DEPTH = 0.35;
const CUSTOM_MIN_WIDTH = 0.05;
const CUSTOM_MAX_WIDTH = 0.7;
const CUSTOM_MIN_DEPTH = 0.05;
const CUSTOM_MAX_DEPTH = 0.7;

function formatTsNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) return `${rounded}`;
  return rounded.toFixed(3);
}

export function buildSelectionPayload(element: SceneElement): LaneEditorSelection {
  const styleEntries = Object.entries(element.style ?? {})
    .map(([key, value]) => `${key}: ${typeof value === "number" ? formatTsNumber(value) : String(value)}`)
    .join(", ");
  const size: Record<string, number> = {
    width: element.size.width,
    depth: element.size.depth,
    height: element.size.height,
    zLayer: element.zLayer,
  };
  if (element.kind === "custom_prefab" && typeof element.meta?.customTopScale === "number") {
    size.topScale = element.meta.customTopScale;
  }

  return {
    id: element.id,
    label: element.label,
    elementType: "scene_element",
    kind: element.kind,
    htmlTarget: ".lane-canvas-host > canvas (Pixi)",
    cssTarget: ".lane-canvas-host",
    tsTarget:
      element.kind === "custom_prefab"
        ? `custom-prefab:${String(element.meta?.customPrefabId ?? "unknown")}`
        : `apps/web/src/scene/defaultScene.ts#element:${element.id}`,
    position: {
      u: element.transform.u,
      v: element.transform.v,
      rotationRad: element.transform.rotation,
      rotationDeg: (element.transform.rotation * 180) / Math.PI,
      scale: element.transform.scale,
    },
    size,
    suggestedTs: [
      "{",
      `  id: "${element.id}",`,
      `  kind: "${element.kind}",`,
      `  transform: { u: ${formatTsNumber(element.transform.u)}, v: ${formatTsNumber(element.transform.v)}, rotation: ${formatTsNumber(element.transform.rotation)}, scale: ${formatTsNumber(element.transform.scale)} },`,
      `  size: { width: ${formatTsNumber(element.size.width)}, depth: ${formatTsNumber(element.size.depth)}, height: ${formatTsNumber(element.size.height)} },`,
      `  zLayer: ${formatTsNumber(element.zLayer)},`,
      styleEntries.length > 0 ? `  style: { ${styleEntries} },` : "  style: {},",
      "}",
    ].join("\n"),
    interactionHint:
      "Drag = deplacer. Poignee carree = taille. Poignee ronde = rotation. Alt+drag = pan camera.",
  };
}

export function applyMove(element: SceneElement, du: number, dv: number): SceneElement {
  return {
    ...element,
    transform: {
      ...element.transform,
      u: clamp(element.transform.u + du, -2, 3),
      v: clamp(element.transform.v + dv, -2, 2),
    },
  };
}

export function applyResize(element: SceneElement, pointerU: number, pointerV: number): SceneElement {
  const local = uvToLocal(
    element.transform.u,
    element.transform.v,
    pointerU,
    pointerV,
    element.transform.rotation
  );

  if (element.kind === "lane_floor") {
    return {
      ...element,
      size: {
        ...element.size,
        width: clamp(Math.abs(local.u) * 2, LANE_MIN_WIDTH, LANE_MAX_WIDTH),
        depth: clamp(Math.abs(local.v) * 2, LANE_MIN_DEPTH, LANE_MAX_DEPTH),
      },
    };
  }

  if (element.kind === "castle") {
    return {
      ...element,
      size: {
        ...element.size,
        width: clamp(Math.abs(local.u) * 2, CASTLE_MIN_WIDTH, CASTLE_MAX_WIDTH),
        depth: clamp(Math.abs(local.v) * 2, CASTLE_MIN_DEPTH, CASTLE_MAX_DEPTH),
      },
    };
  }

  if (element.kind === "rock") {
    return {
      ...element,
      size: {
        ...element.size,
        width: clamp(Math.abs(local.u) * 2, ROCK_MIN_WIDTH, ROCK_MAX_WIDTH),
        depth: clamp(Math.abs(local.v) * 2, ROCK_MIN_DEPTH, ROCK_MAX_DEPTH),
      },
    };
  }

  if (element.kind === "custom_prefab") {
    return {
      ...element,
      size: {
        ...element.size,
        width: clamp(Math.abs(local.u) * 2, CUSTOM_MIN_WIDTH, CUSTOM_MAX_WIDTH),
        depth: clamp(Math.abs(local.v) * 2, CUSTOM_MIN_DEPTH, CUSTOM_MAX_DEPTH),
      },
    };
  }

  return element;
}

export function applyRotation(element: SceneElement, angleDelta: number): SceneElement {
  return {
    ...element,
    transform: {
      ...element.transform,
      rotation: element.transform.rotation + angleDelta,
    },
  };
}
