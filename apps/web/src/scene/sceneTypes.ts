export const SCENE_ELEMENT_KINDS = ["lane_floor", "castle", "rock", "custom_prefab"] as const;

export type SceneElementKind = (typeof SCENE_ELEMENT_KINDS)[number];

export type SceneTransform = {
  u: number;
  v: number;
  rotation: number;
  scale: number;
};

export type SceneSize = {
  width: number;
  depth: number;
  height: number;
};

export type SceneStyle = {
  fillColor?: number;
  topColor?: number;
  leftColor?: number;
  rightColor?: number;
  alpha?: number;
};

export type SceneElement = {
  id: string;
  kind: SceneElementKind;
  label: string;
  transform: SceneTransform;
  size: SceneSize;
  style?: SceneStyle;
  zLayer: number;
  editable: boolean;
  meta?: Record<string, unknown>;
};

export type SceneDefinition = {
  elements: SceneElement[];
};

export type SceneElementPatch = Partial<SceneElement> & {
  transform?: Partial<SceneTransform>;
  size?: Partial<SceneSize>;
  style?: Partial<SceneStyle>;
};
