import { cloneRaster } from "@/lib/raster";
import type { FilterId, Raster } from "@/lib/types";

function clampByte(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}

function grayAt(raster: Raster, index: number): number {
  const offset = index * 4;
  return raster.data[offset] * 0.299 + raster.data[offset + 1] * 0.587 + raster.data[offset + 2] * 0.114;
}

function boxBlurGray(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const tmp = new Float32Array(width * height);
  const dst = new Float32Array(width * height);
  const window = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    const row = y * width;
    for (let x = -radius; x <= radius; x += 1) sum += src[row + clampIndex(x, width)];
    for (let x = 0; x < width; x += 1) {
      tmp[row + x] = sum / window;
      sum += src[row + clampIndex(x + radius + 1, width)];
      sum -= src[row + clampIndex(x - radius, width)];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) sum += tmp[clampIndex(y, height) * width + x];
    for (let y = 0; y < height; y += 1) {
      dst[y * width + x] = sum / window;
      sum += tmp[clampIndex(y + radius + 1, height) * width + x];
      sum -= tmp[clampIndex(y - radius, height) * width + x];
    }
  }
  return dst;
}

function clampIndex(value: number, size: number): number {
  if (value < 0) return 0;
  if (value >= size) return size - 1;
  return value;
}

function toGray(raster: Raster): Float32Array {
  const gray = new Float32Array(raster.width * raster.height);
  for (let index = 0; index < gray.length; index += 1) gray[index] = grayAt(raster, index);
  return gray;
}

function writeGray(raster: Raster, gray: ArrayLike<number>): Raster {
  const data = new Uint8ClampedArray(raster.data.length);
  for (let index = 0; index < gray.length; index += 1) {
    const value = clampByte(gray[index]);
    const offset = index * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return { width: raster.width, height: raster.height, data };
}

function histogram(values: ArrayLike<number>): Uint32Array {
  const hist = new Uint32Array(256);
  for (let index = 0; index < values.length; index += 1) {
    hist[clampByte(values[index])] += 1;
  }
  return hist;
}

function percentile(hist: Uint32Array, total: number, p: number): number {
  const target = total * p;
  let seen = 0;
  for (let value = 0; value < 256; value += 1) {
    seen += hist[value];
    if (seen >= target) return value;
  }
  return 255;
}

function grayscale(raster: Raster): Raster {
  return writeGray(raster, toGray(raster));
}

function autoEnhance(raster: Raster): Raster {
  const gray = toGray(raster);
  const hist = histogram(gray);
  const total = gray.length;
  const low = percentile(hist, total, 0.015);
  const high = percentile(hist, total, 0.985);
  const span = Math.max(12, high - low);
  const stretched = new Float32Array(gray.length);
  for (let index = 0; index < gray.length; index += 1) {
    stretched[index] = clampByte(((gray[index] - low) * 255) / span);
  }
  const blurred = boxBlurGray(stretched, raster.width, raster.height, 1);
  const sharp = new Float32Array(gray.length);
  for (let index = 0; index < gray.length; index += 1) {
    sharp[index] = clampByte(stretched[index] + (stretched[index] - blurred[index]) * 0.45);
  }
  const data = new Uint8ClampedArray(raster.data.length);
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    const gain = sharp[index] / Math.max(1, gray[index]);
    data[offset] = clampByte(raster.data[offset] * gain);
    data[offset + 1] = clampByte(raster.data[offset + 1] * gain);
    data[offset + 2] = clampByte(raster.data[offset + 2] * gain);
    data[offset + 3] = 255;
  }
  return { width: raster.width, height: raster.height, data };
}

function adaptiveBw(raster: Raster): Raster {
  const { width, height } = raster;
  const gray = new Uint8Array(width * height);
  for (let index = 0; index < gray.length; index += 1) gray[index] = grayAt(raster, index);
  const radius = Math.max(1, Math.round(Math.min(width, height) / 24));
  const blurred = boxBlurGray(Float32Array.from(gray), width, height, radius);
  const data = new Uint8ClampedArray(raster.data.length);
  for (let index = 0; index < gray.length; index += 1) {
    const value = gray[index] < blurred[index] - 8 ? 0 : 255;
    const offset = index * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return { width, height, data };
}

function channel(raster: Raster, offset: number): Float32Array {
  const values = new Float32Array(raster.width * raster.height);
  for (let index = 0; index < values.length; index += 1) values[index] = raster.data[index * 4 + offset];
  return values;
}

function magicColor(raster: Raster): Raster {
  const { width, height } = raster;
  const radius = Math.max(4, Math.round(Math.min(width, height) / 28));
  const corrected = [0, 1, 2].map((offset) => {
    const values = channel(raster, offset);
    const illum = boxBlurGray(values, width, height, radius);
    const out = new Float32Array(values.length);
    for (let index = 0; index < values.length; index += 1) {
      out[index] = (values[index] / Math.max(8, illum[index])) * 220;
    }
    return out;
  });
  const luma = new Float32Array(corrected[0].length);
  for (let index = 0; index < luma.length; index += 1) {
    luma[index] = corrected[0][index] * 0.299 + corrected[1][index] * 0.587 + corrected[2][index] * 0.114;
  }
  const hist = histogram(luma);
  const high = Math.max(20, percentile(hist, luma.length, 0.9));
  const gain = 242 / high;
  const data = new Uint8ClampedArray(raster.data.length);
  for (let index = 0; index < luma.length; index += 1) {
    let r = clampByte(corrected[0][index] * gain);
    let g = clampByte(corrected[1][index] * gain);
    let b = clampByte(corrected[2][index] * gain);
    const y = r * 0.299 + g * 0.587 + b * 0.114;
    r = clampByte(y + (r - y) * 1.18);
    g = clampByte(y + (g - y) * 1.18);
    b = clampByte(y + (b - y) * 1.18);
    const contrast = (value: number) => clampByte((value - 128) * 1.06 + 128);
    const offset = index * 4;
    data[offset] = contrast(r);
    data[offset + 1] = contrast(g);
    data[offset + 2] = contrast(b);
    data[offset + 3] = 255;
  }
  return { width, height, data };
}

export function applyFilter(raster: Raster, filter: FilterId): Raster {
  switch (filter) {
    case "original":
      return cloneRaster(raster);
    case "grayscale":
      return grayscale(raster);
    case "bw":
      return adaptiveBw(raster);
    case "auto":
      return autoEnhance(raster);
    case "magic":
      return magicColor(raster);
    default:
      return cloneRaster(raster);
  }
}
