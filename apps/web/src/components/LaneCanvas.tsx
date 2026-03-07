import { useEffect, useRef } from "react";
import { startLaneCanvasRuntime } from "./lane-canvas/runtime";
import type { LaneCanvasProps } from "./lane-canvas/types";

export type { LaneCanvasProps } from "./lane-canvas/types";

export function LaneCanvas({ snapshots, showHitboxDebug = false, showImageOutlineDebug = false }: LaneCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const snapshotsRef = useRef(snapshots);
  const showHitboxDebugRef = useRef(showHitboxDebug);
  const showImageOutlineDebugRef = useRef(showImageOutlineDebug);

  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);

  useEffect(() => {
    showHitboxDebugRef.current = showHitboxDebug;
  }, [showHitboxDebug]);

  useEffect(() => {
    showImageOutlineDebugRef.current = showImageOutlineDebug;
  }, [showImageOutlineDebug]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    return startLaneCanvasRuntime({
      host,
      snapshotsRef,
      showHitboxDebugRef,
      showImageOutlineDebugRef,
    });
  }, []);

  return <div ref={hostRef} className="lane-canvas-host" aria-label="Lane canvas" />;
}
