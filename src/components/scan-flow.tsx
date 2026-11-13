"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PageStudio } from "@/components/page-studio";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { MAX_PROCESSING_EDGE, THUMB_EDGE } from "@/lib/constants";
import { addPage, createDocument, deleteDocument, deletePage, replacePage, type NewPageInput } from "@/lib/db";
import { detectDocumentQuad } from "@/lib/detect";
import { fullQuad, isConvexQuad } from "@/lib/geometry";
import { defaultDocumentTitle } from "@/lib/ids";
import { blobToRaster, captureVideoFrame, makeThumbBlob, rasterToBlob } from "@/lib/image-io";
import { pdfErrorMessage, renderPdfPageBlobs } from "@/lib/pdf-render";
import { processInBackground } from "@/lib/pipeline";
import { loadSettings } from "@/lib/settings";
import { useSettings, writeSettings } from "@/components/use-settings";
import type { FilterId, Quad, Raster } from "@/lib/types";

export function ScanFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const existingDocId = params.get("doc");
  const replaceId = params.get("replace");
  const videoRef = useRef<HTMLVideoElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const settings = useSettings();
  const secure = useSyncExternalStore(
    () => () => {},
    () => window.isSecureContext,
    () => true,
  );
  const cameraApi = useSyncExternalStore(
    () => () => {},
    () => Boolean(navigator.mediaDevices?.getUserMedia),
    () => true,
  );
  const [pageCount, setPageCount] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [studio, setStudio] = useState<{ raster: Raster; corners: Quad | null; filter: FilterId } | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const docIdRef = useRef<string | null>(existingDocId);

  useEffect(() => {
    if (studio || !secure || !cameraApi) return;
    let cancelled = false;
    let localStream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: facing === "environment" ? { ideal: "environment" } : { ideal: "user" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .then((next) => {
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        localStream = next;
        setStream(next);
        const track = next.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        setTorchAvailable(Boolean(capabilities?.torch));
      })
      .catch(() => {
        if (!cancelled) setCameraError("Camera permission was blocked. Import a photo, or allow the camera and try again.");
      });
    return () => {
      cancelled = true;
      localStream?.getTracks().forEach((track) => track.stop());
      setStream(null);
    };
  }, [facing, studio, secure, cameraApi]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => {
      setCameraError("The camera preview did not start. Import a photo instead.");
    });
  }, [stream]);

  async function ensureDocument(): Promise<string> {
    if (docIdRef.current) return docIdRef.current;
    const id = await createDocument(defaultDocumentTitle());
    docIdRef.current = id;
    setCreatedId(id);
    return id;
  }

  async function storePage(input: NewPageInput) {
    if (existingDocId && replaceId) {
      await replacePage(replaceId, input);
      router.push(`/doc/${existingDocId}`);
      return;
    }
    const documentId = await ensureDocument();
    const pageId = await addPage(documentId, input);
    setAddedIds((current) => [...current, pageId]);
    setPageCount((count) => count + 1);
    setStudio(null);
    setStatus(null);
  }

  async function persistProcessed(source: Raster, quad: Quad, filter: FilterId) {
    setStatus("Saving page");
    const settings = loadSettings();
    const processed = await processInBackground(source, quad, filter, MAX_PROCESSING_EDGE);
    const imageBlob = await rasterToBlob(processed, "image/jpeg", settings.jpegQuality);
    const originalBlob = await rasterToBlob(source, "image/jpeg", 0.92);
    const thumbBlob = await makeThumbBlob(processed, THUMB_EDGE);
    await storePage({
      imageBlob,
      originalBlob,
      thumbBlob,
      corners: quad,
      filter,
      width: processed.width,
      height: processed.height,
    });
  }

  async function persistFlat(raster: Raster) {
    const settings = loadSettings();
    const imageBlob = await rasterToBlob(raster, "image/jpeg", settings.jpegQuality);
    const thumbBlob = await makeThumbBlob(raster, THUMB_EDGE);
    await storePage({
      imageBlob,
      originalBlob: imageBlob,
      thumbBlob,
      corners: fullQuad(),
      filter: "original",
      width: raster.width,
      height: raster.height,
    });
  }

  async function acceptPhoto(raster: Raster) {
    const settings = loadSettings();
    if (!settings.reviewEachCapture && !replaceId) {
      const detection = detectDocumentQuad(raster);
      if (detection.confidence >= 0.28 && isConvexQuad(detection.quad)) {
        await persistProcessed(raster, detection.quad, "auto");
        return;
      }
    }
    setStudio({ raster, corners: null, filter: "auto" });
    setStatus(null);
  }

  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    try {
      await acceptPhoto(captureVideoFrame(video, MAX_PROCESSING_EDGE));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not capture that frame.");
    }
  }

  async function onFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = [...fileList];
    setError(null);
    try {
      if (replaceId && files.length !== 1) {
        throw new Error("Retake replaces a single page. Choose one photo.");
      }
      const images = files.filter((file) => file.type.startsWith("image/"));
      const pdfs = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
      if (replaceId && pdfs.length > 0) throw new Error("Retake uses a photo, not a PDF.");
      if (images.length === 1 && pdfs.length === 0) {
        await acceptPhoto(await blobToRaster(images[0], MAX_PROCESSING_EDGE));
        return;
      }
      let index = 0;
      const total = images.length;
      for (const image of images) {
        index += 1;
        setStatus(`Importing ${index} of ${total}`);
        const raster = await blobToRaster(image, MAX_PROCESSING_EDGE);
        const detection = detectDocumentQuad(raster);
        if (detection.confidence >= 0.28 && isConvexQuad(detection.quad)) {
          await persistProcessed(raster, detection.quad, "auto");
        } else {
          await persistFlat(raster);
        }
      }
      for (const pdf of pdfs) {
        const bytes = new Uint8Array(await pdf.arrayBuffer());
        let rendered;
        try {
          rendered = await renderPdfPageBlobs(bytes, MAX_PROCESSING_EDGE, (done, count) => {
            setStatus(`Reading PDF page ${done} of ${count}`);
          });
        } catch (caught) {
          throw new Error(pdfErrorMessage(caught));
        }
        for (const blob of rendered.blobs) {
          await persistFlat(await blobToRaster(blob, MAX_PROCESSING_EDGE));
        }
        if (rendered.truncated) {
          setError(`Imported the first ${rendered.blobs.length} pages of ${pdf.name}.`);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import that file.");
    } finally {
      setStatus(null);
      if (importRef.current) importRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  async function toggleTorch() {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }

  function toggleReview() {
    writeSettings({ ...loadSettings(), reviewEachCapture: !settings.reviewEachCapture });
  }

  async function discard() {
    if (createdId) await deleteDocument(createdId);
    else if (existingDocId) {
      for (const pageId of addedIds) await deletePage(existingDocId, pageId);
    }
    router.push(existingDocId && !createdId ? `/doc/${existingDocId}` : "/");
  }

  function finish() {
    const id = docIdRef.current;
    if (!id) {
      router.push("/");
      return;
    }
    router.push(`/doc/${id}`);
  }

  return (
    <div className="min-h-dvh bg-ink text-white lg:bg-paper lg:p-6">
      <div className="relative mx-auto flex h-dvh w-full max-w-lg flex-col overflow-hidden bg-ink lg:h-[calc(100dvh-3rem)] lg:rounded-[2rem]">
        {studio ? (
          <PageStudio
            initialRaster={studio.raster}
            initialCorners={studio.corners}
            initialFilter={studio.filter}
            primaryLabel={replaceId ? "Replace page" : "Add page"}
            onCancel={() => setStudio(null)}
            onRetake={() => setStudio(null)}
            onSave={async ({ source, quad, filter, processed }) => {
              const settings = loadSettings();
              const imageBlob = await rasterToBlob(processed, "image/jpeg", settings.jpegQuality);
              const originalBlob = await rasterToBlob(source, "image/jpeg", 0.92);
              const thumbBlob = await makeThumbBlob(processed, THUMB_EDGE);
              await storePage({
                imageBlob,
                originalBlob,
                thumbBlob,
                corners: quad,
                filter,
                width: processed.width,
                height: processed.height,
              });
            }}
          />
        ) : (
          <>
            <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <Link href={existingDocId ? `/doc/${existingDocId}` : "/"} className="grid h-11 w-11 place-items-center rounded-full bg-black/40" aria-label="Close scanner">
                ×
              </Link>
              <button type="button" className="rounded-full bg-black/40 px-3 py-2 text-sm font-medium" onClick={toggleReview}>
                {settings.reviewEachCapture ? "Review each page" : "Quick capture"}
              </button>
              {torchAvailable ? (
                <button type="button" className="h-11 rounded-full bg-black/40 px-3 text-sm" onClick={toggleTorch}>
                  {torchOn ? "Light on" : "Light"}
                </button>
              ) : (
                <span className="w-11" />
              )}
            </header>
            <div className="relative min-h-0 flex-1 bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
              <div className="pointer-events-none absolute inset-8 rounded-2xl border border-white/50" />
              {(cameraError || error || status || !secure || !cameraApi) && (
                <p className="absolute inset-x-4 bottom-4 rounded-2xl bg-black/70 px-4 py-3 text-sm" role="status">
                  {error ||
                    status ||
                    cameraError ||
                    (!secure
                      ? "The camera needs HTTPS. You can still import a photo."
                      : "This browser has no camera API. Import a photo instead.")}
                </p>
              )}
            </div>
            <footer className="grid grid-cols-3 items-center px-6 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <div>
                <button type="button" className="grid h-12 w-12 place-items-center rounded-full bg-white/10" onClick={() => importRef.current?.click()} aria-label="Import photos or PDF">
                  <Icon name="image" />
                </button>
              </div>
              <button type="button" className="mx-auto grid h-20 w-20 place-items-center rounded-full border-4 border-white" onClick={capture} aria-label="Capture page">
                <span className="h-14 w-14 rounded-full bg-white" />
              </button>
              <div className="flex flex-col items-end gap-2">
                <button type="button" className="text-xs font-medium text-white/80" onClick={() => setFacing((current) => (current === "environment" ? "user" : "environment"))}>
                  Flip
                </button>
                {pageCount > 0 ? (
                  <Button variant="amber" onClick={finish}>
                    Done · {pageCount}
                  </Button>
                ) : (
                  <button type="button" className="text-sm text-white/70" onClick={() => cameraInputRef.current?.click()}>
                    <Icon name="camera" className="mx-auto" />
                    Photo
                  </button>
                )}
              </div>
            </footer>
            {pageCount > 0 && (
              <div className="px-6 pb-4">
                <button type="button" className="text-sm text-white/70" onClick={discard}>
                  Discard these pages
                </button>
              </div>
            )}
          </>
        )}
        <input ref={importRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(event) => onFiles(event.target.files)} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => onFiles(event.target.files)} />
      </div>
    </div>
  );
}
