import type { Raster } from "@/lib/types";

interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (params: { data: Uint8Array }) => { promise: Promise<PdfDocument> };
}

interface PdfDocument {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
}

interface PdfPage {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
}

let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      const pdfjs = mod as unknown as PdfJs;
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function renderPage(doc: PdfDocument, pageNumber: number, maxEdge: number): Promise<{
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, maxEdge / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not draw that PDF page.");
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return { canvas, width: canvas.width, height: canvas.height };
}

export async function renderPdfPageBlobs(
  bytes: Uint8Array,
  maxEdge: number,
  onProgress?: (done: number, total: number) => void,
): Promise<{ blobs: Blob[]; truncated: boolean; pageCount: number }> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: copyBytes(bytes) }).promise;
  const pageCount = doc.numPages;
  const total = Math.min(pageCount, 100);
  const blobs: Blob[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
      const rendered = await renderPage(doc, pageNumber, maxEdge);
      const blob = await new Promise<Blob>((resolve, reject) => {
        rendered.canvas.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error("Could not encode a PDF page."));
        }, "image/jpeg", 0.82);
      });
      blobs.push(blob);
      onProgress?.(pageNumber, total);
    }
  } finally {
    await doc.destroy();
  }
  return { blobs, truncated: pageCount > total, pageCount };
}

export async function renderPdfPageRaster(bytes: Uint8Array, pageNumber: number, maxEdge: number): Promise<Raster> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: copyBytes(bytes) }).promise;
  try {
    const rendered = await renderPage(doc, pageNumber, maxEdge);
    const context = rendered.canvas.getContext("2d");
    if (!context) throw new Error("Could not read that PDF page.");
    const image = context.getImageData(0, 0, rendered.width, rendered.height);
    return { width: rendered.width, height: rendered.height, data: image.data };
  } finally {
    await doc.destroy();
  }
}

export function pdfErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/password/i.test(message)) return "Password-protected PDFs are not supported in this version.";
  return "Could not open that PDF.";
}
