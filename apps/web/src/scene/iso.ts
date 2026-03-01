export const DESIGN_WIDTH = 980;
export const DESIGN_HEIGHT = 420;
export const ASPECT_RATIO = DESIGN_WIDTH / DESIGN_HEIGHT;
export const MIN_CANVAS_WIDTH = 260;
export const MAX_CANVAS_WIDTH = DESIGN_WIDTH;

export type IsoPoint = {
  x: number;
  y: number;
};

export type UvPoint = {
  u: number;
  v: number;
};

export type IsoLayout = {
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getCanvasSize(host: HTMLDivElement): { width: number; height: number } {
  const width = clamp(Math.round(host.clientWidth), MIN_CANVAS_WIDTH, MAX_CANVAS_WIDTH);
  const height = Math.max(80, Math.round(width / ASPECT_RATIO));
  return { width, height };
}

export function worldToProgress(worldX: number, min = 0, max = 1000): number {
  return clamp((worldX - min) / (max - min), 0, 1);
}

export function normalizeWheelAxis(event: WheelEvent, axis: "x" | "y"): number {
  const rawValue = axis === "x" ? event.deltaX : event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return rawValue * 16;
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return rawValue * window.innerHeight;
  }
  return rawValue;
}

export function createIsoLayout(width: number, height: number, laneHalfDepth: number): IsoLayout {
  const horizontalLimit = (width * 0.84) / (1 + laneHalfDepth * 2);
  const verticalLimit = (height * 0.72) / ((1 + laneHalfDepth * 2) * 0.5);
  const scaleX = Math.max(60, Math.min(horizontalLimit, verticalLimit));
  const scaleY = scaleX * 0.5;
  const centerX = width * 0.5;
  const centerY = height * 0.5;

  return {
    originX: centerX - scaleX * 0.5,
    originY: centerY - scaleY * 0.5,
    scaleX,
    scaleY,
  };
}

export function projectIso(layout: IsoLayout, u: number, v: number): IsoPoint {
  return {
    x: layout.originX + (u - v) * layout.scaleX,
    y: layout.originY + (u + v) * layout.scaleY,
  };
}

export function unprojectIso(layout: IsoLayout, x: number, y: number): UvPoint {
  const a = (x - layout.originX) / layout.scaleX;
  const b = (y - layout.originY) / layout.scaleY;
  return {
    u: (a + b) * 0.5,
    v: (b - a) * 0.5,
  };
}

export function localToUv(centerU: number, centerV: number, du: number, dv: number, rotation: number): UvPoint {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    u: centerU + du * cos - dv * sin,
    v: centerV + du * sin + dv * cos,
  };
}

export function uvToLocal(centerU: number, centerV: number, u: number, v: number, rotation: number): UvPoint {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const ru = u - centerU;
  const rv = v - centerV;
  return {
    u: ru * cos + rv * sin,
    v: -ru * sin + rv * cos,
  };
}

export function normalizeAngleDelta(angle: number): number {
  const twoPi = Math.PI * 2;
  let delta = angle % twoPi;
  if (delta > Math.PI) delta -= twoPi;
  if (delta < -Math.PI) delta += twoPi;
  return delta;
}

export function distanceSquared(a: IsoPoint, b: IsoPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function pointInPolygon(point: IsoPoint, polygon: IsoPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function offsetPoint(point: IsoPoint, dx: number, dy: number): IsoPoint {
  return { x: point.x + dx, y: point.y + dy };
}
