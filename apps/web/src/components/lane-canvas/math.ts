export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getCanvasSize(host: HTMLDivElement): { width: number; height: number } {
  const width = Math.max(260, Math.round(host.clientWidth));
  const height = Math.max(200, Math.round(host.clientHeight));
  return { width, height };
}
