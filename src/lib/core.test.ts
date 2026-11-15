import { decodePDFRawStream, PDFDocument, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { detectDocumentQuad } from "@/lib/detect";
import { applyFilter } from "@/lib/filters";
import {
  applyHomography,
  isConvexQuad,
  orderQuad,
  polygonArea,
  rotateNormBox,
  rotateOcrWords,
  rotateQuad,
  solveHomography,
} from "@/lib/geometry";
import { normalizeTag, safeFileName } from "@/lib/ids";
import { assemblePdf, isLikelyWinAnsi } from "@/lib/pdf-assemble";
import { layoutImageOnPage } from "@/lib/pdf-layout";
import { assembleVectorPdf } from "@/lib/pdf-tools";
import { processRaster } from "@/lib/process";
import { rotateRaster } from "@/lib/raster";
import { moveItem, pagesForExport } from "@/lib/reorder";
import { documentMatches } from "@/lib/search";
import { sanitizeSettings } from "@/lib/settings";
import type { Quad, Raster } from "@/lib/types";
import { zipNamedFiles } from "@/lib/zip-files";

const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

function solid(width: number, height: number, color: [number, number, number, number]): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = color[0];
    data[index * 4 + 1] = color[1];
    data[index * 4 + 2] = color[2];
    data[index * 4 + 3] = color[3];
  }
  return { width, height, data };
}

function fillRect(
  raster: Raster,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: [number, number, number, number],
): void {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * raster.width + x) * 4;
      raster.data[offset] = color[0];
      raster.data[offset + 1] = color[1];
      raster.data[offset + 2] = color[2];
      raster.data[offset + 3] = color[3];
    }
  }
}

describe("page ordering", () => {
  it("moves an item and leaves invalid indexes unchanged", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(moveItem(["a", "b"], 0, 0)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], -1, 0)).toEqual(["a", "b"]);
  });

  it("exports the selection when one exists, otherwise every page", () => {
    const pages = [
      { id: "a", selected: false },
      { id: "b", selected: true },
      { id: "c", selected: true },
    ];
    expect(pagesForExport(pages).map((page) => page.id)).toEqual(["b", "c"]);
    expect(pagesForExport(pages.map((page) => ({ ...page, selected: false }))).map((page) => page.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("search and names", () => {
  const doc = {
    title: "Offer letter",
    tags: ["Sunrise", "KL"],
    ocrText: "Dear candidate, welcome to the team",
    folderId: "folder-1",
  };

  it("matches title, tag, and OCR text", () => {
    expect(documentMatches(doc, "offer", "all", null)).toBe(true);
    expect(documentMatches(doc, "candidate", "all", null)).toBe(true);
    expect(documentMatches(doc, "sun", "all", null)).toBe(true);
    expect(documentMatches(doc, "missing", "all", null)).toBe(false);
  });

  it("filters by folder and tag", () => {
    expect(documentMatches(doc, "", "unfiled", null)).toBe(false);
    expect(documentMatches(doc, "", "folder-1", "kl")).toBe(true);
    expect(documentMatches(doc, "", "folder-1", "sg")).toBe(false);
  });

  it("keeps readable filenames and tags", () => {
    expect(safeFileName("Q3: offer / letter", "pdf")).toBe("Q3 offer letter.pdf");
    expect(safeFileName("   ", "txt")).toBe("document.txt");
    expect(normalizeTag("  client  visit ")).toBe("client visit");
    expect(normalizeTag("   ")).toBeNull();
  });
});

describe("geometry", () => {
  it("solves a perspective homography", () => {
    const src: Quad = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const dst: Quad = [
      { x: 2, y: 3 },
      { x: 22, y: 5 },
      { x: 18, y: 25 },
      { x: 1, y: 20 },
    ];
    const homography = solveHomography(src, dst);
    const mapped = applyHomography(homography, 10, 0);
    expect(mapped.x).toBeCloseTo(22, 4);
    expect(mapped.y).toBeCloseTo(5, 4);
    const center = applyHomography(solveHomography(src, src), 4, 6);
    expect(center.x).toBeCloseTo(4, 5);
    expect(center.y).toBeCloseTo(6, 5);
  });

  it("orders and rotates corners", () => {
    const quad = orderQuad([
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(quad[0]).toEqual({ x: 0, y: 0 });
    expect(quad[1]).toEqual({ x: 1, y: 0 });
    expect(quad[2]).toEqual({ x: 1, y: 1 });
    expect(quad[3]).toEqual({ x: 0, y: 1 });
    expect(isConvexQuad(quad)).toBe(true);
    expect(polygonArea(quad)).toBeCloseTo(1, 5);
    const turned = rotateQuad(quad, 1);
    expect(turned[0].x).toBeCloseTo(0, 5);
    expect(turned[0].y).toBeCloseTo(0, 5);
    expect(rotateNormBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.1 }, 1)).toEqual({
      x: 0.7,
      y: 0.1,
      w: 0.1,
      h: 0.3,
    });
  });

  it("rotates OCR boxes with the page", () => {
    const words = rotateOcrWords([{ text: "Hi", x0: 0, y0: 0, x1: 10, y1: 4 }], 1, 100, 50);
    expect(words[0].x0).toBeCloseTo(46, 5);
    expect(words[0].y0).toBeCloseTo(0, 5);
    expect(words[0].x1).toBeCloseTo(50, 5);
    expect(words[0].y1).toBeCloseTo(10, 5);
  });
});

describe("imaging", () => {
  it("finds a light page on a dark background", () => {
    const raster = solid(200, 200, [32, 32, 32, 255]);
    fillRect(raster, 30, 40, 170, 150, [250, 250, 250, 255]);
    const detection = detectDocumentQuad(raster);
    const expected = [
      [30, 40],
      [169, 40],
      [169, 149],
      [30, 149],
    ];
    for (const [x, y] of expected) {
      const hit = detection.quad.some(
        (point) => Math.abs(point.x * 199 - x) <= 8 && Math.abs(point.y * 199 - y) <= 8,
      );
      expect(hit).toBe(true);
    }
    expect(detection.confidence).toBeGreaterThan(0.12);
  });

  it("straightens the page and keeps an interior mark", () => {
    const raster = solid(200, 200, [20, 20, 20, 255]);
    fillRect(raster, 20, 20, 180, 180, [255, 255, 255, 255]);
    fillRect(raster, 90, 90, 110, 110, [0, 0, 0, 255]);
    const quad: Quad = [
      { x: 20 / 199, y: 20 / 199 },
      { x: 179 / 199, y: 20 / 199 },
      { x: 179 / 199, y: 179 / 199 },
      { x: 20 / 199, y: 179 / 199 },
    ];
    const output = processRaster(raster, quad, "original", 400);
    const center = (Math.floor(output.height / 2) * output.width + Math.floor(output.width / 2)) * 4;
    expect(output.data[center]).toBeLessThan(40);
    const corner = output.data[4];
    expect(corner).toBeGreaterThan(230);
  });

  it("rotates a corner pixel clockwise", () => {
    const raster = solid(3, 2, [0, 0, 0, 255]);
    raster.data[0] = 255;
    raster.data[1] = 0;
    raster.data[2] = 0;
    const turned = rotateRaster(raster, 1);
    expect(turned.width).toBe(2);
    expect(turned.height).toBe(3);
    const index = (0 * turned.width + (turned.width - 1)) * 4;
    expect(turned.data[index]).toBe(255);
  });

  it("stretches flat photos and writes real black and white", () => {
    const raster = solid(24, 24, [120, 120, 120, 255]);
    fillRect(raster, 0, 0, 24, 8, [80, 90, 100, 255]);
    fillRect(raster, 0, 16, 24, 24, [170, 175, 180, 255]);
    const enhanced = applyFilter(raster, "auto");
    let min = 255;
    let max = 0;
    for (let index = 0; index < enhanced.width * enhanced.height; index += 1) {
      min = Math.min(min, enhanced.data[index * 4]);
      max = Math.max(max, enhanced.data[index * 4]);
    }
    expect(max - min).toBeGreaterThan(90);
    const bw = applyFilter(raster, "bw");
    for (let index = 0; index < bw.data.length; index += 4) {
      expect([0, 255]).toContain(bw.data[index]);
    }
  });
});

describe("pdf assembly", () => {
  it("lays a square image inside A4 and fits the page to the photo", () => {
    const a4 = layoutImageOnPage(1000, 1000, "a4", 28);
    expect(a4.pageWidth).toBeCloseTo(595.28, 2);
    expect(a4.x).toBeCloseTo(28, 2);
    expect(a4.drawWidth).toBeCloseTo(595.28 - 56, 2);
    expect(a4.y).toBeGreaterThan(28);
    const fit = layoutImageOnPage(200, 100, "fit");
    expect(fit.x).toBe(0);
    expect(fit.pageWidth).toBeCloseTo(792, 2);
    expect(fit.pageHeight).toBeCloseTo(396, 2);
  });

  it("builds a multi-page PDF with an invisible Latin text layer", async () => {
    expect(isLikelyWinAnsi("Hello")).toBe(true);
    expect(isLikelyWinAnsi("你好")).toBe(false);
    const bytes = await assemblePdf(
      [
        {
          bytes: PNG_1X1,
          mime: "image/png",
          width: 120,
          height: 200,
          words: [
            { text: "Hello", x0: 10, y0: 10, x1: 40, y1: 24 },
            { text: "你好", x0: 10, y0: 30, x1: 40, y1: 48 },
          ],
        },
        { bytes: PNG_1X1, mime: "image/png", width: 120, height: 200 },
      ],
      { title: "Offer", format: "a4", includeTextLayer: true },
    );
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(2);
    expect(loaded.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
    const text = await pdfText(bytes);
    expect(text.toLowerCase()).toContain("3 tr");
    expect(text.toLowerCase()).toContain("48656c6c6f");
  });

  it("merges and reorders pages from separate PDFs", async () => {
    const first = await PDFDocument.create();
    first.addPage([200, 100]);
    first.addPage([210, 100]);
    const second = await PDFDocument.create();
    second.addPage([300, 80]);
    const bytes = await assembleVectorPdf(
      [await first.save(), await second.save()],
      [
        { sourceIndex: 1, pageIndex: 0 },
        { sourceIndex: 0, pageIndex: 1 },
        { sourceIndex: 0, pageIndex: 0 },
      ],
    );
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(3);
    expect(loaded.getPage(0).getWidth()).toBe(300);
    expect(loaded.getPage(1).getWidth()).toBe(210);
    expect(loaded.getPage(2).getWidth()).toBe(200);
  });

  it("zips duplicate names apart", () => {
    const zipped = zipNamedFiles([
      { name: "page.jpg", data: Uint8Array.from([1, 2, 3]) },
      { name: "page.jpg", data: Uint8Array.from([4, 5]) },
    ]);
    expect(zipped[0]).toBe(0x50);
    expect(zipped[1]).toBe(0x4b);
  });
});

describe("settings", () => {
  it("drops unknown languages and clamps quality", () => {
    const settings = sanitizeSettings({
      pageFormat: "letter",
      jpegQuality: 4,
      ocrLanguages: ["eng", "nope" as "eng", "msa"],
      reviewEachCapture: false,
      includeTextLayer: false,
    });
    expect(settings.pageFormat).toBe("letter");
    expect(settings.jpegQuality).toBe(0.95);
    expect(settings.ocrLanguages).toEqual(["eng", "msa"]);
    expect(settings.reviewEachCapture).toBe(false);
  });
});

async function pdfText(bytes: Uint8Array): Promise<string> {
  const document = await PDFDocument.load(bytes);
  let text = "";
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    try {
      const decoded = decodePDFRawStream(object).decode();
      text += Buffer.from(decoded).toString("latin1");
    } catch {
      // Not every stream is page content.
    }
  }
  return text;
}
