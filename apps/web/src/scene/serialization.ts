import type { SceneDefinition, SceneElement } from "./sceneTypes";

type ParseResult = { ok: true; scene: SceneDefinition } | { ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isElement(value: unknown): value is SceneElement {
  if (!isObject(value)) return false;
  if (typeof value.id !== "string" || typeof value.kind !== "string" || typeof value.label !== "string") {
    return false;
  }
  if (!isObject(value.transform) || !isObject(value.size)) return false;
  if (!isNumber(value.transform.u) || !isNumber(value.transform.v)) return false;
  if (!isNumber(value.transform.rotation) || !isNumber(value.transform.scale)) return false;
  if (!isNumber(value.size.width) || !isNumber(value.size.depth) || !isNumber(value.size.height)) return false;
  if (!isNumber(value.zLayer) || typeof value.editable !== "boolean") return false;
  return true;
}

export function serializeScene(scene: SceneDefinition): string {
  return JSON.stringify(scene, null, 2);
}

export function parseSceneJson(raw: string): ParseResult {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!isObject(data) || !Array.isArray(data.elements)) {
      return { ok: false, error: "Invalid scene JSON: missing elements array." };
    }
    if (!data.elements.every(isElement)) {
      return { ok: false, error: "Invalid scene JSON: malformed scene element." };
    }
    return { ok: true, scene: { elements: data.elements } };
  } catch {
    return { ok: false, error: "Invalid JSON format." };
  }
}
