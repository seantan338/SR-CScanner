import type { OcrWord } from "@/lib/types";

export interface OcrProgress {
  status: string;
  progress: number;
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
}

interface TesseractModule {
  createWorker: (
    languages?: string,
    oem?: number,
    options?: { logger?: (message: { status: string; progress: number }) => void },
  ) => Promise<OcrWorker>;
}

interface OcrWorker {
  recognize: (
    image: Blob,
    options: Record<string, never>,
    output: { text: boolean; blocks: boolean },
  ) => Promise<{ data: { text?: string; blocks?: OcrBlock[] | null } }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
}

interface OcrBlock {
  paragraphs?: { lines?: { words?: { text?: string; bbox: OcrWord }[] }[] }[];
}

let worker: OcrWorker | null = null;
let workerKey = "";

function wordsFromBlocks(blocks: OcrBlock[] | null | undefined): OcrWord[] {
  const words: OcrWord[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = word.text?.trim();
          if (!text) continue;
          words.push({
            text,
            x0: word.bbox.x0,
            y0: word.bbox.y0,
            x1: word.bbox.x1,
            y1: word.bbox.y1,
          });
        }
      }
    }
  }
  return words;
}

export async function recognizeImage(
  blob: Blob,
  languages: string[],
  onProgress?: (progress: OcrProgress) => void,
): Promise<OcrResult> {
  const key = [...languages].sort().join("+") || "eng";
  if (!worker || workerKey !== key) {
    await cancelOcr();
    const imported = (await import("tesseract.js")) as unknown as TesseractModule & { default?: TesseractModule };
    const tesseract = typeof imported.createWorker === "function" ? imported : imported.default;
    if (!tesseract?.createWorker) throw new Error("The OCR engine failed to load.");
    onProgress?.({ status: "Loading OCR", progress: 0 });
    const created = await tesseract.createWorker(key, 1, {
      logger: (message) => {
        onProgress?.({
          status: message.status || "Working",
          progress: typeof message.progress === "number" ? message.progress : 0,
        });
      },
    });
    await created.setParameters({ user_defined_dpi: "300" });
    worker = created as unknown as OcrWorker;
    workerKey = key;
  }
  const result = await worker.recognize(blob, {}, { text: true, blocks: true });
  return {
    text: (result.data.text ?? "").trim(),
    words: wordsFromBlocks(result.data.blocks),
  };
}

export async function cancelOcr(): Promise<void> {
  if (!worker) return;
  const current = worker;
  worker = null;
  workerKey = "";
  try {
    await current.terminate();
  } catch {
    // The worker may already have stopped.
  }
}
