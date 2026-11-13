import { PDFDocument } from "pdf-lib";

export interface VectorPageRef {
  sourceIndex: number;
  pageIndex: number;
}

/** Copy selected pages from one or more PDFs into a new PDF, in the given order. */
export async function assembleVectorPdf(files: Uint8Array[], order: VectorPageRef[]): Promise<Uint8Array> {
  if (order.length === 0) throw new Error("Choose at least one page.");
  const sources = await Promise.all(files.map((bytes) => PDFDocument.load(bytes)));
  const output = await PDFDocument.create();
  output.setCreator("SR-CScanner");
  output.setProducer("SR-CScanner");
  for (const item of order) {
    const source = sources[item.sourceIndex];
    if (!source) throw new Error("That PDF is no longer available.");
    if (item.pageIndex < 0 || item.pageIndex >= source.getPageCount()) {
      throw new Error("A selected page is outside the PDF.");
    }
    const [page] = await output.copyPages(source, [item.pageIndex]);
    output.addPage(page);
  }
  return output.save();
}
