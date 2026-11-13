import type { NormBox, OcrWord, Point, Quad } from "@/lib/types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function fullQuad(): Quad {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
}

export function insetQuad(margin: number): Quad {
  const m = clamp(margin, 0, 0.45);
  return [
    { x: m, y: m },
    { x: 1 - m, y: m },
    { x: 1 - m, y: 1 - m },
    { x: m, y: 1 - m },
  ];
}

/** Order four points as top-left, top-right, bottom-right, bottom-left. */
export function orderQuad(points: readonly Point[]): Quad {
  if (points.length !== 4) {
    throw new Error("A page crop needs four corners.");
  }
  const tl = points.reduce((best, point) => (point.x + point.y < best.x + best.y ? point : best));
  const br = points.reduce((best, point) => (point.x + point.y > best.x + best.y ? point : best));
  const tr = points.reduce((best, point) => (point.x - point.y > best.x - best.y ? point : best));
  const bl = points.reduce((best, point) => (point.x - point.y < best.x - best.y ? point : best));
  return [tl, tr, br, bl];
}

export function polygonArea(points: readonly Point[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

export function isConvexQuad(quad: Quad): boolean {
  let sign = 0;
  for (let index = 0; index < 4; index += 1) {
    const a = quad[index];
    const b = quad[(index + 1) % 4];
    const c = quad[(index + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-8) return false;
    const nextSign = Math.sign(cross);
    if (sign === 0) sign = nextSign;
    else if (nextSign !== sign) return false;
  }
  return true;
}

export function denormalizeQuad(quad: Quad, width: number, height: number): Quad {
  return quad.map((point) => ({
    x: point.x * (width - 1),
    y: point.y * (height - 1),
  })) as Quad;
}

export function normalizeQuad(quad: Quad, width: number, height: number): Quad {
  const maxX = Math.max(1, width - 1);
  const maxY = Math.max(1, height - 1);
  return quad.map((point) => ({
    x: clamp(point.x / maxX, 0, 1),
    y: clamp(point.y / maxY, 0, 1),
  })) as Quad;
}

export function outputSizeForQuad(quad: Quad, maxEdge: number): { width: number; height: number } {
  const width = Math.max(distance(quad[0], quad[1]), distance(quad[3], quad[2]));
  const height = Math.max(distance(quad[0], quad[3]), distance(quad[1], quad[2]));
  const longest = Math.max(width, height, 1);
  const scale = Math.min(1, maxEdge / longest);
  return {
    width: Math.max(32, Math.round(width * scale)),
    height: Math.max(32, Math.round(height * scale)),
  };
}

/**
 * Map source pixels through the homography that sends `src` onto `dst`.
 * Returns 9 coefficients with h22 fixed at 1.
 */
export function solveHomography(src: Quad, dst: Quad): number[] {
  const matrix: number[][] = [];
  const vector: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const { x, y } = src[index];
    const { x: u, y: v } = dst[index];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    vector.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    vector.push(v);
  }
  const solved = solveLinear(matrix, vector);
  return [...solved, 1];
}

export function applyHomography(homography: readonly number[], x: number, y: number): Point {
  const denominator = homography[6] * x + homography[7] * y + homography[8];
  return {
    x: (homography[0] * x + homography[1] * y + homography[2]) / denominator,
    y: (homography[3] * x + homography[4] * y + homography[5]) / denominator,
  };
}

function solveLinear(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-10) {
      throw new Error("Those corners do not form a page.");
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let col = column; col <= size; col += 1) rows[column][col] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let col = column; col <= size; col += 1) rows[row][col] -= factor * rows[column][col];
    }
  }
  return rows.map((row) => row[size]);
}

function rotatePoint(point: Point, turns: number): Point {
  const quarter = ((turns % 4) + 4) % 4;
  switch (quarter) {
    case 1:
      return { x: 1 - point.y, y: point.x };
    case 2:
      return { x: 1 - point.x, y: 1 - point.y };
    case 3:
      return { x: point.y, y: 1 - point.x };
    default:
      return point;
  }
}

export function rotateQuad(quad: Quad, turns: number): Quad {
  return orderQuad(quad.map((point) => rotatePoint(point, turns)));
}

export function rotateNormBox(box: NormBox, turns: number): NormBox {
  const quarter = ((turns % 4) + 4) % 4;
  const { x, y, w, h } = box;
  switch (quarter) {
    case 1:
      return { x: 1 - (y + h), y: x, w: h, h: w };
    case 2:
      return { x: 1 - (x + w), y: 1 - (y + h), w, h };
    case 3:
      return { x: y, y: 1 - (x + w), w: h, h: w };
    default:
      return { x, y, w, h };
  }
}

export function rotateOcrWords(words: readonly OcrWord[], turns: number, width: number, height: number): OcrWord[] {
  const quarter = ((turns % 4) + 4) % 4;
  if (quarter === 0) return words.map((word) => ({ ...word }));
  const rotate = (x: number, y: number): [number, number] => {
    switch (quarter) {
      case 1:
        return [height - y, x];
      case 2:
        return [width - x, height - y];
      default:
        return [y, width - x];
    }
  };
  return words.map((word) => {
    const corners = [
      rotate(word.x0, word.y0),
      rotate(word.x1, word.y0),
      rotate(word.x1, word.y1),
      rotate(word.x0, word.y1),
    ];
    const xs = corners.map((corner) => corner[0]);
    const ys = corners.map((corner) => corner[1]);
    return {
      text: word.text,
      x0: Math.min(...xs),
      y0: Math.min(...ys),
      x1: Math.max(...xs),
      y1: Math.max(...ys),
    };
  });
}

export function convexHull(points: readonly Point[]): Point[] {
  if (points.length <= 1) return [...points];
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (origin: Point, a: Point, b: Point) =>
    (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
  const lower: Point[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
