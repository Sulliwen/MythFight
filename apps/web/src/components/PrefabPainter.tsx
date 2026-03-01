import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { clamp } from "../scene/iso";
import type { CustomPrefabDraft, CustomPrefabPoint } from "../scene/customPrefabs";

type PrefabPainterProps = {
  onCreatePrefab: (draft: CustomPrefabDraft) => void;
};

const CANVAS_SIZE = 200;

function colorHexToNumber(hex: string): number {
  const normalized = hex.trim().replace(/^#/, "");
  return Number.parseInt(normalized, 16);
}

function toCanvasPoint(point: CustomPrefabPoint): { x: number; y: number } {
  return {
    x: (point.u + 0.5) * CANVAS_SIZE,
    y: (point.v + 0.5) * CANVAS_SIZE,
  };
}

function toPrefabPoint(x: number, y: number): CustomPrefabPoint {
  return {
    u: clamp(x / CANVAS_SIZE - 0.5, -0.5, 0.5),
    v: clamp(y / CANVAS_SIZE - 0.5, -0.5, 0.5),
  };
}

export function PrefabPainter({ onCreatePrefab }: PrefabPainterProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [name, setName] = useState("Nouveau prefab");
  const [height, setHeight] = useState(0.2);
  const [zLayer, setZLayer] = useState(12);
  const [alpha, setAlpha] = useState(0.95);
  const [topColor, setTopColor] = useState("#a3b4ff");
  const [sideColor, setSideColor] = useState("#4f5b7a");
  const [points, setPoints] = useState<CustomPrefabPoint[]>([]);

  const canCreate = points.length >= 3 && name.trim().length > 0;

  const hint = useMemo(() => {
    if (points.length < 3) return "Ajoute au moins 3 points.";
    return `${points.length} points. Clique sur creer pour sauvegarder.`;
  }, [points.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    context.strokeStyle = "rgba(148, 163, 184, 0.22)";
    context.lineWidth = 1;
    for (let line = 1; line < 8; line += 1) {
      const p = (line / 8) * CANVAS_SIZE;
      context.beginPath();
      context.moveTo(p, 0);
      context.lineTo(p, CANVAS_SIZE);
      context.stroke();
      context.beginPath();
      context.moveTo(0, p);
      context.lineTo(CANVAS_SIZE, p);
      context.stroke();
    }

    if (points.length > 0) {
      const topRgb = topColor;
      const sideRgb = sideColor;
      const projected = points.map(toCanvasPoint);

      if (projected.length >= 2) {
        context.beginPath();
        context.moveTo(projected[0].x, projected[0].y);
        for (let index = 1; index < projected.length; index += 1) {
          context.lineTo(projected[index].x, projected[index].y);
        }
        context.strokeStyle = "rgba(125, 211, 252, 0.9)";
        context.lineWidth = 2;
        context.stroke();
      }

      if (projected.length >= 3) {
        context.beginPath();
        context.moveTo(projected[0].x, projected[0].y);
        for (let index = 1; index < projected.length; index += 1) {
          context.lineTo(projected[index].x, projected[index].y);
        }
        context.closePath();
        context.fillStyle = `${sideRgb}99`;
        context.fill();
        context.strokeStyle = `${topRgb}`;
        context.lineWidth = 1.8;
        context.stroke();
      }

      for (const point of projected) {
        context.beginPath();
        context.arc(point.x, point.y, 4, 0, Math.PI * 2);
        context.fillStyle = "#f8fafc";
        context.fill();
        context.strokeStyle = "#0f172a";
        context.lineWidth = 1;
        context.stroke();
      }
    }
  }, [points, sideColor, topColor]);

  function onCanvasClick(event: MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setPoints((prev) => [...prev, toPrefabPoint(x, y)]);
  }

  function onUndo() {
    setPoints((prev) => prev.slice(0, -1));
  }

  function onClear() {
    setPoints([]);
  }

  function onCreate() {
    if (!canCreate) return;
    onCreatePrefab({
      name,
      footprint: points,
      height: clamp(height, 0.03, 0.8),
      zLayer: Math.round(clamp(zLayer, 1, 60)),
      topColor: colorHexToNumber(topColor),
      sideColor: colorHexToNumber(sideColor),
      alpha: clamp(alpha, 0.2, 1),
    });
    setPoints([]);
  }

  return (
    <div className="prefab-painter">
      <label className="editor-panel__field">
        <span>Nom</span>
        <input className="editor-panel__input" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <canvas
        ref={canvasRef}
        className="prefab-painter__canvas"
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        onClick={onCanvasClick}
      />
      <div className="prefab-painter__hint">{hint}</div>
      <div className="prefab-painter__controls">
        <label className="editor-panel__field">
          <span>Hauteur</span>
          <input
            className="editor-panel__input"
            type="number"
            min={0.03}
            max={0.8}
            step={0.01}
            value={height}
            onChange={(event) => setHeight(Number(event.target.value))}
          />
        </label>
        <label className="editor-panel__field">
          <span>Z Layer</span>
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
      </div>
      <div className="prefab-painter__controls">
        <label className="editor-panel__field">
          <span>Couleur top</span>
          <input
            className="editor-panel__input editor-panel__input--color"
            type="color"
            value={topColor}
            onChange={(event) => setTopColor(event.target.value)}
          />
        </label>
        <label className="editor-panel__field">
          <span>Couleur side</span>
          <input
            className="editor-panel__input editor-panel__input--color"
            type="color"
            value={sideColor}
            onChange={(event) => setSideColor(event.target.value)}
          />
        </label>
      </div>
      <div className="editor-panel__actions">
        <button type="button" className="editor-panel__btn editor-panel__btn--ghost" onClick={onUndo}>
          Undo point
        </button>
        <button type="button" className="editor-panel__btn editor-panel__btn--ghost" onClick={onClear}>
          Clear
        </button>
        <button type="button" className="editor-panel__btn" onClick={onCreate} disabled={!canCreate}>
          Creer prefab
        </button>
      </div>
    </div>
  );
}
