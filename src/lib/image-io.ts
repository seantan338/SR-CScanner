import { resizeToEdge } from "@/lib/raster";
import type { Raster } from "@/lib/types";

export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  return new Promise((resolve, reject) => {
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image. Use a JPG or PNG photo."));
    };
    image.src = url;
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode the image."));
    }, type, quality);
  });
}

export async function blobToRaster(blob: Blob, maxEdge: number): Promise<Raster> {
  const image = await blobToImage(blob);
  return imageToRaster(image, maxEdge);
}

function sourceSize(source: CanvasImageSource): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight };
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth, height: source.naturalHeight };
  if (source instanceof HTMLCanvasElement) return { width: source.width, height: source.height };
  throw new Error("Could not read that image.");
}

export function imageToRaster(image: CanvasImageSource, maxEdge: number): Raster {
  const source = sourceSize(image);
  if (!source.width || !source.height) throw new Error("Could not read that image.");
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not draw that image.");
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return { width, height, data: imageData.data };
}

export function captureVideoFrame(video: HTMLVideoElement, maxEdge: number): Raster {
  if (!video.videoWidth || !video.videoHeight) throw new Error("The camera is not ready yet.");
  return imageToRaster(video, maxEdge);
}

export function drawRaster(canvas: HTMLCanvasElement, raster: Raster): void {
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  const copy = new Uint8ClampedArray(raster.data);
  context.putImageData(new ImageData(copy, raster.width, raster.height), 0, 0);
}

export async function rasterToBlob(raster: Raster, type: "image/jpeg" | "image/png", quality = 0.9): Promise<Blob> {
  const canvas = document.createElement("canvas");
  drawRaster(canvas, raster);
  return canvasToBlob(canvas, type, quality);
}

export async function rotateBlob(blob: Blob, quarterTurns: number, quality = 0.92): Promise<Blob> {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) return blob;
  const image = await blobToImage(blob);
  const canvas = document.createElement("canvas");
  const landscape = turns % 2 === 1;
  canvas.width = landscape ? image.naturalHeight : image.naturalWidth;
  canvas.height = landscape ? image.naturalWidth : image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not rotate that page.");
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((turns * Math.PI) / 2);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  return canvasToBlob(canvas, blob.type === "image/png" ? "image/png" : "image/jpeg", quality);
}

export async function makeThumbBlob(raster: Raster, maxEdge: number, quality = 0.72): Promise<Blob> {
  return rasterToBlob(resizeToEdge(raster, maxEdge), "image/jpeg", quality);
}
