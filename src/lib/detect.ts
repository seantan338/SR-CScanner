import { convexHull, insetQuad, isConvexQuad, normalizeQuad } from "@/lib/geometry";
import { resizeToEdge } from "@/lib/raster";
import type { Point, Quad, Raster } from "@/lib/types";
import { DETECT_MAX_EDGE } from "@/lib/constants";

export interface Detection {
  quad: Quad;
  confidence: number;
}

/**
 * Lightweight page finder. It looks for the dominant light or dark region and
 * keeps the candidate whose border sits on a strong gradient.
 * Swap this function for an OpenCV.js detector later without touching the UI.
 */
export function detectDocumentQuad(raster: Raster): Detection {
  const small = resizeToEdge(raster, DETECT_MAX_EDGE);
  const gray = new Uint8Array(small.width * small.height);
  let lumaSum = 0;
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    const value = small.data[offset] * 0.299 + small.data[offset + 1] * 0.587 + small.data[offset + 2] * 0.114;
    gray[index] = value;
    lumaSum += value;
  }
  const blurred = boxBlur(gray, small.width, small.height, 2);
  const threshold = otsu(blurred);
  const magnitude = sobel(blurred, small.width, small.height);
  const candidates = [true, false]
    .map((bright) => componentQuad(blurred, small.width, small.height, threshold, bright))
    .filter((candidate): candidate is PixelQuad => candidate !== null);

  let best: Detection | null = null;
  for (const candidate of candidates) {
    const quad = normalizeQuad(candidate.quad, small.width, small.height);
    if (!isConvexQuad(quad)) continue;
    const edge = edgeAlignment(magnitude, small.width, small.height, candidate.quad);
    const coverage = boundingCoverage(candidate.quad, small.width, small.height);
    const framePenalty = coverage > 0.93 ? 0.2 : 1;
    const confidence = Math.max(0, Math.min(1, edge * framePenalty));
    if (!best || confidence > best.confidence) best = { quad, confidence };
  }

  if (!best || best.confidence < 0.12) {
    const mean = lumaSum / gray.length;
    return { quad: insetQuad(mean > 185 ? 0.02 : 0.07), confidence: 0.16 };
  }
  return best;
}

interface PixelQuad {
  quad: Quad;
  areaRatio: number;
}

function componentQuad(
  gray: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  bright: boolean,
): PixelQuad | null {
  const total = width * height;
  const mask = new Uint8Array(total);
  for (let index = 0; index < total; index += 1) {
    const on = bright ? gray[index] >= threshold : gray[index] < threshold;
    if (on) mask[index] = 1;
  }
  const visited = new Uint8Array(total);
  const queueX = new Int32Array(total);
  const queueY = new Int32Array(total);
  let bestCount = 0;
  let bestStart = -1;
  for (let index = 0; index < total; index += 1) {
    if (!mask[index] || visited[index]) continue;
    let head = 0;
    let tail = 0;
    visited[index] = 1;
    queueX[tail] = index % width;
    queueY[tail] = Math.floor(index / width);
    tail += 1;
    let count = 0;
    while (head < tail) {
      const x = queueX[head];
      const y = queueY[head];
      head += 1;
      count += 1;
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (!mask[next] || visited[next]) continue;
        visited[next] = 1;
        queueX[tail] = nx;
        queueY[tail] = ny;
        tail += 1;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestStart = index;
    }
  }
  const areaRatio = bestCount / total;
  if (bestStart < 0 || areaRatio < 0.05) return null;

  const component = new Uint8Array(total);
  const boundary: Point[] = [];
  let head = 0;
  let tail = 0;
  queueX[tail] = bestStart % width;
  queueY[tail] = Math.floor(bestStart / width);
  tail += 1;
  component[bestStart] = 1;
  while (head < tail) {
    const x = queueX[head];
    const y = queueY[head];
    head += 1;
    let edge = false;
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        edge = true;
        continue;
      }
      const next = ny * width + nx;
      if (!mask[next]) {
        edge = true;
        continue;
      }
      if (component[next]) continue;
      component[next] = 1;
      queueX[tail] = nx;
      queueY[tail] = ny;
      tail += 1;
    }
    if (edge) boundary.push({ x, y });
  }
  if (boundary.length < 4) return null;
  const hull = convexHull(boundary);
  const quad = quadFromHull(hull);
  if (!quad) return null;
  return { quad, areaRatio };
}

function quadFromHull(hull: Point[]): Quad | null {
  if (hull.length < 4) return null;
  let topLeft = hull[0];
  let topRight = hull[0];
  let bottomRight = hull[0];
  let bottomLeft = hull[0];
  for (const point of hull) {
    if (point.x + point.y < topLeft.x + topLeft.y) topLeft = point;
    if (point.x - point.y > topRight.x - topRight.y) topRight = point;
    if (point.x + point.y > bottomRight.x + bottomRight.y) bottomRight = point;
    if (point.x - point.y < bottomLeft.x - bottomLeft.y) bottomLeft = point;
  }
  const quad: Quad = [topLeft, topRight, bottomRight, bottomLeft];
  const keys = new Set(quad.map((point) => `${point.x},${point.y}`));
  return keys.size === 4 ? quad : null;
}

function boundingCoverage(quad: Quad, width: number, height: number): number {
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);
  const boxWidth = Math.max(...xs) - Math.min(...xs);
  const boxHeight = Math.max(...ys) - Math.min(...ys);
  return (boxWidth * boxHeight) / (width * height);
}

function edgeAlignment(magnitude: Float32Array, width: number, height: number, quad: Quad): number {
  let total = 0;
  let count = 0;
  for (let edge = 0; edge < 4; edge += 1) {
    const start = quad[edge];
    const end = quad[(edge + 1) % 4];
    for (let step = 0; step <= 28; step += 1) {
      const t = step / 28;
      const x = Math.round(start.x + (end.x - start.x) * t);
      const y = Math.round(start.y + (end.y - start.y) * t);
      let local = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const sx = x + dx;
          const sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
          local = Math.max(local, magnitude[sy * width + sx]);
        }
      }
      total += local;
      count += 1;
    }
  }
  if (count === 0) return 0;
  return Math.min(1, total / count / 640);
}

function boxBlur(src: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const tmp = new Float32Array(width * height);
  const dst = new Uint8Array(width * height);
  const window = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    const row = y * width;
    for (let x = -radius; x <= radius; x += 1) sum += src[row + clamp(x, width)];
    for (let x = 0; x < width; x += 1) {
      tmp[row + x] = sum / window;
      sum += src[row + clamp(x + radius + 1, width)];
      sum -= src[row + clamp(x - radius, width)];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) sum += tmp[clamp(y, height) * width + x];
    for (let y = 0; y < height; y += 1) {
      dst[y * width + x] = sum / window;
      sum += tmp[clamp(y + radius + 1, height) * width + x];
      sum -= tmp[clamp(y - radius, height) * width + x];
    }
  }
  return dst;
}

function clamp(value: number, size: number): number {
  if (value < 0) return 0;
  if (value >= size) return size - 1;
  return value;
}

function otsu(gray: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (let index = 0; index < gray.length; index += 1) hist[gray[index]] += 1;
  let sum = 0;
  for (let value = 0; value < 256; value += 1) sum += value * hist[value];
  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let threshold = 127;
  const total = gray.length;
  for (let value = 0; value < 256; value += 1) {
    weightBackground += hist[value];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += value * hist[value];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const between = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (between > best) {
      best = between;
      threshold = value;
    }
  }
  return threshold;
}

function sobel(gray: Uint8Array, width: number, height: number): Float32Array {
  const magnitude = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const gx =
        -gray[index - width - 1] +
        gray[index - width + 1] -
        2 * gray[index - 1] +
        2 * gray[index + 1] -
        gray[index + width - 1] +
        gray[index + width + 1];
      const gy =
        -gray[index - width - 1] -
        2 * gray[index - width] -
        gray[index - width + 1] +
        gray[index + width - 1] +
        2 * gray[index + width] +
        gray[index + width + 1];
      magnitude[index] = Math.hypot(gx, gy);
    }
  }
  return magnitude;
}
