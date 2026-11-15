"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { OCR_LANGUAGES, PAGE_FORMATS } from "@/lib/constants";
import type { Settings } from "@/lib/settings";
import { useOnline } from "@/components/pwa-register";
import { useSettings, writeSettings } from "@/components/use-settings";

function readInstallHint(): string {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  if (ios && !standalone) return "On iPhone or iPad, open the Share menu and choose Add to Home Screen.";
  if (standalone) return "This copy is already installed.";
  return "In Chrome or Edge, use the browser menu and choose Install app.";
}

export function SettingsScreen() {
  const settings = useSettings();
  const online = useOnline();
  const installHint = useSyncExternalStore(
    () => () => {},
    readInstallHint,
    () => "Install from the browser menu once this page is open on your phone or computer.",
  );

  function update(next: Settings) {
    writeSettings(next);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-5 pb-28 lg:pb-10">
      <Link href="/" className="text-sm font-semibold text-teal">
        ← Library
      </Link>
      <h1 className="mt-3 font-display text-4xl">Settings</h1>
      <p className="mt-2 text-sm text-ink-soft">{online ? "Online" : "Offline"} · nothing here is uploaded.</p>

      <section className="mt-6 rounded-3xl border border-line bg-paper-2 p-4">
        <h2 className="font-semibold">Default PDF page</h2>
        <div className="mt-3 flex gap-2">
          {PAGE_FORMATS.map((format) => (
            <button
              key={format.id}
              type="button"
              className={`h-11 rounded-full px-4 text-sm font-semibold ${settings.pageFormat === format.id ? "bg-teal text-white" : "border border-line"}`}
              onClick={() => update({ ...settings, pageFormat: format.id })}
            >
              {format.label}
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm">
          JPEG quality {Math.round(settings.jpegQuality * 100)}%
          <input
            type="range"
            min={0.5}
            max={0.95}
            step={0.01}
            value={settings.jpegQuality}
            className="mt-2 w-full"
            onChange={(event) => update({ ...settings, jpegQuality: Number(event.target.value) })}
          />
        </label>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings.reviewEachCapture}
            onChange={(event) => update({ ...settings, reviewEachCapture: event.target.checked })}
          />
          Review corners after each camera shot. Turn this off for a faster batch.
        </label>
      </section>

      <section className="mt-4 rounded-3xl border border-line bg-paper-2 p-4">
        <h2 className="font-semibold">OCR languages</h2>
        <div className="mt-3 grid gap-2">
          {OCR_LANGUAGES.map((language) => {
            const checked = settings.ocrLanguages.includes(language.id);
            return (
              <label key={language.id} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? settings.ocrLanguages.filter((item) => item !== language.id)
                      : [...settings.ocrLanguages, language.id];
                    update({ ...settings, ocrLanguages: next.length ? next : ["eng"] });
                  }}
                />
                <span>
                  <span className="block font-medium">{language.label}</span>
                  <span className="block text-xs text-ink-soft">{language.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="mt-4 rounded-3xl border border-line bg-paper-2 p-4">
        <h2 className="font-semibold">Install</h2>
        <p className="mt-2 text-sm text-ink-soft">{installHint}</p>
        <p className="mt-3 text-sm text-ink-soft">
          After the app has been opened once, the service worker keeps the shell available offline. OCR language files are cached after their first download. iOS may still ask for the camera in Safari before the home-screen app can use it.
        </p>
      </section>

      <section className="mt-4 rounded-3xl border border-line bg-paper-2 p-4 text-sm leading-6 text-ink-soft">
        <h2 className="font-semibold text-ink">About</h2>
        <p className="mt-2">
          SR-CScanner is a private scanner for Sunrise Recruit. Version 1 has no account, no cloud copy, and no paid API. Clearing this site’s data deletes the library.
        </p>
        <p className="mt-2">Not in this version: sync, asking someone else to sign, translation, tamper checks, fax, and Office conversion.</p>
      </section>
    </main>
  );
}
