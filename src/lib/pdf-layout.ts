import type { PageFormat, PageLayout } from "@/lib/types";

const PAGE_SIZES: Record<Exclude<PageFormat, "fit">, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
};

export function layoutImageOnPage(
  imageWidth: number,
  imageHeight: number,
  format: PageFormat,
  margin = 28,
): PageLayout {
  if (imageWidth <= 0 || imageHeight <= 0) {
    throw new Error("A page needs a real image size.");
  }
  if (format === "fit") {
    const longEdge = 792;
    const scale = longEdge / Math.max(imageWidth, imageHeight);
    const pageWidth = imageWidth * scale;
    const pageHeight = imageHeight * scale;
    return { pageWidth, pageHeight, x: 0, y: 0, drawWidth: pageWidth, drawHeight: pageHeight };
  }
  const page = PAGE_SIZES[format];
  const maxWidth = page.width - margin * 2;
  const maxHeight = page.height - margin * 2;
  const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  return {
    pageWidth: page.width,
    pageHeight: page.height,
    x: (page.width - drawWidth) / 2,
    y: (page.height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  };
}
