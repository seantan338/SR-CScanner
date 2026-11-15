"use client";

import { useSyncExternalStore } from "react";
import { defaultSettings, loadSettings, saveSettings, type Settings } from "@/lib/settings";

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): string {
  return JSON.stringify(loadSettings());
}

function serverSnapshot(): string {
  return JSON.stringify({ ...defaultSettings, ocrLanguages: [...defaultSettings.ocrLanguages] });
}

export function useSettings(): Settings {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return JSON.parse(raw) as Settings;
}

export function writeSettings(next: Settings): void {
  saveSettings(next);
  emit();
}
