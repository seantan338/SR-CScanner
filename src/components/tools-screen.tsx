"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { MAX_PROCESSING_EDGE, THUMB_EDGE } from "@/lib/constants";
import { addPage, createDocument } from "@/lib/db";
import { fullQuad } from "@/lib/geometry";
import { defaultDocumentTitle } from "@/lib/ids";
import { makeThumbBlob, rasterToBlob } from "@/lib/image-io";
import { assembleVectorPdf } from "@/lib/pdf-tools";
import { pdfErrorMessage, renderPdfPageBlobs, renderPdfPageRaster } from "@/lib/pdf-render";
import { moveItem, pagesForExport } from "@/lib/reorder";
import { bytesToBlob } from "@/lib/zip-files";
import { downloadBlob } from "@/lib/share";
import { loadSettings } from "@/lib/settings";

interface ToolPage {
  key: string;
  sourceIndex: number;
  pageIndex: number;
  thumbUrl: string;
  selected: boolean;
}

export function ToolsScreen() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<Uint8Array[]>([]);
  const dragIndex = useRef<number | null>(null);
  const pagesRef = useRef<ToolPage[]>([]);
  const [pages, setPages] = useState<ToolPage[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  async function importFiles(list: FileList | File[]) {
    const files = [...list].filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (files.length === 0) {
      setError("Choose a PDF. Photos belong in Scan.");
      return;
    }
    setError(null);
    setNotice(null);
    try {
      for (const file of files) {
        setStatus(`Opening ${file.name}`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const rendered = await renderPdfPageBlobs(bytes, 480, (done, total) => setStatus(`${file.name}: page ${done} of ${total}`));
        const sourceIndex = filesRef.current.length;
        filesRef.current = [...filesRef.current, bytes];
        setNames((current) => [...current, file.name]);
        setPages((current) => [
          ...current,
          ...rendered.blobs.map((blob, pageIndex) => ({
            key: `${sourceIndex}-${pageIndex}-${crypto.randomUUID()}`,
            sourceIndex,
            pageIndex,
            thumbUrl: URL.createObjectURL(blob),
            selected: false,
          })),
        ]);
        if (rendered.truncated) setNotice(`${file.name} has ${rendered.pageCount} pages. The first 100 are loaded.`);
      }
    } catch (caught) {
      setError(pdfErrorMessage(caught));
    } finally {
      setStatus(null);
    }
  }

  function chosen() {
    return pagesForExport(pages);
  }

  async function downloadPdf() {
    const selected = chosen();
    if (selected.length === 0) return;
    setStatus("Building PDF");
    setError(null);
    try {
      const bytes = await assembleVectorPdf(
        filesRef.current,
        selected.map((page) => ({ sourceIndex: page.sourceIndex, pageIndex: page.pageIndex })),
      );
      downloadBlob(bytesToBlob(bytes, "application/pdf"), "sr-cscanner.pdf");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not build that PDF.");
    } finally {
      setStatus(null);
    }
  }

  async function saveToLibrary() {
    const selected = chosen();
    if (selected.length === 0) return;
    setError(null);
    try {
      const settings = loadSettings();
      const title = names[0]?.replace(/\.pdf$/i, "") || defaultDocumentTitle();
      const documentId = await createDocument(title);
      for (let index = 0; index < selected.length; index += 1) {
        const page = selected[index];
        setStatus(`Saving page ${index + 1} of ${selected.length}`);
        const raster = await renderPdfPageRaster(filesRef.current[page.sourceIndex], page.pageIndex + 1, MAX_PROCESSING_EDGE);
        const imageBlob = await rasterToBlob(raster, "image/jpeg", settings.jpegQuality);
        const thumbBlob = await makeThumbBlob(raster, THUMB_EDGE);
        await addPage(documentId, {
          imageBlob,
          originalBlob: imageBlob,
          thumbBlob,
          corners: fullQuad(),
          filter: "original",
          width: raster.width,
          height: raster.height,
        });
      }
      router.push(`/doc/${documentId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save those pages.");
      setStatus(null);
    }
  }

  function clearAll() {
    pages.forEach((page) => URL.revokeObjectURL(page.thumbUrl));
    setPages([]);
    setNames([]);
    filesRef.current = [];
    setNotice(null);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-5 pb-28 lg:pb-10">
      <header className="mb-4">
        <h1 className="font-display text-4xl">PDF tools</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-soft">
          Merge, reorder, or extract pages. The PDF stays on this device. Saving to the library flattens pages into images so you can crop, sign, and run OCR.
        </p>
      </header>
      <div
        className="mb-4 rounded-3xl border border-dashed border-line bg-paper-2 px-4 py-8 text-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (event.dataTransfer.files.length) void importFiles(event.dataTransfer.files);
        }}
      >
        <Icon name="tools" className="mx-auto text-teal" />
        <p className="mt-2 text-sm text-ink-soft">Drop PDFs here or choose files.</p>
        <Button className="mt-4" onClick={() => inputRef.current?.click()}>
          Import PDFs
        </Button>
        <input ref={inputRef} hidden type="file" accept="application/pdf" multiple onChange={(event) => event.target.files && importFiles(event.target.files)} />
      </div>
      {status && <p className="mb-3 text-sm text-ink-soft">{status}</p>}
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {notice && <p className="mb-3 text-sm text-amber-deep">{notice}</p>}
      {pages.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button onClick={downloadPdf}>Download PDF</Button>
            <Button variant="ghost" onClick={saveToLibrary}>
              Save images to library
            </Button>
            <Button variant="ghost" onClick={() => setPages((current) => current.map((page) => ({ ...page, selected: true })))}>
              Select all
            </Button>
            <Button variant="danger" onClick={clearAll}>
              Clear
            </Button>
          </div>
          <p className="mb-3 text-xs text-ink-soft">Nothing selected means every page, in this order. Select pages to extract just those.</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {pages.map((page, index) => (
              <li key={page.key} data-tool-index={index} className="rounded-2xl border border-line bg-paper-2 p-2">
                <img src={page.thumbUrl} alt={`Page ${index + 1}`} className="aspect-[3/4] w-full rounded-xl object-contain bg-white" />
                <div className="mt-2 flex items-center justify-between gap-1">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={page.selected}
                      onChange={() => setPages((current) => current.map((item) => (item.key === page.key ? { ...item, selected: !item.selected } : item)))}
                    />
                    {index + 1}
                  </label>
                  <button
                    type="button"
                    aria-label="Drag to reorder"
                    className="grid h-10 w-10 place-items-center"
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragIndex.current = index;
                    }}
                    onPointerMove={(event) => {
                      if (dragIndex.current == null) return;
                      const card = globalThis.document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-tool-index]");
                      const over = Number(card?.getAttribute("data-tool-index"));
                      if (Number.isNaN(over) || over === dragIndex.current) return;
                      const next = moveItem(pagesRef.current, dragIndex.current, over);
                      dragIndex.current = over;
                      pagesRef.current = next;
                      setPages(next);
                    }}
                    onPointerUp={() => {
                      dragIndex.current = null;
                    }}
                  >
                    <Icon name="grip" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
