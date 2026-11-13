"use client";

import { useEffect, useRef, useState } from "react";
import { FILTERS, MAX_PROCESSING_EDGE } from "@/lib/constants";
import { detectDocumentQuad } from "@/lib/detect";
import { applyFilter } from "@/lib/filters";
import { clamp, isConvexQuad, polygonArea, rotateQuad } from "@/lib/geometry";
import { drawRaster, rasterToBlob } from "@/lib/image-io";
import { warpInBackground } from "@/lib/pipeline";
import { resizeToEdge, rotateRaster } from "@/lib/raster";
import type { FilterId, Quad, Raster } from "@/lib/types";
import { yieldToUi } from "@/lib/yield";
import { Icon } from "@/components/icons";
import { Button, cx } from "@/components/ui";

export function PageStudio({
  initialRaster,
  initialCorners,
  initialFilter,
  primaryLabel,
  onCancel,
  onRetake,
  onSave,
}: {
  initialRaster: Raster;
  initialCorners: Quad | null;
  initialFilter: FilterId;
  primaryLabel: string;
  onCancel: () => void;
  onRetake?: () => void;
  onSave: (result: { source: Raster; quad: Quad; filter: FilterId; processed: Raster }) => Promise<void>;
}) {
  const [source, setSource] = useState(initialRaster);
  const [corners, setCorners] = useState<Quad | null>(initialCorners);
  const [confidence, setConfidence] = useState(initialCorners ? 1 : 0);
  const [step, setStep] = useState<"crop" | "enhance">("crop");
  const [filter, setFilter] = useState<FilterId>(initialFilter);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(initialCorners ? null : "Finding edges");
  const [error, setError] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ index: number | "all"; start: Quad; x: number; y: number } | null>(null);
  const warpedRef = useRef<Raster | null>(null);
  const previewBaseRef = useRef<Raster | null>(null);
  const filterRef = useRef(filter);
  const detectedRef = useRef(Boolean(initialCorners));
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || step !== "crop") return;
    drawRaster(canvas, source);
  }, [source, step]);

  useEffect(() => {
    if (detectedRef.current) return;
    const timer = window.setTimeout(() => {
      const detection = detectDocumentQuad(source);
      detectedRef.current = true;
      setCorners(detection.quad);
      setConfidence(detection.confidence);
      setBusy(null);
    }, 40);
    return () => window.clearTimeout(timer);
  }, [source]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function showFiltered(next: FilterId) {
    const base = previewBaseRef.current;
    if (!base) return;
    await yieldToUi();
    const filtered = applyFilter(base, next);
    const blob = await rasterToBlob(filtered, "image/jpeg", 0.86);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(blob);
    });
  }

  async function continueToEnhance() {
    if (!corners || !isConvexQuad(corners) || polygonArea(corners) < 0.02) {
      setError("Drag the four corners around the page. They need to form a proper shape.");
      return;
    }
    setError(null);
    setStep("enhance");
    setBusy("Straightening");
    try {
      const warped = await warpInBackground(source, corners, MAX_PROCESSING_EDGE);
      warpedRef.current = warped;
      previewBaseRef.current = resizeToEdge(warped, 1100);
      await showFiltered(filterRef.current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not straighten that page.");
      setStep("crop");
    } finally {
      setBusy(null);
    }
  }

  async function changeFilter(next: FilterId) {
    setFilter(next);
    setBusy("Applying filter");
    try {
      await showFiltered(next);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const warped = warpedRef.current;
    if (!warped || !corners) return;
    setBusy("Preparing page");
    setError(null);
    try {
      await yieldToUi();
      const processed = applyFilter(warped, filter);
      await onSave({ source, quad: corners, filter, processed });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that page.");
    } finally {
      setBusy(null);
    }
  }

  function pointFromEvent(event: React.PointerEvent): { x: number; y: number } | null {
    const frame = frameRef.current;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function onCornerDown(event: React.PointerEvent, index: number) {
    if (!corners) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    if (!point) return;
    dragRef.current = { index, start: corners, x: point.x, y: point.y };
  }

  function onFrameDown(event: React.PointerEvent) {
    if (!corners) return;
    const point = pointFromEvent(event);
    if (!point) return;
    dragRef.current = { index: "all", start: corners, x: point.x, y: point.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointFromEvent(event);
    if (!point) return;
    if (drag.index === "all") {
      const xs = drag.start.map((corner) => corner.x);
      const ys = drag.start.map((corner) => corner.y);
      const dx = clamp(point.x - drag.x, -Math.min(...xs), 1 - Math.max(...xs));
      const dy = clamp(point.y - drag.y, -Math.min(...ys), 1 - Math.max(...ys));
      setCorners(drag.start.map((corner) => ({ x: corner.x + dx, y: corner.y + dy })) as Quad);
      return;
    }
    setCorners((current) => {
      if (!current) return current;
      return current.map((corner, index) => (index === drag.index ? point : corner)) as Quad;
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function rotate() {
    setSource((current) => rotateRaster(current, 1));
    setCorners((current) => (current ? rotateQuad(current, 1) : current));
    warpedRef.current = null;
    if (step === "enhance") setStep("crop");
  }

  const points = corners?.map((corner) => `${corner.x * 100},${corner.y * 100}`).join(" ");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink text-white">
      <header className="flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" className="h-11 rounded-full px-3 text-sm font-semibold" onClick={onCancel}>
          Cancel
        </button>
        <p className="text-sm font-medium">{step === "crop" ? "Adjust corners" : "Enhance"}</p>
        <button type="button" className="grid h-11 w-11 place-items-center rounded-full" onClick={rotate} aria-label="Rotate page">
          <Icon name="rotate" />
        </button>
      </header>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-3">
        {step === "crop" ? (
          <div
            ref={frameRef}
            className="relative w-full max-w-3xl touch-none"
            style={{ aspectRatio: `${source.width} / ${source.height}` }}
            onPointerDown={onFrameDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <canvas ref={canvasRef} className="h-full w-full rounded-lg bg-ink" />
            {corners && points && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <mask id="page-cutout">
                    <rect width="100" height="100" fill="white" />
                    <polygon points={points} fill="black" />
                  </mask>
                </defs>
                <rect width="100" height="100" fill="rgba(12,10,8,0.55)" mask="url(#page-cutout)" />
                <polygon points={points} fill="none" stroke="#fffdf8" strokeWidth="0.6" />
              </svg>
            )}
            {corners?.map((corner, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Corner ${index + 1}`}
                className="absolute z-10 h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none"
                style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }}
                onPointerDown={(event) => onCornerDown(event, index)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                <span className="absolute top-1/2 left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber" />
              </button>
            ))}
          </div>
        ) : (
          previewUrl && <img src={previewUrl} alt="Straightened page preview" className="max-h-full max-w-full rounded-lg object-contain" />
        )}
        {busy && (
          <p className="absolute bottom-3 rounded-full bg-black/70 px-3 py-1 text-sm" role="status">
            {busy}…
          </p>
        )}
      </div>
      <footer className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error && <p className="text-sm text-amber">{error}</p>}
        {step === "crop" && confidence < 0.35 && confidence > 0 && (
          <p className="text-sm text-white/75">Edges look uncertain. Drag the corners until they sit on the page.</p>
        )}
        {step === "enhance" && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cx(
                  "h-10 shrink-0 rounded-full px-4 text-sm font-semibold",
                  filter === item.id ? "bg-white text-ink" : "bg-white/10 text-white",
                )}
                onClick={() => changeFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          {onRetake && (
            <Button variant="ghost" className="border-white/20 bg-transparent text-white" onClick={onRetake}>
              Retake
            </Button>
          )}
          {step === "enhance" && (
            <Button variant="ghost" className="border-white/20 bg-transparent text-white" onClick={() => setStep("crop")}>
              Corners
            </Button>
          )}
          <Button className="flex-1" variant="amber" disabled={Boolean(busy) || !corners} onClick={step === "crop" ? continueToEnhance : save}>
            {step === "crop" ? "Continue" : primaryLabel}
          </Button>
        </div>
      </footer>
    </div>
  );
}
