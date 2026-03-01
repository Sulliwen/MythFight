import type { Graphics } from "pixi.js";
import type { IsoLayout, IsoPoint } from "./iso";
import { localToUv, offsetPoint, projectIso } from "./iso";
import type { SceneElement } from "./sceneTypes";

export type ElementEditorShape = {
  id: string;
  polygon: IsoPoint[];
  center: IsoPoint;
  resizeHandle: IsoPoint;
  rotateHandle: IsoPoint;
};

type CastleGeometry = {
  a: IsoPoint;
  b: IsoPoint;
  c: IsoPoint;
  d: IsoPoint;
  aTop: IsoPoint;
  bTop: IsoPoint;
  cTop: IsoPoint;
  dTop: IsoPoint;
};

function drawPolygonFill(graphics: Graphics, points: IsoPoint[], color: number, alpha = 1): void {
  if (points.length === 0) return;
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    graphics.lineTo(points[i].x, points[i].y);
  }
  graphics.closePath().fill({ color, alpha });
}

function scaledSize(element: SceneElement): { width: number; depth: number; height: number } {
  const scale = element.transform.scale;
  return {
    width: element.size.width * scale,
    depth: element.size.depth * scale,
    height: element.size.height * scale,
  };
}

function getElementCenter(layout: IsoLayout, element: SceneElement): IsoPoint {
  return projectIso(layout, element.transform.u, element.transform.v);
}

function getLanePolygon(layout: IsoLayout, element: SceneElement): IsoPoint[] {
  const size = scaledSize(element);
  const halfWidth = size.width * 0.5;
  const halfDepth = size.depth * 0.5;
  const { u, v, rotation } = element.transform;

  const cornersUv = [
    localToUv(u, v, -halfWidth, -halfDepth, rotation),
    localToUv(u, v, +halfWidth, -halfDepth, rotation),
    localToUv(u, v, +halfWidth, +halfDepth, rotation),
    localToUv(u, v, -halfWidth, +halfDepth, rotation),
  ];

  return cornersUv.map((point) => projectIso(layout, point.u, point.v));
}

function getCastleGeometry(layout: IsoLayout, element: SceneElement): CastleGeometry {
  const size = scaledSize(element);
  const halfU = size.width * 0.5;
  const halfV = size.depth * 0.5;
  const heightScale = Math.max(0.02, size.height);
  const { u, v, rotation } = element.transform;

  const aUv = localToUv(u, v, -halfU, -halfV, rotation);
  const bUv = localToUv(u, v, +halfU, -halfV, rotation);
  const cUv = localToUv(u, v, +halfU, +halfV, rotation);
  const dUv = localToUv(u, v, -halfU, +halfV, rotation);

  const a = projectIso(layout, aUv.u, aUv.v);
  const b = projectIso(layout, bUv.u, bUv.v);
  const c = projectIso(layout, cUv.u, cUv.v);
  const d = projectIso(layout, dUv.u, dUv.v);
  const height = Math.max(10, layout.scaleY * heightScale);

  return {
    a,
    b,
    c,
    d,
    aTop: offsetPoint(a, 0, -height),
    bTop: offsetPoint(b, 0, -height),
    cTop: offsetPoint(c, 0, -height),
    dTop: offsetPoint(d, 0, -height),
  };
}

function getRockPolygon(layout: IsoLayout, element: SceneElement): IsoPoint[] {
  const size = scaledSize(element);
  const halfWidth = size.width * 0.5;
  const halfDepth = size.depth * 0.5;
  const { u, v, rotation } = element.transform;
  const points: IsoPoint[] = [];
  const steps = 8;

  for (let i = 0; i < steps; i += 1) {
    const theta = (Math.PI * 2 * i) / steps;
    const du = Math.cos(theta) * halfWidth;
    const dv = Math.sin(theta) * halfDepth;
    const uv = localToUv(u, v, du, dv, rotation);
    points.push(projectIso(layout, uv.u, uv.v));
  }

  return points;
}

function getRotateHandle(center: IsoPoint, polygon: IsoPoint[]): IsoPoint {
  let top = polygon[0];
  for (const point of polygon) {
    if (point.y < top.y) top = point;
  }
  return {
    x: center.x + (top.x - center.x) * 1.45,
    y: center.y + (top.y - center.y) * 1.45,
  };
}

export function drawSceneElement(graphics: Graphics, layout: IsoLayout, element: SceneElement): void {
  if (element.kind === "lane_floor") {
    const polygon = getLanePolygon(layout, element);
    drawPolygonFill(graphics, polygon, element.style?.fillColor ?? 0x1e293b, element.style?.alpha ?? 0.95);
    return;
  }

  if (element.kind === "castle") {
    const geometry = getCastleGeometry(layout, element);
    drawPolygonFill(graphics, [geometry.d, geometry.c, geometry.cTop, geometry.dTop], element.style?.leftColor ?? 0x334155, 1);
    drawPolygonFill(
      graphics,
      [geometry.b, geometry.c, geometry.cTop, geometry.bTop],
      element.style?.rightColor ?? 0x475569,
      1
    );
    drawPolygonFill(graphics, [geometry.aTop, geometry.bTop, geometry.cTop, geometry.dTop], element.style?.topColor ?? 0x64748b, 1);

    const gateWidth = (geometry.c.x - geometry.d.x) * 0.26;
    const gateHeight = (geometry.d.y - geometry.dTop.y) * 0.45;
    const gateBottomY = (geometry.c.y + geometry.d.y) * 0.5 - 2;
    const gateCenterX = (geometry.c.x + geometry.d.x) * 0.5;
    const gateLeft = gateCenterX - gateWidth * 0.5;
    const gateRight = gateCenterX + gateWidth * 0.5;
    const gateTopY = gateBottomY - gateHeight;
    drawPolygonFill(
      graphics,
      [
        { x: gateLeft, y: gateBottomY },
        { x: gateRight, y: gateBottomY },
        { x: gateRight - gateWidth * 0.12, y: gateTopY },
        { x: gateLeft + gateWidth * 0.12, y: gateTopY },
      ],
      0x0f172a,
      0.85
    );
    return;
  }

  if (element.kind === "rock") {
    const center = getElementCenter(layout, element);
    const polygon = getRockPolygon(layout, element);
    const fillColor = element.style?.fillColor ?? 0x64748b;
    drawPolygonFill(graphics, polygon, fillColor, element.style?.alpha ?? 0.9);
    graphics
      .ellipse(center.x, center.y + 6, 16, 6)
      .fill({ color: 0x020617, alpha: 0.26 });
  }
}

export function getElementEditorShape(layout: IsoLayout, element: SceneElement): ElementEditorShape | null {
  const center = getElementCenter(layout, element);

  if (element.kind === "lane_floor") {
    const polygon = getLanePolygon(layout, element);
    return {
      id: element.id,
      polygon,
      center,
      resizeHandle: polygon[2],
      rotateHandle: getRotateHandle(center, polygon),
    };
  }

  if (element.kind === "castle") {
    const geometry = getCastleGeometry(layout, element);
    const polygon = [geometry.aTop, geometry.bTop, geometry.cTop, geometry.c, geometry.d, geometry.dTop];
    return {
      id: element.id,
      polygon,
      center,
      resizeHandle: geometry.cTop,
      rotateHandle: getRotateHandle(center, polygon),
    };
  }

  if (element.kind === "rock") {
    const polygon = getRockPolygon(layout, element);
    return {
      id: element.id,
      polygon,
      center,
      resizeHandle: polygon[1],
      rotateHandle: getRotateHandle(center, polygon),
    };
  }

  return null;
}

export function getElementSortY(layout: IsoLayout, element: SceneElement): number {
  return getElementCenter(layout, element).y;
}
