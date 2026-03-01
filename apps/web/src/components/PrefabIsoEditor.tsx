import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { clamp } from "../scene/iso";
import type { CustomPrefabDraft, CustomPrefabPoint } from "../scene/customPrefabs";

type PrefabIsoEditorProps = {
  onCreatePrefab: (draft: CustomPrefabDraft) => void;
};

type Point2 = { x: number; y: number };

const PLAN_SIZE = 220;
const PREVIEW_SIZE = 220;
const GRID_STEPS = 8;
const POINT_HIT_RADIUS = 10;
const HEIGHT_HANDLE_RADIUS = 9;

const DEFAULT_FOOTPRINT: CustomPrefabPoint[] = [
  { u: -0.3, v: -0.26 },
  { u: 0.3, v: -0.26 },
  { u: 0.3, v: 0.26 },
  { u: -0.3, v: 0.26 },
];

function colorHexToNumber(hex: string): number {
  return Number.parseInt(hex.replace(/^#/, ""), 16);
}

function toPlanPoint(point: CustomPrefabPoint): Point2 {
  return {
    x: (point.u + 0.5) * PLAN_SIZE,
    y: (point.v + 0.5) * PLAN_SIZE,
  };
}

function fromPlanPoint(point: Point2): CustomPrefabPoint {
  return {
    u: clamp(point.x / PLAN_SIZE - 0.5, -0.5, 0.5),
    v: clamp(point.y / PLAN_SIZE - 0.5, -0.5, 0.5),
  };
}

function distanceSquared(a: Point2, b: Point2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function polygonCentroid(points: Point2[]): Point2 {
  if (points.length === 0) return { x: PREVIEW_SIZE * 0.5, y: PREVIEW_SIZE * 0.5 };
  let sx = 0;
  let sy = 0;
  for (const point of points) {
    sx += point.x;
    sy += point.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

function shadeColor(color: number, factor: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const nr = Math.max(0, Math.min(255, Math.round(r * factor)));
  const ng = Math.max(0, Math.min(255, Math.round(g * factor)));
  const nb = Math.max(0, Math.min(255, Math.round(b * factor)));
  return `rgb(${nr} ${ng} ${nb})`;
}

export function PrefabIsoEditor({ onCreatePrefab }: PrefabIsoEditorProps) {
  const planCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const planDragRef = useRef<{ pointerId: number; pointIndex: number } | null>(null);
  const previewHeightDragRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);

  const [name, setName] = useState("Prefab iso");
  const [zLayer, setZLayer] = useState(12);
  const [alpha, setAlpha] = useState(0.95);
  const [topColor, setTopColor] = useState("#d7e3ff");
  const [sideColor, setSideColor] = useState("#5f6f95");
  const [height, setHeight] = useState(0.22);
  const [topScale, setTopScale] = useState(1);
  const [points, setPoints] = useState<CustomPrefabPoint[]>([...DEFAULT_FOOTPRINT]);

  const canCreate = points.length >= 3 && name.trim().length > 0;

  const draft = useMemo<CustomPrefabDraft | null>(() => {
    if (!canCreate) return null;
    return {
      name,
      footprint: points,
      height: clamp(height, 0.05, 0.8),
      topScale: clamp(topScale, 0.2, 1.2),
      zLayer: Math.round(clamp(zLayer, 1, 60)),
      topColor: colorHexToNumber(topColor),
      sideColor: colorHexToNumber(sideColor),
      alpha: clamp(alpha, 0.2, 1),
    };
  }, [alpha, canCreate, height, name, points, sideColor, topColor, topScale, zLayer]);

  useEffect(() => {
    const canvas = planCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, PLAN_SIZE, PLAN_SIZE);
    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, PLAN_SIZE, PLAN_SIZE);

    context.strokeStyle = "rgba(148, 163, 184, 0.25)";
    context.lineWidth = 1;
    for (let step = 1; step < GRID_STEPS; step += 1) {
      const p = (step / GRID_STEPS) * PLAN_SIZE;
      context.beginPath();
      context.moveTo(p, 0);
      context.lineTo(p, PLAN_SIZE);
      context.stroke();
      context.beginPath();
      context.moveTo(0, p);
      context.lineTo(PLAN_SIZE, p);
      context.stroke();
    }

    const planPoints = points.map(toPlanPoint);
    if (planPoints.length >= 2) {
      context.beginPath();
      context.moveTo(planPoints[0].x, planPoints[0].y);
      for (let index = 1; index < planPoints.length; index += 1) {
        context.lineTo(planPoints[index].x, planPoints[index].y);
      }
      context.closePath();
      context.fillStyle = "rgba(56, 189, 248, 0.23)";
      context.fill();
      context.strokeStyle = "rgba(125, 211, 252, 0.95)";
      context.lineWidth = 1.8;
      context.stroke();
    }

    for (let index = 0; index < planPoints.length; index += 1) {
      const point = planPoints[index];
      const isDragged = planDragRef.current?.pointIndex === index;
      context.beginPath();
      context.arc(point.x, point.y, isDragged ? 5.5 : 4.5, 0, Math.PI * 2);
      context.fillStyle = isDragged ? "#fde68a" : "#f8fafc";
      context.fill();
      context.strokeStyle = "#0f172a";
      context.lineWidth = 1;
      context.stroke();
    }
  }, [points]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    context.fillStyle = "#0b1220";
    context.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

    const scaleX = PREVIEW_SIZE * 0.6;
    const scaleY = PREVIEW_SIZE * 0.3;
    const originX = PREVIEW_SIZE * 0.5;
    const originY = PREVIEW_SIZE * 0.66;
    const heightPx = Math.max(10, PREVIEW_SIZE * height * 0.9);
    const sideBase = colorHexToNumber(sideColor);

    const project = (u: number, v: number, h: number): Point2 => ({
      x: originX + (u - v) * scaleX,
      y: originY + (u + v) * scaleY - h * heightPx,
    });

    const bottom = points.map((point) => project(point.u, point.v, 0));
    let centroidU = 0;
    let centroidV = 0;
    for (const point of points) {
      centroidU += point.u;
      centroidV += point.v;
    }
    const denominator = Math.max(1, points.length);
    centroidU /= denominator;
    centroidV /= denominator;

    const top = points.map((point) => {
      const scaledU = centroidU + (point.u - centroidU) * topScale;
      const scaledV = centroidV + (point.v - centroidV) * topScale;
      return project(scaledU, scaledV, 1);
    });

    const faces = bottom
      .map((point, index) => {
        const next = (index + 1) % bottom.length;
        const polygon = [point, bottom[next], top[next], top[index]];
        const avgY = polygon.reduce((sum, item) => sum + item.y, 0) / polygon.length;
        return { polygon, avgY, index };
      })
      .sort((left, right) => left.avgY - right.avgY);

    const drawPolygon = (polygon: Point2[], fillStyle: string, strokeStyle?: string) => {
      if (polygon.length === 0) return;
      context.beginPath();
      context.moveTo(polygon[0].x, polygon[0].y);
      for (let i = 1; i < polygon.length; i += 1) {
        context.lineTo(polygon[i].x, polygon[i].y);
      }
      context.closePath();
      context.fillStyle = fillStyle;
      context.fill();
      if (strokeStyle) {
        context.strokeStyle = strokeStyle;
        context.lineWidth = 1;
        context.stroke();
      }
    };

    for (const face of faces) {
      const factor = face.index % 2 === 0 ? 0.82 : 0.68;
      drawPolygon(face.polygon, shadeColor(sideBase, factor));
    }
    drawPolygon(top, topColor, "rgba(241, 245, 249, 0.6)");

    const centroid = polygonCentroid(top);
    const handle = { x: centroid.x, y: centroid.y - 20 };
    context.beginPath();
    context.moveTo(centroid.x, centroid.y);
    context.lineTo(handle.x, handle.y);
    context.strokeStyle = "rgba(125, 211, 252, 0.95)";
    context.lineWidth = 2;
    context.stroke();
    context.beginPath();
    context.arc(handle.x, handle.y, HEIGHT_HANDLE_RADIUS - 1, 0, Math.PI * 2);
    context.fillStyle = "rgba(56, 189, 248, 0.95)";
    context.fill();
    context.strokeStyle = "rgba(15, 23, 42, 1)";
    context.lineWidth = 1.2;
    context.stroke();
  }, [height, points, sideColor, topColor, topScale]);

  function findPointIndexAtPosition(position: Point2): number {
    const planPoints = points.map(toPlanPoint);
    for (let index = 0; index < planPoints.length; index += 1) {
      if (distanceSquared(planPoints[index], position) <= POINT_HIT_RADIUS * POINT_HIT_RADIUS) {
        return index;
      }
    }
    return -1;
  }

  function pointFromPlanEvent(event: PointerEvent<HTMLCanvasElement>): Point2 {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(event.clientX - rect.left, 0, PLAN_SIZE),
      y: clamp(event.clientY - rect.top, 0, PLAN_SIZE),
    };
  }

  function onPlanPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const position = pointFromPlanEvent(event);
    const pointIndex = findPointIndexAtPosition(position);
    if (pointIndex >= 0) {
      planDragRef.current = { pointerId: event.pointerId, pointIndex };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    setPoints((prev) => [...prev, fromPlanPoint(position)]);
  }

  function onPlanPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const drag = planDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const position = pointFromPlanEvent(event);
    setPoints((prev) =>
      prev.map((point, index) => (index === drag.pointIndex ? fromPlanPoint(position) : point))
    );
  }

  function onPlanPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    const drag = planDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    planDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onPlanContextMenu(event: MouseEvent<HTMLCanvasElement>) {
    event.preventDefault();
    if (points.length <= 3) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const position = {
      x: clamp(event.clientX - rect.left, 0, PLAN_SIZE),
      y: clamp(event.clientY - rect.top, 0, PLAN_SIZE),
    };
    const pointIndex = findPointIndexAtPosition(position);
    if (pointIndex < 0) return;
    setPoints((prev) => prev.filter((_, index) => index !== pointIndex));
  }

  function getHeightHandlePosition(): Point2 {
    const scaleX = PREVIEW_SIZE * 0.6;
    const scaleY = PREVIEW_SIZE * 0.3;
    const originX = PREVIEW_SIZE * 0.5;
    const originY = PREVIEW_SIZE * 0.66;
    const heightPx = Math.max(10, PREVIEW_SIZE * height * 0.9);
    let centroidU = 0;
    let centroidV = 0;
    for (const point of points) {
      centroidU += point.u;
      centroidV += point.v;
    }
    const denominator = Math.max(1, points.length);
    centroidU /= denominator;
    centroidV /= denominator;
    const top = points.map((point) => {
      const scaledU = centroidU + (point.u - centroidU) * topScale;
      const scaledV = centroidV + (point.v - centroidV) * topScale;
      return {
        x: originX + (scaledU - scaledV) * scaleX,
        y: originY + (scaledU + scaledV) * scaleY - heightPx,
      };
    });
    const centroid = polygonCentroid(top);
    return { x: centroid.x, y: centroid.y - 20 };
  }

  function onPreviewPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = {
      x: clamp(event.clientX - rect.left, 0, PREVIEW_SIZE),
      y: clamp(event.clientY - rect.top, 0, PREVIEW_SIZE),
    };
    const handle = getHeightHandlePosition();
    if (distanceSquared(pointer, handle) > HEIGHT_HANDLE_RADIUS * HEIGHT_HANDLE_RADIUS) return;

    previewHeightDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPreviewPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const drag = previewHeightDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaY = event.clientY - drag.startY;
    const nextHeight = clamp(drag.startHeight - deltaY * 0.002, 0.05, 0.8);
    setHeight(nextHeight);
  }

  function onPreviewPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    const drag = previewHeightDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    previewHeightDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function resetFootprint() {
    setPoints([...DEFAULT_FOOTPRINT]);
  }

  function undoLastPoint() {
    setPoints((prev) => (prev.length > 3 ? prev.slice(0, -1) : prev));
  }

  function createPrefab() {
    if (!draft) return;
    onCreatePrefab(draft);
  }

  return (
    <div className="prefab-iso-editor">
      <label className="editor-panel__field">
        <span>Nom 2.5D</span>
        <input className="editor-panel__input" value={name} onChange={(event) => setName(event.target.value)} />
      </label>

      <div className="prefab-iso-editor__canvases">
        <div className="prefab-iso-editor__panel">
          <strong>Plan UV</strong>
          <canvas
            ref={planCanvasRef}
            className="prefab-iso-editor__canvas"
            width={PLAN_SIZE}
            height={PLAN_SIZE}
            onPointerDown={onPlanPointerDown}
            onPointerMove={onPlanPointerMove}
            onPointerUp={onPlanPointerUp}
            onPointerCancel={onPlanPointerUp}
            onContextMenu={onPlanContextMenu}
          />
          <span>Clic vide: ajoute point. Drag: deplace point. Clic droit: supprime point.</span>
        </div>

        <div className="prefab-iso-editor__panel">
          <strong>Preview isometrique</strong>
          <canvas
            ref={previewCanvasRef}
            className="prefab-iso-editor__canvas"
            width={PREVIEW_SIZE}
            height={PREVIEW_SIZE}
            onPointerDown={onPreviewPointerDown}
            onPointerMove={onPreviewPointerMove}
            onPointerUp={onPreviewPointerUp}
            onPointerCancel={onPreviewPointerUp}
          />
          <span>Drag la poignee cyan pour regler la hauteur.</span>
        </div>
      </div>

      <div className="editor-panel__actions">
        <button type="button" className="editor-panel__btn editor-panel__btn--ghost" onClick={undoLastPoint}>
          Undo point
        </button>
        <button type="button" className="editor-panel__btn editor-panel__btn--ghost" onClick={resetFootprint}>
          Reset forme
        </button>
      </div>

      <div className="prefab-iso-editor__controls">
        <label className="editor-panel__field">
          <span>Top</span>
          <input
            className="editor-panel__input editor-panel__input--color"
            type="color"
            value={topColor}
            onChange={(event) => setTopColor(event.target.value)}
          />
        </label>
        <label className="editor-panel__field">
          <span>Side</span>
          <input
            className="editor-panel__input editor-panel__input--color"
            type="color"
            value={sideColor}
            onChange={(event) => setSideColor(event.target.value)}
          />
        </label>
        <label className="editor-panel__field">
          <span>Alpha</span>
          <input
            className="editor-panel__input"
            type="number"
            min={0.2}
            max={1}
            step={0.05}
            value={alpha}
            onChange={(event) => setAlpha(Number(event.target.value))}
          />
        </label>
        <label className="editor-panel__field">
          <span>Top scale</span>
          <input
            className="editor-panel__input"
            type="number"
            min={0.2}
            max={1.2}
            step={0.05}
            value={topScale}
            onChange={(event) => setTopScale(Number(event.target.value))}
          />
        </label>
        <label className="editor-panel__field">
          <span>Z layer</span>
          <input
            className="editor-panel__input"
            type="number"
            min={1}
            max={60}
            step={1}
            value={zLayer}
            onChange={(event) => setZLayer(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="prefab-iso-editor__hint">
        {draft
          ? `${draft.footprint.length} points | hauteur ${draft.height.toFixed(3)} | topScale ${draft.topScale?.toFixed(2)}`
          : "Forme invalide"}
      </div>
      <div className="editor-panel__actions">
        <button type="button" className="editor-panel__btn" onClick={createPrefab} disabled={!draft}>
          Creer prefab 2.5D
        </button>
      </div>
    </div>
  );
}
