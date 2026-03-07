export type TextureTrimRatios = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type TextureTrimOptions = {
  alphaThreshold?: number;
  minOpaquePixelsPerEdge?: number;
  paddingPx?: number;
};

export const NO_TRIM: TextureTrimRatios = {
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

const DEFAULT_TRIM_OPTIONS: Required<TextureTrimOptions> = {
  alphaThreshold: 16,
  minOpaquePixelsPerEdge: 1,
  paddingPx: 0,
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image for trim analysis: ${url}`));
    image.src = url;
  });
}

function findFirstIndexWithMinCount(counts: Uint32Array, minCount: number): number {
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] >= minCount) return i;
  }
  return -1;
}

function findLastIndexWithMinCount(counts: Uint32Array, minCount: number): number {
  for (let i = counts.length - 1; i >= 0; i -= 1) {
    if (counts[i] >= minCount) return i;
  }
  return -1;
}

export async function computeTextureTrimRatios(
  url: string,
  options: TextureTrimOptions = DEFAULT_TRIM_OPTIONS
): Promise<TextureTrimRatios> {
  try {
    const { alphaThreshold, minOpaquePixelsPerEdge, paddingPx } = {
      ...DEFAULT_TRIM_OPTIONS,
      ...options,
    };
    const image = await loadImage(url);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width <= 0 || height <= 0) return NO_TRIM;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return NO_TRIM;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const pixels = ctx.getImageData(0, 0, width, height).data;
    const opaqueCountByColumn = new Uint32Array(width);
    const opaqueCountByRow = new Uint32Array(height);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = pixels[(y * width + x) * 4 + 3];
        if (alpha < alphaThreshold) continue;
        opaqueCountByColumn[x] += 1;
        opaqueCountByRow[y] += 1;
      }
    }

    let minX = findFirstIndexWithMinCount(opaqueCountByColumn, minOpaquePixelsPerEdge);
    let maxX = findLastIndexWithMinCount(opaqueCountByColumn, minOpaquePixelsPerEdge);
    let minY = findFirstIndexWithMinCount(opaqueCountByRow, minOpaquePixelsPerEdge);
    let maxY = findLastIndexWithMinCount(opaqueCountByRow, minOpaquePixelsPerEdge);

    if (maxX < 0 || maxY < 0) return NO_TRIM;

    minX = Math.max(0, minX - paddingPx);
    maxX = Math.min(width - 1, maxX + paddingPx);
    minY = Math.max(0, minY - paddingPx);
    maxY = Math.min(height - 1, maxY + paddingPx);

    return {
      left: clamp01(minX / width),
      right: clamp01((width - 1 - maxX) / width),
      top: clamp01(minY / height),
      bottom: clamp01((height - 1 - maxY) / height),
    };
  } catch {
    return NO_TRIM;
  }
}
