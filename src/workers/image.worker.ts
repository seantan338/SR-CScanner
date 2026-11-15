import { processRaster, warpDocumentRaster } from "../lib/process";
import type { FilterId, Quad } from "../lib/types";

interface WorkerRequest {
  id: number;
  kind: "warp" | "process";
  width: number;
  height: number;
  buffer: ArrayBuffer;
  quad: Quad;
  filter?: FilterId;
  maxEdge: number;
}

interface WorkerResponse {
  id: number;
  width?: number;
  height?: number;
  buffer?: ArrayBuffer;
  error?: string;
}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void;
};

scope.onmessage = (event) => {
  const message = event.data;
  try {
    const raster = {
      width: message.width,
      height: message.height,
      data: new Uint8ClampedArray(message.buffer),
    };
    const output =
      message.kind === "process"
        ? processRaster(raster, message.quad, message.filter ?? "original", message.maxEdge)
        : warpDocumentRaster(raster, message.quad, message.maxEdge);
    const buffer = output.data.buffer;
    if (!(buffer instanceof ArrayBuffer)) throw new Error("Unexpected image buffer.");
    scope.postMessage(
      { id: message.id, width: output.width, height: output.height, buffer },
      [buffer],
    );
  } catch (error) {
    scope.postMessage({
      id: message.id,
      error: error instanceof Error ? error.message : "Processing failed.",
    });
  }
};
