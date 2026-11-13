import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  beginText,
  endText,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  TextRenderingMode,
} from "pdf-lib";
import { layoutImageOnPage } from "@/lib/pdf-layout";
import type { PageFormat, PageLayout, PdfPageSource, PdfTextWord } from "@/lib/types";

export interface AssemblePdfOptions {
  title: string;
  format: PageFormat;
  includeTextLayer: boolean;
}

export function isLikelyWinAnsi(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code > 255 || code === 127) return false;
  }
  return true;
}

export async function assemblePdf(pages: PdfPageSource[], options: AssemblePdfOptions): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(options.title);
  document.setCreator("SR-CScanner");
  document.setProducer("SR-CScanner");
  const font = options.includeTextLayer ? await document.embedFont(StandardFonts.Helvetica) : null;

  for (const source of pages) {
    const image = source.mime === "image/png" ? await document.embedPng(source.bytes) : await document.embedJpg(source.bytes);
    const layout = layoutImageOnPage(source.width, source.height, options.format);
    const page = document.addPage([layout.pageWidth, layout.pageHeight]);
    page.drawImage(image, {
      x: layout.x,
      y: layout.y,
      width: layout.drawWidth,
      height: layout.drawHeight,
    });
    if (font && options.includeTextLayer && source.words?.length) {
      drawInvisibleWords(page, font, source.words, source.width, source.height, layout);
    }
  }

  return document.save();
}

function drawInvisibleWords(
  page: PDFPage,
  font: PDFFont,
  words: PdfTextWord[],
  imageWidth: number,
  imageHeight: number,
  layout: PageLayout,
): void {
  page.setFont(font);
  for (const word of words) {
    const text = word.text.replace(/\s+/g, " ").trim();
    if (!text || !isLikelyWinAnsi(text)) continue;
    let encoded;
    try {
      encoded = font.encodeText(text);
    } catch {
      continue;
    }
    const size = Math.max(4, ((word.y1 - word.y0) / imageHeight) * layout.drawHeight * 0.85);
    const x = layout.x + (word.x0 / imageWidth) * layout.drawWidth;
    const y = layout.y + ((imageHeight - word.y1) / imageHeight) * layout.drawHeight;
    page.pushOperators(
      beginText(),
      setFontAndSize(font.name, size),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setTextMatrix(1, 0, 0, 1, x, y),
      showText(encoded),
      endText(),
    );
  }
}
