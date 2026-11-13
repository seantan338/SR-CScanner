import { MAX_PROCESSING_EDGE } from "@/lib/constants";
import { denormalizeQuad, outputSizeForQuad } from "@/lib/geometry";
import { applyFilter } from "@/lib/filters";
import { warpDocumentRaster } from "@/lib/process";
import type { FilterId, Quad, Raster } from "@/lib/types";
import { warpRasterAsync } from "@/lib/warp";

interface WorkerResponse {
  id: number;
  width?: number;
  height?: number;
  buffer?: ArrayBuffer;
  error?: string;
}

let worker: Worker | null = null;
let workerFailed = false;
let requestId = 0;
const pending = new Map<number, { resolve: (raster: Raster) => void; reject: (error: Error) => void }>();

function disableWorker(error: Error): void {
  workerFailed = true;
  worker?.terminate();
  worker = null;
  for (const job of pending.values()) job.reject(error);
  pending.clear();
}

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/image.worker.ts", import.meta.url));
  } catch {
    workerFailed = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const job = pending.get(event.data.id);
    if (!job) return;
    pending.delete(event.data.id);
    if (event.data.error || !event.data.buffer || !event.data.width || !event.data.height) {
      job.reject(new Error(event.data.error || "Processing failed."));
      return;
    }
    job.resolve({
      width: event.data.width,
      height: event.data.height,
      data: new Uint8ClampedArray(event.data.buffer),
    });
  };
  worker.onerror = () => {
    disableWorker(new Error("The image worker stopped."));
  };
  return worker;
}

function askWorker(message: Record<string, unknown>, buffer: ArrayBuffer): Promise<Raster> {
  const current = getWorker();
  if (!current) return Promise.reject(new Error("No worker"));
  const id = (requestId += 1);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Processing took too long."));
    }, 25000);
    pending.set(id, {
      resolve: (raster) => {
        clearTimeout(timer);
        resolve(raster);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    try {
      current.postMessage({ ...message, id, buffer }, [buffer]);
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error instanceof Error ? error : new Error("The image worker failed."));
    }
  });
}

function copyBuffer(raster: Raster): ArrayBuffer {
  return new Uint8ClampedArray(raster.data).buffer;
}

async function warpLocal(
  raster: Raster,
  quad: Quad,
  maxEdge: number,
  onProgress?: (fraction: number) => void,
): Promise<Raster> {
  const pixels = denormalizeQuad(quad, raster.width, raster.height);
  const size = outputSizeForQuad(pixels, maxEdge);
  return warpRasterAsync(raster, pixels, size.width, size.height, onProgress);
}

export async function warpInBackground(
  raster: Raster,
  quad: Quad,
  maxEdge = MAX_PROCESSING_EDGE,
  onProgress?: (fraction: number) => void,
): Promise<Raster> {
  try {
    return await askWorker(
      { kind: "warp", width: raster.width, height: raster.height, quad, maxEdge },
      copyBuffer(raster),
    );
  } catch {
    return warpLocal(raster, quad, maxEdge, onProgress);
  }
}

export async function processInBackground(
  raster: Raster,
  quad: Quad,
  filter: FilterId,
  maxEdge = MAX_PROCESSING_EDGE,
  onProgress?: (fraction: number) => void,
): Promise<Raster> {
  try {
    return await askWorker(
      { kind: "process", width: raster.width, height: raster.height, quad, filter, maxEdge },
      copyBuffer(raster),
    );
  } catch {
    const warped = await warpLocal(raster, quad, maxEdge, onProgress);
    return applyFilter(warped, filter);
  }
}

export { warpDocumentRaster };
