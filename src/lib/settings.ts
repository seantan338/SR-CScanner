import { OCR_LANGUAGES, type OcrLanguageId } from "@/lib/constants";
import type { PageFormat } from "@/lib/types";

export interface Settings {
  pageFormat: PageFormat;
  jpegQuality: number;
  ocrLanguages: OcrLanguageId[];
  reviewEachCapture: boolean;
  includeTextLayer: boolean;
}

export const defaultSettings: Settings = {
  pageFormat: "a4",
  jpegQuality: 0.82,
  ocrLanguages: ["eng"],
  reviewEachCapture: true,
  includeTextLayer: true,
};

const KEY = "sr-cscanner-settings-v1";
const FORMATS: PageFormat[] = ["a4", "letter", "fit"];
const LANGS = new Set<string>(OCR_LANGUAGES.map((language) => language.id));

export function sanitizeSettings(value: Partial<Settings> | null | undefined): Settings {
  const languages = Array.isArray(value?.ocrLanguages)
    ? value.ocrLanguages.filter((language): language is OcrLanguageId => LANGS.has(language))
    : [];
  const quality = typeof value?.jpegQuality === "number" ? value.jpegQuality : defaultSettings.jpegQuality;
  const format = value?.pageFormat && FORMATS.includes(value.pageFormat) ? value.pageFormat : defaultSettings.pageFormat;
  return {
    pageFormat: format,
    jpegQuality: Math.min(0.95, Math.max(0.5, quality)),
    ocrLanguages: languages.length > 0 ? languages : ["eng"],
    reviewEachCapture: value?.reviewEachCapture ?? defaultSettings.reviewEachCapture,
    includeTextLayer: value?.includeTextLayer ?? defaultSettings.includeTextLayer,
  };
}

export function loadSettings(): Settings {
  if (typeof window === "undefined") return { ...defaultSettings, ocrLanguages: [...defaultSettings.ocrLanguages] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...defaultSettings, ocrLanguages: [...defaultSettings.ocrLanguages] };
    return sanitizeSettings(JSON.parse(raw) as Partial<Settings>);
  } catch {
    return { ...defaultSettings, ocrLanguages: [...defaultSettings.ocrLanguages] };
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return;
  const next = sanitizeSettings(settings);
  window.localStorage.setItem(KEY, JSON.stringify(next));
}
