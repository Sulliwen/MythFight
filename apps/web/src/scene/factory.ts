import { clamp } from "./iso";
import { getLaneFloorElement } from "./sceneState";
import { serializeFootprint, type CustomPrefabDefinition } from "./customPrefabs";
import type { SceneDefinition, SceneElement, SceneElementKind } from "./sceneTypes";

export const ADDABLE_SCENE_ELEMENT_KINDS = ["castle", "rock"] as const;

export type AddableSceneElementKind = (typeof ADDABLE_SCENE_ELEMENT_KINDS)[number];

type UvPoint = { u: number; v: number };

const PLACEMENT_OFFSETS: UvPoint[] = [
  { u: 0, v: 0 },
  { u: 0.06, v: 0.03 },
  { u: -0.06, v: -0.03 },
  { u: 0.08, v: -0.04 },
  { u: -0.08, v: 0.04 },
  { u: 0.04, v: 0.08 },
  { u: -0.04, v: -0.08 },
];

function buildUniqueElementId(scene: SceneDefinition, kind: SceneElementKind): string {
  const usedIds = new Set(scene.elements.map((element) => element.id));
  let index = 1;
  let candidate = `${kind}-${index}`;
  while (usedIds.has(candidate)) {
    index += 1;
    candidate = `${kind}-${index}`;
  }
  return candidate;
}

function defaultAnchor(scene: SceneDefinition): UvPoint {
  const lane = getLaneFloorElement(scene);
  if (lane) {
    return { u: lane.transform.u, v: lane.transform.v };
  }
  return { u: 0.5, v: 0 };
}

function resolvePlacement(scene: SceneDefinition, kind: SceneElementKind, anchor?: UvPoint): UvPoint {
  const base = anchor ?? defaultAnchor(scene);
  const sameKindCount = scene.elements.filter((element) => element.kind === kind).length;
  const offset = PLACEMENT_OFFSETS[sameKindCount % PLACEMENT_OFFSETS.length];

  return {
    u: clamp(base.u + offset.u, -2, 3),
    v: clamp(base.v + offset.v, -2, 2),
  };
}

function createCastle(scene: SceneDefinition, anchor?: UvPoint): SceneElement {
  const placement = resolvePlacement(scene, "castle", anchor);
  const sameKindCount = scene.elements.filter((element) => element.kind === "castle").length;
  const isBlue = sameKindCount % 2 === 0;

  return {
    id: buildUniqueElementId(scene, "castle"),
    kind: "castle",
    label: `Castle ${sameKindCount + 1}`,
    transform: {
      u: placement.u,
      v: placement.v,
      rotation: 0,
      scale: 1,
    },
    size: {
      width: 0.12,
      depth: 0.18,
      height: 0.42,
    },
    style: isBlue
      ? {
          topColor: 0x5ea7ff,
          leftColor: 0x2f69b2,
          rightColor: 0x4179bd,
        }
      : {
          topColor: 0xff8f8f,
          leftColor: 0xb84848,
          rightColor: 0xc55a5a,
        },
    zLayer: 10,
    editable: true,
  };
}

function createRock(scene: SceneDefinition, anchor?: UvPoint): SceneElement {
  const placement = resolvePlacement(scene, "rock", anchor);
  const sameKindCount = scene.elements.filter((element) => element.kind === "rock").length;

  return {
    id: buildUniqueElementId(scene, "rock"),
    kind: "rock",
    label: `Rock ${sameKindCount + 1}`,
    transform: {
      u: placement.u,
      v: placement.v,
      rotation: 0.2,
      scale: 1,
    },
    size: {
      width: 0.1,
      depth: 0.08,
      height: 0.07,
    },
    style: {
      fillColor: 0x64748b,
      alpha: 0.92,
    },
    zLayer: 6,
    editable: true,
  };
}

export function createSceneElement(scene: SceneDefinition, kind: AddableSceneElementKind, anchor?: UvPoint): SceneElement {
  if (kind === "castle") return createCastle(scene, anchor);
  return createRock(scene, anchor);
}

export function createCustomPrefabSceneElement(
  scene: SceneDefinition,
  prefab: CustomPrefabDefinition,
  anchor?: UvPoint
): SceneElement {
  const placement = resolvePlacement(scene, "custom_prefab", anchor);
  const sameKindCount = scene.elements.filter((element) => element.kind === "custom_prefab").length;

  return {
    id: buildUniqueElementId(scene, "custom_prefab"),
    kind: "custom_prefab",
    label: `${prefab.name} ${sameKindCount + 1}`,
    transform: {
      u: placement.u,
      v: placement.v,
      rotation: 0,
      scale: 1,
    },
    size: {
      width: 0.18,
      depth: 0.18,
      height: prefab.height,
    },
    style: {
      topColor: prefab.style.topColor,
      fillColor: prefab.style.sideColor,
      alpha: prefab.style.alpha,
    },
    zLayer: prefab.zLayer,
    editable: true,
    meta: {
      customPrefabId: prefab.id,
      customFootprint: serializeFootprint(prefab.footprint),
    },
  };
}

export function getKindLabel(kind: AddableSceneElementKind): string {
  if (kind === "castle") return "Chateau";
  return "Rocher";
}
