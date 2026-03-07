import type { Graphics } from "pixi.js";

const IMAGE_OUTLINE_COLOR = 0xffffff;

export type ImageOutlineRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function drawImageOutlines(graphics: Graphics, outlines: ImageOutlineRect[]): void {
  graphics.clear();

  for (const outline of outlines) {
    graphics.rect(outline.x, outline.y, outline.width, outline.height).stroke({
      color: IMAGE_OUTLINE_COLOR,
      width: 1.5,
      alpha: 0.95,
    });
  }
}
