import { solveHomography } from "@/lib/geometry";
import type { Quad, Raster } from "@/lib/types";
import { yieldToUi } from "@/lib/yield";

interface WarpState {
  homography: number[];
  out: Uint8ClampedArray;
  outWidth: number;
  outHeight: number;
  src: Raster;
}

function sample(src: Raster, x: number, y: number): [number, number, number, number] {
  if (x < 0 || y < 0 || x > src.width - 1 || y > src.height - 1) return [255, 255, 255, 255];
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(src.width - 1, x0 + 1);
  const y1 = Math.min(src.height - 1, y0 + 1);
  const dx = x - x0;
  const dy = y - y0;
  const i00 = (y0 * src.width + x0) * 4;
  const i10 = (y0 * src.width + x1) * 4;
  const i01 = (y1 * src.width + x0) * 4;
  const i11 = (y1 * src.width + x1) * 4;
  const channels: [number, number, number, number] = [0, 0, 0, 0];
  for (let channel = 0; channel < 4; channel += 1) {
    channels[channel] =
      src.data[i00 + channel] * (1 - dx) * (1 - dy) +
      src.data[i10 + channel] * dx * (1 - dy) +
      src.data[i01 + channel] * (1 - dx) * dy +
      src.data[i11 + channel] * dx * dy;
  }
  return channels;
}

function createWarp(src: Raster, quad: Quad, outWidth: number, outHeight: number): WarpState {
  const destination: Quad = [
    { x: 0, y: 0 },
    { x: outWidth - 1, y: 0 },
    { x: outWidth - 1, y: outHeight - 1 },
    { x: 0, y: outHeight - 1 },
  ];
  return {
    homography: solveHomography(destination, quad),
    out: new Uint8ClampedArray(outWidth * outHeight * 4),
    outWidth,
    outHeight,
    src,
  };
}

function warpRows(state: WarpState, y0: number, y1: number): void {
  const { homography: h, out, outWidth, src } = state;
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      const denominator = h[6] * x + h[7] * y + h[8];
      const sx = (h[0] * x + h[1] * y + h[2]) / denominator;
      const sy = (h[3] * x + h[4] * y + h[5]) / denominator;
      const [r, g, b, a] = sample(src, sx, sy);
      const index = (y * outWidth + x) * 4;
      out[index] = r;
      out[index + 1] = g;
      out[index + 2] = b;
      out[index + 3] = a;
    }
  }
}

export function warpRaster(src: Raster, quad: Quad, outWidth: number, outHeight: number): Raster {
  const state = createWarp(src, quad, outWidth, outHeight);
  warpRows(state, 0, outHeight);
  return { width: outWidth, height: outHeight, data: state.out };
}

export async function warpRasterAsync(
  src: Raster,
  quad: Quad,
  outWidth: number,
  outHeight: number,
  onProgress?: (fraction: number) => void,
): Promise<Raster> {
  const state = createWarp(src, quad, outWidth, outHeight);
  const chunk = 24;
  for (let y = 0; y < outHeight; y += chunk) {
    warpRows(state, y, Math.min(outHeight, y + chunk));
    onProgress?.(Math.min(1, (y + chunk) / outHeight));
    await yieldToUi();
  }
  return { width: outWidth, height: outHeight, data: state.out };
}
