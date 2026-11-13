"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PageStudio } from "@/components/page-studio";
import { SignatureDialog } from "@/components/signature-pad";
import { Icon } from "@/components/icons";
import { Button, Dialog } from "@/components/ui";
import { OCR_LANGUAGES, THUMB_EDGE } from "@/lib/constants";
import {
  deletePage,
  emptySignature,
  loadDocument,
  renameDocument,
  reorderDocumentPages,
  replacePage,
  savePageOcr,
  updatePage,
} from "@/lib/db";
import { exportDocumentFiles } from "@/lib/export-client";
import { rotateNormBox, rotateOcrWords, rotateQuad } from "@/lib/geometry";
import { safeFileName } from "@/lib/ids";
import { blobToRaster, makeThumbBlob, rasterToBlob, rotateBlob } from "@/lib/image-io";
import { cancelOcr, recognizeImage, type OcrProgress } from "@/lib/ocr";
import { moveItem } from "@/lib/reorder";
import { downloadBlob } from "@/lib/share";
import { useSettings, writeSettings } from "@/components/use-settings";
import type { Settings } from "@/lib/settings";
import type { DocumentRecord, FilterId, PageRecord, Quad, Raster } from "@/lib/types";

interface PageView {
  page: PageRecord;
  imageUrl: string;
  signatureUrl: string | null;
}

export function DocumentScreen() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const urls = useRef(new Set<string>());
  const pagesRef = useRef<PageView[]>([]);
  const dragIndex = useRef<number | null>(null);
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [pages, setPages] = useState<PageView[]>([]);
  const [missing, setMissing] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"export" | "ocr" | "sign" | null>(null);
  const settings = useSettings();
  const [exportKind, setExportKind] = useState<"pdf" | "jpg">("pdf");
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [signBlob, setSignBlob] = useState<Blob | null>(null);
  const [editor, setEditor] = useState<{ pageId: string; raster: Raster; corners: Quad; filter: FilterId } | null>(null);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  function track(blob: Blob | null): string | null {
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  }

  function release(url: string | null) {
    if (!url) return;
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  }

  function toView(page: PageRecord): PageView {
    return { page, imageUrl: track(page.imageBlob) || "", signatureUrl: track(page.signature?.blob ?? null) };
  }

  useEffect(() => {
    const owned = urls.current;
    return () => {
      owned.forEach((url) => URL.revokeObjectURL(url));
      owned.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadDocument(id)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) {
          setMissing(true);
          return;
        }
        setDocument(loaded.document);
        setTitle(loaded.document.title);
        setPages(loaded.pages.map(toView));
      })
      .catch(() => {
        if (!cancelled) setError("Could not open that document.");
      });
    return () => {
      cancelled = true;
    };
    // toView is recreated each render and only used for the initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function replaceView(pageId: string, page: PageRecord) {
    setPages((current) =>
      current.map((view) => {
        if (view.page.id !== pageId) return view;
        release(view.imageUrl);
        release(view.signatureUrl);
        return toView(page);
      }),
    );
  }

  async function saveTitle() {
    if (!document) return;
    const next = title.trim();
    if (!next || next === document.title) return;
    await renameDocument(document.id, next);
    setDocument({ ...document, title: next });
  }

  async function remove(pageId: string) {
    if (!document) return;
    const removed = await deletePage(document.id, pageId);
    if (removed) {
      router.push("/");
      return;
    }
    setPages((current) => {
      const view = current.find((item) => item.page.id === pageId);
      release(view?.imageUrl ?? null);
      release(view?.signatureUrl ?? null);
      return current.filter((item) => item.page.id !== pageId);
    });
    setDocument({ ...document, pageIds: document.pageIds.filter((value) => value !== pageId) });
  }

  async function commitOrder(next: PageView[]) {
    if (!document) return;
    setPages(next);
    await reorderDocumentPages(document.id, next.map((view) => view.page.id));
  }

  async function rotate(view: PageView) {
    setBusy("Rotating");
    try {
      const imageBlob = await rotateBlob(view.page.imageBlob, 1, 0.92);
      const originalBlob = await rotateBlob(view.page.originalBlob, 1, 0.92);
      const thumbBlob = await rotateBlob(view.page.thumbBlob, 1, 0.72);
      const signature = view.page.signature
        ? { ...view.page.signature, ...rotateNormBox(view.page.signature, 1) }
        : null;
      const page: PageRecord = {
        ...view.page,
        imageBlob,
        originalBlob,
        thumbBlob,
        corners: rotateQuad(view.page.corners, 1),
        ocrWords: rotateOcrWords(view.page.ocrWords, 1, view.page.width, view.page.height),
        width: view.page.height,
        height: view.page.width,
        signature,
      };
      await updatePage(page.id, page);
      replaceView(page.id, page);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not rotate that page.");
    } finally {
      setBusy(null);
    }
  }

  async function runOcr(targets: PageRecord[]) {
    if (!settings) return;
    setBusy("Reading text");
    setError(null);
    try {
      for (let index = 0; index < targets.length; index += 1) {
        const page = targets[index];
        setOcrProgress({ status: `Page ${index + 1} of ${targets.length}`, progress: 0 });
        const result = await recognizeImage(page.imageBlob, settings.ocrLanguages, (progress) => {
          setOcrProgress({ status: `Page ${index + 1}: ${progress.status}`, progress: progress.progress });
        });
        await savePageOcr(page.id, result.text, result.words);
        const updated = { ...page, ocrText: result.text, ocrWords: result.words };
        setPages((current) => current.map((view) => (view.page.id === page.id ? { ...view, page: updated } : view)));
      }
      const loaded = await loadDocument(id);
      if (loaded) setDocument(loaded.document);
      setDialog(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "OCR failed. Check the connection if this is the first run.");
    } finally {
      setBusy(null);
      setOcrProgress(null);
    }
  }

  const ocrText = pages.map((view) => view.page.ocrText.trim()).filter(Boolean).join("\n\n");

  if (missing) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-3xl">Document not found</h1>
        <Link href="/" className="mt-4 inline-flex text-teal">
          Back to library
        </Link>
      </main>
    );
  }

  if (!document) {
    return <main className="px-4 py-16 text-ink-soft">Opening document…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-28 lg:pb-10">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-paper-2" aria-label="Library">
          ←
        </Link>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={saveTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          aria-label="Document title"
          className="h-11 min-w-0 flex-1 rounded-2xl border border-transparent bg-transparent px-2 font-display text-2xl outline-none focus:border-line focus:bg-paper-2"
        />
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto">
        <Link href={`/scan?doc=${document.id}`} className="inline-flex h-11 items-center rounded-full bg-teal px-4 text-sm font-semibold text-white">
          Add pages
        </Link>
        <Button variant="ghost" onClick={() => setDialog("ocr")}>
          <Icon name="text" /> Text
        </Button>
        <Button variant="ghost" onClick={() => setDialog("sign")}>
          <Icon name="sign" /> Sign
        </Button>
        <Button variant="ink" onClick={() => setDialog("export")}>
          Export
        </Button>
      </div>
      {signBlob && <p className="mb-3 text-sm text-ink-soft">Tap a page to place the signature, then drag it into position.</p>}
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {busy && <p className="mb-3 text-sm text-ink-soft">{busy}{ocrProgress ? ` · ${ocrProgress.status}` : ""}</p>}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {pages.map((view, index) => (
          <li key={view.page.id} data-page-index={index} className="rounded-3xl border border-line bg-paper-2 p-3">
            <button
              type="button"
              className="relative block w-full"
              onClick={() => {
                if (!signBlob || view.page.signature) return;
                const signature = emptySignature(signBlob);
                const signatureUrl = track(signBlob);
                const page = { ...view.page, signature };
                setPages((current) => current.map((item) => (item.page.id === page.id ? { ...item, page, signatureUrl } : item)));
                void updatePage(page.id, { signature });
              }}
            >
              <img src={view.imageUrl} alt={`Page ${index + 1}`} className="w-full rounded-2xl bg-white object-contain" />
              {view.page.signature && view.signatureUrl && (
                <img
                  src={view.signatureUrl}
                  alt=""
                  className="absolute touch-none"
                  style={{
                    left: `${view.page.signature.x * 100}%`,
                    top: `${view.page.signature.y * 100}%`,
                    width: `${view.page.signature.w * 100}%`,
                    height: `${view.page.signature.h * 100}%`,
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const wrap = event.currentTarget.parentElement?.getBoundingClientRect();
                    const signature = view.page.signature;
                    if (!wrap || !signature) return;
                    const startX = event.clientX;
                    const startY = event.clientY;
                    const origin = { ...signature };
                    let latest = origin;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const move = (moveEvent: PointerEvent) => {
                      const dx = (moveEvent.clientX - startX) / wrap.width;
                      const dy = (moveEvent.clientY - startY) / wrap.height;
                      latest = {
                        ...origin,
                        x: Math.min(1 - origin.w, Math.max(0, origin.x + dx)),
                        y: Math.min(1 - origin.h, Math.max(0, origin.y + dy)),
                      };
                      const next = latest;
                      setPages((current) =>
                        current.map((item) =>
                          item.page.id === view.page.id ? { ...item, page: { ...item.page, signature: next } } : item,
                        ),
                      );
                    };
                    const up = () => {
                      window.removeEventListener("pointermove", move);
                      window.removeEventListener("pointerup", up);
                      void updatePage(view.page.id, { signature: latest });
                    };
                    window.addEventListener("pointermove", move);
                    window.addEventListener("pointerup", up);
                  }}
                />
              )}
            </button>
            <div className="mt-2 flex flex-wrap gap-1">
              <IconButton label="Move earlier" disabled={index === 0} onClick={() => commitOrder(moveItem(pages, index, index - 1))}>
                <Icon name="up" />
              </IconButton>
              <IconButton label="Move later" disabled={index === pages.length - 1} onClick={() => commitOrder(moveItem(pages, index, index + 1))}>
                <Icon name="down" />
              </IconButton>
              <IconButton
                label="Drag to reorder"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragIndex.current = index;
                }}
                onPointerMove={(event) => {
                  if (dragIndex.current == null) return;
                  const card = globalThis.document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-page-index]");
                  const over = Number(card?.getAttribute("data-page-index"));
                  if (Number.isNaN(over) || over === dragIndex.current) return;
                  const next = moveItem(pagesRef.current, dragIndex.current, over);
                  dragIndex.current = over;
                  pagesRef.current = next;
                  setPages(next);
                }}
                onPointerUp={() => {
                  if (dragIndex.current == null) return;
                  dragIndex.current = null;
                  void reorderDocumentPages(document.id, pagesRef.current.map((view) => view.page.id));
                }}
              >
                <Icon name="grip" />
              </IconButton>
              <IconButton label="Rotate" onClick={() => rotate(view)}>
                <Icon name="rotate" />
              </IconButton>
              <IconButton
                label="Adjust crop"
                onClick={async () => {
                  setBusy("Opening page");
                  try {
                    const raster = await blobToRaster(view.page.originalBlob, 2000);
                    setEditor({ pageId: view.page.id, raster, corners: view.page.corners, filter: view.page.filter });
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : "Could not open that page.");
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Crop
              </IconButton>
              <IconButton label="Read this page" onClick={() => runOcr([view.page])}>
                <Icon name="text" />
              </IconButton>
              <Link href={`/scan?doc=${document.id}&replace=${view.page.id}`} className="grid h-11 place-items-center rounded-full px-3 text-sm font-semibold" aria-label="Retake page">
                Retake
              </Link>
              {view.page.signature && (
                <IconButton
                  label="Remove signature"
                  onClick={() => {
                    release(view.signatureUrl);
                    const page = { ...view.page, signature: null };
                    setPages((current) => current.map((item) => (item.page.id === page.id ? { ...item, page, signatureUrl: null } : item)));
                    void updatePage(page.id, { signature: null });
                  }}
                >
                  <Icon name="sign" />
                </IconButton>
              )}
              <IconButton label="Delete page" onClick={() => remove(view.page.id)}>
                <Icon name="trash" />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>
      {ocrText && (
        <section className="mt-6 rounded-3xl border border-line bg-paper-2 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-semibold">Extracted text</h2>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(ocrText);
                  } catch {
                    setError("Copy was blocked. Download the text file instead.");
                  }
                }}
              >
                Copy
              </Button>
              <Button variant="ghost" onClick={() => downloadBlob(new Blob([ocrText], { type: "text/plain;charset=utf-8" }), safeFileName(document.title, "txt"))}>
                TXT
              </Button>
            </div>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-sm leading-6">{ocrText}</pre>
        </section>
      )}

      {editor && (
        <PageStudio
          initialRaster={editor.raster}
          initialCorners={editor.corners}
          initialFilter={editor.filter}
          primaryLabel="Save page"
          onCancel={() => setEditor(null)}
          onSave={async ({ source, quad, filter, processed }) => {
            const currentSettings = settings;
            const imageBlob = await rasterToBlob(processed, "image/jpeg", currentSettings.jpegQuality);
            const originalBlob = await rasterToBlob(source, "image/jpeg", 0.92);
            const thumbBlob = await makeThumbBlob(processed, THUMB_EDGE);
            const existing = pagesRef.current.find((view) => view.page.id === editor.pageId)?.page;
            await replacePage(editor.pageId, {
              imageBlob,
              originalBlob,
              thumbBlob,
              corners: quad,
              filter,
              width: processed.width,
              height: processed.height,
            });
            if (existing) {
              replaceView(editor.pageId, {
                ...existing,
                imageBlob,
                originalBlob,
                thumbBlob,
                corners: quad,
                filter,
                width: processed.width,
                height: processed.height,
                ocrText: "",
                ocrWords: [],
              });
            }
            setEditor(null);
          }}
        />
      )}

      {dialog === "sign" && (
        <SignatureDialog
          onClose={() => setDialog(null)}
          onUse={(blob) => {
            setSignBlob(blob);
            setDialog(null);
          }}
        />
      )}
      {dialog === "ocr" && settings && (
        <Dialog title="Read text" onClose={() => { setDialog(null); void cancelOcr(); }}>
          <p className="mb-3 text-sm text-ink-soft">
            Recognition runs on this device. The first time, English (~2.9 MB), Malay (~1.2 MB) and Simplified Chinese (~1.7 MB) download, plus the OCR engine (~3–4 MB).
          </p>
          <div className="grid gap-2">
            {OCR_LANGUAGES.map((language) => {
              const checked = settings.ocrLanguages.includes(language.id);
              return (
                <label key={language.id} className="flex items-start gap-3 rounded-2xl border border-line px-3 py-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? settings.ocrLanguages.filter((item) => item !== language.id)
                        : [...settings.ocrLanguages, language.id];
                      const updated = { ...settings, ocrLanguages: next.length ? next : (["eng"] as Settings["ocrLanguages"]) };
                      writeSettings(updated);
                    }}
                  />
                  <span>
                    <span className="block font-semibold">{language.label}</span>
                    <span className="block text-xs text-ink-soft">{language.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {ocrProgress && <p className="mt-3 text-sm">{ocrProgress.status} {Math.round(ocrProgress.progress * 100)}%</p>}
          <Button className="mt-4 w-full" disabled={Boolean(busy)} onClick={() => runOcr(pages.map((view) => view.page))}>
            Read all pages
          </Button>
        </Dialog>
      )}
      {dialog === "export" && settings && (
        <Dialog title="Export" onClose={() => setDialog(null)}>
          <div className="mb-3 flex gap-2">
            {(["pdf", "jpg"] as const).map((kind) => (
              <Button key={kind} variant={exportKind === kind ? "primary" : "ghost"} onClick={() => setExportKind(kind)}>
                {kind.toUpperCase()}
              </Button>
            ))}
          </div>
          {exportKind === "pdf" && (
            <div className="mb-3 flex gap-2">
              {(["a4", "letter", "fit"] as const).map((format) => (
                <Button
                  key={format}
                  variant={settings.pageFormat === format ? "primary" : "ghost"}
                  onClick={() => {
                    const updated = { ...settings, pageFormat: format };
                    writeSettings(updated);
                  }}
                >
                  {format === "a4" ? "A4" : format === "letter" ? "Letter" : "Fit"}
                </Button>
              ))}
            </div>
          )}
          <label className="mb-3 block text-sm">
            Quality {Math.round(settings.jpegQuality * 100)}%
            <input
              type="range"
              min={0.5}
              max={0.95}
              step={0.01}
              value={settings.jpegQuality}
              className="mt-2 w-full"
              onChange={(event) => {
                const updated = { ...settings, jpegQuality: Number(event.target.value) };
                writeSettings(updated);
              }}
            />
          </label>
          {exportKind === "pdf" && (
            <label className="mb-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings.includeTextLayer}
                onChange={(event) => {
                  const updated = { ...settings, includeTextLayer: event.target.checked };
                  writeSettings(updated);
                }}
              />
              <span>
                Invisible text layer for Latin script. Simplified Chinese is included in the TXT export, not inside the PDF, because the embedded font is WinAnsi.
              </span>
            </label>
          )}
          <Button
            className="w-full"
            disabled={Boolean(busy)}
            onClick={async () => {
              setBusy("Exporting");
              setError(null);
              try {
                const result = await exportDocumentFiles({
                  document,
                  pages: pages.map((view) => view.page),
                  kind: exportKind,
                  pageFormat: settings.pageFormat,
                  quality: settings.jpegQuality,
                  includeTextLayer: settings.includeTextLayer,
                });
                if (result === "cancelled") return;
                setDialog(null);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Export failed.");
              } finally {
                setBusy(null);
              }
            }}
          >
            Share or download
          </Button>
          <p className="mt-2 text-xs text-ink-soft">On a phone this opens the share sheet, including WhatsApp. Otherwise the file downloads. Several JPGs download as one zip.</p>
        </Dialog>
      )}
    </main>
  );
}

function IconButton({
  label,
  children,
  disabled,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      title={label}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="grid h-11 min-w-11 place-items-center rounded-full px-2 text-ink hover:bg-paper disabled:opacity-30"
    >
      {children}
    </button>
  );
}
