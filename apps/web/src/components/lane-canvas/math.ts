const DESIGN_WIDTH = 980;
const DESIGN_HEIGHT = 420;
const ASPECT_RATIO = DESIGN_WIDTH / DESIGN_HEIGHT;
const MIN_CANVAS_WIDTH = 260;
const MAX_CANVAS_WIDTH = DESIGN_WIDTH;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getCanvasSize(host: HTMLDivElement): { width: number; height: number } {
  const width = clamp(Math.round(host.clientWidth), MIN_CANVAS_WIDTH, MAX_CANVAS_WIDTH);
  const height = Math.max(80, Math.round(width / ASPECT_RATIO));
  return { width, height };
}
