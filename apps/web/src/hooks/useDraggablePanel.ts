import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type PanelOffset = {
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  baseLeft: number;
  baseTop: number;
  width: number;
  height: number;
};

type UseDraggablePanelOptions = {
  enabled?: boolean;
  margin?: number;
};

export function useDraggablePanel(options: UseDraggablePanelOptions = {}) {
  const { enabled = true, margin = 8 } = options;
  const panelRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [offset, setOffset] = useState<PanelOffset>({ x: 0, y: 0 });
  const offsetRef = useRef(offset);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    if (!enabled) {
      dragStateRef.current = null;
      return;
    }

    const clampToViewport = () => {
      const panel = panelRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      let adjustX = 0;
      let adjustY = 0;

      if (rect.left < margin) {
        adjustX = margin - rect.left;
      } else if (rect.right > window.innerWidth - margin) {
        adjustX = window.innerWidth - margin - rect.right;
      }

      if (rect.top < margin) {
        adjustY = margin - rect.top;
      } else if (rect.bottom > window.innerHeight - margin) {
        adjustY = window.innerHeight - margin - rect.bottom;
      }

      if (adjustX !== 0 || adjustY !== 0) {
        setOffset((prev) => ({
          x: prev.x + adjustX,
          y: prev.y + adjustY,
        }));
      }
    };

    clampToViewport();
    window.addEventListener("resize", clampToViewport);
    window.addEventListener("orientationchange", clampToViewport);

    return () => {
      window.removeEventListener("resize", clampToViewport);
      window.removeEventListener("orientationchange", clampToViewport);
    };
  }, [enabled, margin]);

  const onDragStart = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) return;
      const panel = panelRef.current;
      if (!panel) return;

      const currentOffset = offsetRef.current;
      const rect = panel.getBoundingClientRect();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: currentOffset.x,
        originY: currentOffset.y,
        baseLeft: rect.left - currentOffset.x,
        baseTop: rect.top - currentOffset.y,
        width: rect.width,
        height: rect.height,
      };
    },
    [enabled]
  );

  const onDragMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;

      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      const nextX = state.originX + dx;
      const nextY = state.originY + dy;

      const minX = margin - state.baseLeft;
      const maxX = window.innerWidth - margin - state.baseLeft - state.width;
      const minY = margin - state.baseTop;
      const maxY = window.innerHeight - margin - state.baseTop - state.height;

      setOffset({
        x: Math.max(minX, Math.min(maxX, nextX)),
        y: Math.max(minY, Math.min(maxY, nextY)),
      });
    },
    [margin]
  );

  const onDragEnd = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return {
    panelRef,
    offset,
    onDragStart,
    onDragMove,
    onDragEnd,
  };
}
