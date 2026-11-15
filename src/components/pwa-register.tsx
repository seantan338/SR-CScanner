"use client";

import { useEffect, useState } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is best-effort. The scanner still works online without it.
    });
  }, []);
  return null;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function OfflineNote() {
  const online = useOnline();
  if (online) return null;
  return (
    <p className="border-b border-amber/40 bg-amber/20 px-4 py-2 text-center text-sm text-ink">
      You are offline. Saved documents still open. New OCR languages need a connection the first time.
    </p>
  );
}
