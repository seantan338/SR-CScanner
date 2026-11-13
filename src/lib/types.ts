export interface Point {
  x: number;
  y: number;
}

/** Corners in clockwise order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export type FilterId = "original" | "auto" | "grayscale" | "bw" | "magic";

export type PageFormat = "a4" | "letter" | "fit";

export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface NormBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface SignaturePlacement extends NormBox {
  blob: Blob;
}

export interface PageRecord {
  id: string;
  documentId: string;
  imageBlob: Blob;
  originalBlob: Blob;
  thumbBlob: Blob;
  corners: Quad;
  filter: FilterId;
  width: number;
  height: number;
  ocrText: string;
  ocrWords: OcrWord[];
  signature: SignaturePlacement | null;
}

export interface DocumentRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  folderId: string | null;
  tags: string[];
  pageIds: string[];
  ocrText: string;
}

export interface FolderRecord {
  id: string;
  name: string;
  createdAt: number;
}

export interface SignatureRecord {
  id: string;
  createdAt: number;
  blob: Blob;
}

export interface PdfTextWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PdfPageSource {
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/png";
  width: number;
  height: number;
  words?: PdfTextWord[];
}

export interface PageLayout {
  pageWidth: number;
  pageHeight: number;
  x: number;
  y: number;
  drawWidth: number;
  drawHeight: number;
}
