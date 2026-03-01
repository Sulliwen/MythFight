import { clamp } from "./iso";

export const CUSTOM_PREFABS_STORAGE_KEY = "mythfight.custom-prefabs.v1";

export type CustomPrefabPoint = {
  u: number;
  v: number;
};

export type CustomPrefabDefinition = {
  id: string;
  name: string;
  footprint: CustomPrefabPoint[];
  height: number;
  topScale?: number;
  zLayer: number;
  style: {
    topColor: number;
    sideColor: number;
    alpha: number;
  };
};

export type CustomPrefabDraft = {
  name: string;
  footprint: CustomPrefabPoint[];
  height: number;
  topScale?: number;
  zLayer: number;
  topColor: number;
  sideColor: number;
  alpha: number;
};

const MIN_HEIGHT = 0.03;
const MAX_HEIGHT = 0.8;
const MIN_TOP_SCALE = 0.2;
const MAX_TOP_SCALE = 1.2;
const MIN_Z_LAYER = 1;
const MAX_Z_LAYER = 60;

const DEFAULT_FOOTPRINT: CustomPrefabPoint[] = [
  { u: -0.3, v: -0.3 },
  { u: 0.3, v: -0.3 },
  { u: 0.3, v: 0.3 },
  { u: -0.3, v: 0.3 },
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampPoint(point: CustomPrefabPoint): CustomPrefabPoint {
  return {
    u: clamp(point.u, -0.5, 0.5),
    v: clamp(point.v, -0.5, 0.5),
  };
}

function normalizeFootprint(points: CustomPrefabPoint[]): CustomPrefabPoint[] {
  if (points.length < 3) return [...DEFAULT_FOOTPRINT];
  return points.slice(0, 48).map(clampPoint);
}

function sanitizeName(rawName: string): string {
  const trimmed = rawName.trim();
  if (trimmed.length === 0) return "Custom prefab";
  return trimmed.slice(0, 42);
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "custom-prefab";
}

function buildUniqueId(baseId: string, usedIds: Set<string>): string {
  let nextId = baseId;
  let index = 1;
  while (usedIds.has(nextId)) {
    nextId = `${baseId}-${index}`;
    index += 1;
  }
  return nextId;
}

export function createCustomPrefabDefinition(draft: CustomPrefabDraft, usedIds: Set<string>): CustomPrefabDefinition {
  const name = sanitizeName(draft.name);
  const baseId = slugify(name);
  const id = buildUniqueId(baseId, usedIds);

  return {
    id,
    name,
    footprint: normalizeFootprint(draft.footprint),
    height: clamp(draft.height, MIN_HEIGHT, MAX_HEIGHT),
    topScale: clamp(draft.topScale ?? 1, MIN_TOP_SCALE, MAX_TOP_SCALE),
    zLayer: Math.round(clamp(draft.zLayer, MIN_Z_LAYER, MAX_Z_LAYER)),
    style: {
      topColor: Math.trunc(draft.topColor),
      sideColor: Math.trunc(draft.sideColor),
      alpha: clamp(draft.alpha, 0.2, 1),
    },
  };
}

function isPrefabPoint(value: unknown): value is CustomPrefabPoint {
  return isObject(value) && isNumber(value.u) && isNumber(value.v);
}

export function isCustomPrefabDefinition(value: unknown): value is CustomPrefabDefinition {
  if (!isObject(value)) return false;
  if (typeof value.id !== "string" || typeof value.name !== "string") return false;
  if (!Array.isArray(value.footprint) || value.footprint.length < 3 || !value.footprint.every(isPrefabPoint)) return false;
  if (!isNumber(value.height) || !isNumber(value.zLayer)) return false;
  if (value.topScale !== undefined && !isNumber(value.topScale)) return false;
  if (!isObject(value.style)) return false;
  if (!isNumber(value.style.topColor) || !isNumber(value.style.sideColor) || !isNumber(value.style.alpha)) return false;
  return true;
}

export function parseCustomPrefabJson(raw: string): { ok: true; prefab: CustomPrefabDefinition } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isCustomPrefabDefinition(parsed)) {
      return { ok: false, error: "Format de prefab invalide." };
    }
    return { ok: true, prefab: parsed };
  } catch {
    return { ok: false, error: "JSON invalide." };
  }
}

export function serializeCustomPrefab(prefab: CustomPrefabDefinition): string {
  return JSON.stringify(prefab, null, 2);
}

export function parseCustomPrefabList(raw: string | null): CustomPrefabDefinition[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCustomPrefabDefinition);
  } catch {
    return [];
  }
}

export function serializeCustomPrefabList(prefabs: CustomPrefabDefinition[]): string {
  return JSON.stringify(prefabs, null, 2);
}

export function serializeFootprint(points: CustomPrefabPoint[]): string {
  return JSON.stringify(normalizeFootprint(points));
}

export function parseFootprint(value: unknown): CustomPrefabPoint[] {
  if (typeof value !== "string") return [...DEFAULT_FOOTPRINT];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_FOOTPRINT];
    const points = parsed.filter(isPrefabPoint);
    if (points.length < 3) return [...DEFAULT_FOOTPRINT];
    return normalizeFootprint(points);
  } catch {
    return [...DEFAULT_FOOTPRINT];
  }
}
