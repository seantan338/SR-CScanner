import { assemblePdf } from "@/lib/pdf-assemble";
import { safeFileName } from "@/lib/ids";
import { blobToImage, canvasToBlob } from "@/lib/image-io";
import { bytesToBlob } from "@/lib/zip-files";
import { shareOrDownload } from "@/lib/share";
import type { DocumentRecord, PageFormat, PageRecord, PdfTextWord } from "@/lib/types";

async function compositePage(page: PageRecord, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const image = await blobToImage(page.imageBlob);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare that page for export.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  if (page.signature) {
    const signature = await blobToImage(page.signature.blob);
    context.drawImage(
      signature,
      page.signature.x * canvas.width,
      page.signature.y * canvas.height,
      page.signature.w * canvas.width,
      page.signature.h * canvas.height,
    );
  }
  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  return { blob, width: canvas.width, height: canvas.height };
}

function scaleWords(page: PageRecord, width: number, height: number): PdfTextWord[] {
  const scaleX = width / Math.max(1, page.width);
  const scaleY = height / Math.max(1, page.height);
  return page.ocrWords
    .filter((word) => word.text.trim() && word.x1 > word.x0 && word.y1 > word.y0)
    .map((word) => ({
      text: word.text,
      x0: word.x0 * scaleX,
      y0: word.y0 * scaleY,
      x1: word.x1 * scaleX,
      y1: word.y1 * scaleY,
    }));
}

export async function exportDocumentFiles(options: {
  document: DocumentRecord;
  pages: PageRecord[];
  kind: "pdf" | "jpg";
  pageFormat: PageFormat;
  quality: number;
  includeTextLayer: boolean;
}): Promise<"shared" | "downloaded" | "cancelled"> {
  if (options.pages.length === 0) throw new Error("This document has no pages.");
  const rendered = [];
  for (const page of options.pages) {
    rendered.push({ page, ...(await compositePage(page, options.quality)) });
  }

  if (options.kind === "jpg") {
    const files = rendered.map(
      (item, index) =>
        new File([item.blob], safeFileName(`${options.document.title} ${index + 1}`, "jpg"), {
          type: "image/jpeg",
        }),
    );
    return shareOrDownload(files, options.document.title);
  }

  const sources = await Promise.all(
    rendered.map(async (item) => ({
      bytes: new Uint8Array(await item.blob.arrayBuffer()),
      mime: "image/jpeg" as const,
      width: item.width,
      height: item.height,
      words: options.includeTextLayer ? scaleWords(item.page, item.width, item.height) : [],
    })),
  );
  const pdfBytes = await assemblePdf(sources, {
    title: options.document.title,
    format: options.pageFormat,
    includeTextLayer: options.includeTextLayer,
  });
  const file = new File([bytesToBlob(pdfBytes, "application/pdf")], safeFileName(options.document.title, "pdf"), {
    type: "application/pdf",
  });
  return shareOrDownload([file], options.document.title);
}
