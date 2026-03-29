import { useEffect, useRef } from "react";
import { startLaneCanvasRuntime } from "./lane-canvas/runtime";
import type { BuildMode, LaneCanvasProps } from "./lane-canvas/types";

export type { LaneCanvasProps } from "./lane-canvas/types";

const DEFAULT_BUILD_MODE: BuildMode = { active: false, creatureId: "golem" };

export function LaneCanvas({
  snapshots,
  showHitboxDebug = false,
  showImageOutlineDebug = false,
  showBuildZoneDebug = true,
  showGameAreaDebug = true,
  showCollisionDebug = false,
  showGridDebug = false,
  showAttackRangeDebug = false,
  showVisionDebug = false,
  buildMode = DEFAULT_BUILD_MODE,
  onPlaceBuilding,
  onSelect,
  controlledPlayer = "player1",
}: LaneCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const snapshotsRef = useRef(snapshots);
  const showHitboxDebugRef = useRef(showHitboxDebug);
  const showImageOutlineDebugRef = useRef(showImageOutlineDebug);
  const showBuildZoneDebugRef = useRef(showBuildZoneDebug);
  const showGameAreaDebugRef = useRef(showGameAreaDebug);
  const showCollisionDebugRef = useRef(showCollisionDebug);
  const showGridDebugRef = useRef(showGridDebug);
  const showAttackRangeDebugRef = useRef(showAttackRangeDebug);
  const showVisionDebugRef = useRef(showVisionDebug);
  const buildModeRef = useRef(buildMode);
  const onPlaceBuildingRef = useRef(onPlaceBuilding);
  const onSelectRef = useRef(onSelect);
  const controlledPlayerRef = useRef(controlledPlayer);

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
    showBuildZoneDebugRef.current = showBuildZoneDebug;
  }, [showBuildZoneDebug]);

  useEffect(() => {
    showGameAreaDebugRef.current = showGameAreaDebug;
  }, [showGameAreaDebug]);

  useEffect(() => {
    showCollisionDebugRef.current = showCollisionDebug;
  }, [showCollisionDebug]);

  useEffect(() => {
    showGridDebugRef.current = showGridDebug;
  }, [showGridDebug]);

  useEffect(() => {
    showAttackRangeDebugRef.current = showAttackRangeDebug;
  }, [showAttackRangeDebug]);

  useEffect(() => {
    showVisionDebugRef.current = showVisionDebug;
  }, [showVisionDebug]);

  useEffect(() => {
    buildModeRef.current = buildMode;
  }, [buildMode]);

  useEffect(() => {
    onPlaceBuildingRef.current = onPlaceBuilding;
  }, [onPlaceBuilding]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    controlledPlayerRef.current = controlledPlayer;
  }, [controlledPlayer]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    return startLaneCanvasRuntime({
      host,
      snapshotsRef,
      showHitboxDebugRef,
      showImageOutlineDebugRef,
      showBuildZoneDebugRef,
      showGameAreaDebugRef,
      showCollisionDebugRef,
      showGridDebugRef,
      showAttackRangeDebugRef,
      showVisionDebugRef,
      buildModeRef,
      onPlaceBuildingRef,
      onSelectRef,
      controlledPlayerRef,
    });
  }, []);

  return <div ref={hostRef} className="lane-canvas-host" aria-label="Lane canvas" />;
}
