import type { Raster } from "@/lib/types";

export function cloneRaster(raster: Raster): Raster {
  return {
    width: raster.width,
    height: raster.height,
    data: new Uint8ClampedArray(raster.data),
  };
}

export function resizeToEdge(raster: Raster, maxEdge: number): Raster {
  const longest = Math.max(raster.width, raster.height);
  if (longest <= maxEdge) return raster;
  const scale = maxEdge / longest;
  return resizeBilinear(
    raster,
    Math.max(1, Math.round(raster.width * scale)),
    Math.max(1, Math.round(raster.height * scale)),
  );
}

export function resizeBilinear(src: Raster, width: number, height: number): Raster {
  if (width === src.width && height === src.height) return src;
  const out = new Uint8ClampedArray(width * height * 4);
  const xScale = src.width / width;
  const yScale = src.height / height;
  for (let y = 0; y < height; y += 1) {
    const sy = (y + 0.5) * yScale - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const fy = Math.min(1, Math.max(0, sy - y0));
    for (let x = 0; x < width; x += 1) {
      const sx = (x + 0.5) * xScale - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const fx = Math.min(1, Math.max(0, sx - x0));
      const i00 = (y0 * src.width + x0) * 4;
      const i10 = (y0 * src.width + x1) * 4;
      const i01 = (y1 * src.width + x0) * 4;
      const i11 = (y1 * src.width + x1) * 4;
      const destination = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const value =
          src.data[i00 + channel] * (1 - fx) * (1 - fy) +
          src.data[i10 + channel] * fx * (1 - fy) +
          src.data[i01 + channel] * (1 - fx) * fy +
          src.data[i11 + channel] * fx * fy;
        out[destination + channel] = value;
      }
    }
  }
  return { width, height, data: out };
}

/** Clockwise quarter turns. */
export function rotateRaster(src: Raster, turns: number): Raster {
  const quarter = ((turns % 4) + 4) % 4;
  if (quarter === 0) return src;
  const out = new Uint8ClampedArray(src.data.length);
  if (quarter === 2) {
    const { width, height, data } = src;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceIndex = (y * width + x) * 4;
        const destinationIndex = ((height - 1 - y) * width + (width - 1 - x)) * 4;
        out[destinationIndex] = data[sourceIndex];
        out[destinationIndex + 1] = data[sourceIndex + 1];
        out[destinationIndex + 2] = data[sourceIndex + 2];
        out[destinationIndex + 3] = data[sourceIndex + 3];
      }
    }
    return { width, height, data: out };
  }
  const width = src.height;
  const height = src.width;
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) {
      const sourceIndex = (y * src.width + x) * 4;
      const nx = quarter === 1 ? src.height - 1 - y : y;
      const ny = quarter === 1 ? x : src.width - 1 - x;
      const destinationIndex = (ny * width + nx) * 4;
      out[destinationIndex] = src.data[sourceIndex];
      out[destinationIndex + 1] = src.data[sourceIndex + 1];
      out[destinationIndex + 2] = src.data[sourceIndex + 2];
      out[destinationIndex + 3] = src.data[sourceIndex + 3];
    }
  }
  return { width, height, data: out };
}

export function trimAlpha(raster: Raster, pad = 8): Raster {
  let minX = raster.width;
  let minY = raster.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const alpha = raster.data[(y * raster.width + x) * 4 + 3];
      if (alpha < 12) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return raster;
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const x1 = Math.min(raster.width - 1, maxX + pad);
  const y1 = Math.min(raster.height - 1, maxY + pad);
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = ((y0 + y) * raster.width + (x0 + x)) * 4;
      const destination = (y * width + x) * 4;
      data[destination] = raster.data[source];
      data[destination + 1] = raster.data[source + 1];
      data[destination + 2] = raster.data[source + 2];
      data[destination + 3] = raster.data[source + 3];
    }
  }
  return { width, height, data };
}

export function meanLuma(raster: Raster): number {
  let total = 0;
  const pixels = raster.width * raster.height;
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    total += raster.data[offset] * 0.299 + raster.data[offset + 1] * 0.587 + raster.data[offset + 2] * 0.114;
  }
  return pixels === 0 ? 0 : total / pixels;
}
