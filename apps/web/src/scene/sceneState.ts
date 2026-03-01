import type { SceneDefinition, SceneElement, SceneElementPatch } from "./sceneTypes";

export function cloneScene(scene: SceneDefinition): SceneDefinition {
  return {
    elements: scene.elements.map((element) => ({
      ...element,
      transform: { ...element.transform },
      size: { ...element.size },
      style: element.style ? { ...element.style } : undefined,
      meta: element.meta ? { ...element.meta } : undefined,
    })),
  };
}

export function findElement(scene: SceneDefinition, id: string): SceneElement | null {
  return scene.elements.find((element) => element.id === id) ?? null;
}

export function updateElement(scene: SceneDefinition, id: string, patch: SceneElementPatch): SceneDefinition {
  return {
    elements: scene.elements.map((element) => {
      if (element.id !== id) return element;
      return {
        ...element,
        ...patch,
        transform: {
          ...element.transform,
          ...patch.transform,
        },
        size: {
          ...element.size,
          ...patch.size,
        },
        style: {
          ...element.style,
          ...patch.style,
        },
      };
    }),
  };
}

export function upsertElements(nextElements: SceneElement[]): SceneDefinition {
  return {
    elements: nextElements.map((element) => ({
      ...element,
      transform: { ...element.transform },
      size: { ...element.size },
      style: element.style ? { ...element.style } : undefined,
      meta: element.meta ? { ...element.meta } : undefined,
    })),
  };
}

export function getLaneFloorElement(scene: SceneDefinition): SceneElement | null {
  return scene.elements.find((element) => element.kind === "lane_floor") ?? null;
}

export function replaceElement(scene: SceneDefinition, nextElement: SceneElement): SceneDefinition {
  return {
    elements: scene.elements.map((element) => (element.id === nextElement.id ? nextElement : element)),
  };
}

export function appendElement(scene: SceneDefinition, element: SceneElement): SceneDefinition {
  return {
    elements: [
      ...scene.elements,
      {
        ...element,
        transform: { ...element.transform },
        size: { ...element.size },
        style: element.style ? { ...element.style } : undefined,
        meta: element.meta ? { ...element.meta } : undefined,
      },
    ],
  };
}

export function removeElement(scene: SceneDefinition, elementId: string): SceneDefinition {
  return {
    elements: scene.elements.filter((element) => element.id !== elementId),
  };
}
