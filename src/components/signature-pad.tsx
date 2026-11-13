"use client";

import { useEffect, useRef, useState } from "react";
import { deleteSignature, listSignatures, saveSignature } from "@/lib/db";
import { imageToRaster, rasterToBlob } from "@/lib/image-io";
import { trimAlpha } from "@/lib/raster";
import type { SignatureRecord } from "@/lib/types";
import { Button, Dialog } from "@/components/ui";

export function SignatureDialog({
  onClose,
  onUse,
}: {
  onClose: () => void;
  onUse: (blob: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [saved, setSaved] = useState<Array<SignatureRecord & { url: string }>>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const urls: string[] = [];
    let cancelled = false;
    listSignatures().then((rows) => {
      if (cancelled) return;
      setSaved(
        rows.map((row) => {
          const url = URL.createObjectURL(row.blob);
          urls.push(url);
          return { ...row, url };
        }),
      );
    });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.lineWidth = 2.4 * ratio;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#1c1915";
  }, []);

  function position(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const point = position(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const point = position(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function inkBlob(): Promise<Blob | null> {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const raster = trimAlpha(imageToRaster(canvas, 900), 16);
    let ink = false;
    for (let index = 3; index < raster.data.length; index += 4) {
      if (raster.data[index] > 12) {
        ink = true;
        break;
      }
    }
    if (!ink) return null;
    return rasterToBlob(raster, "image/png");
  }

  async function useDrawn() {
    const blob = await inkBlob();
    if (!blob) {
      setMessage("Draw a signature first.");
      return;
    }
    onUse(blob);
  }

  async function keepAndUse() {
    const blob = await inkBlob();
    if (!blob) {
      setMessage("Draw a signature first.");
      return;
    }
    await saveSignature(blob);
    onUse(blob);
  }

  return (
    <Dialog title="Sign" onClose={onClose}>
      <p className="mb-3 text-sm text-ink-soft">Draw with your finger or mouse. The signature stays in this document on this device.</p>
      <canvas
        ref={canvasRef}
        className="h-40 w-full touch-none rounded-2xl border border-line bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      {message && <p className="mt-2 text-sm text-danger">{message}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={clear}>
          Clear
        </Button>
        <Button variant="ghost" onClick={keepAndUse}>
          Save and use
        </Button>
        <Button onClick={useDrawn}>Use once</Button>
      </div>
      {saved.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold">Saved signatures</p>
          <ul className="grid grid-cols-2 gap-2">
            {saved.map((item) => (
              <li key={item.id} className="rounded-2xl border border-line p-2">
                <button type="button" className="block w-full" onClick={() => onUse(item.blob)}>
                  <img src={item.url} alt="" className="h-16 w-full object-contain" />
                </button>
                <button
                  type="button"
                  className="mt-1 text-xs text-danger"
                  onClick={async () => {
                    await deleteSignature(item.id);
                    setSaved((current) => current.filter((row) => row.id !== item.id));
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
