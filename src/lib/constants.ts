import type { FilterId, PageFormat } from "@/lib/types";

export const MAX_PROCESSING_EDGE = 2000;
export const THUMB_EDGE = 360;
export const DETECT_MAX_EDGE = 480;

export const FILTERS: { id: FilterId; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "auto", label: "Auto" },
  { id: "grayscale", label: "Gray" },
  { id: "bw", label: "B&W" },
  { id: "magic", label: "Magic" },
];

export const PAGE_FORMATS: { id: PageFormat; label: string }[] = [
  { id: "a4", label: "A4" },
  { id: "letter", label: "Letter" },
  { id: "fit", label: "Fit" },
];

/**
 * Gzipped sizes of the Tesseract LSTM integer models on jsDelivr, plus the
 * WASM core the first recognition also downloads (about 3–4 MB).
 */
export const OCR_LANGUAGES = [
  { id: "eng", label: "English", hint: "About 2.9 MB the first time" },
  { id: "chi_sim", label: "简体中文", hint: "About 1.7 MB the first time. Slower on a phone." },
  { id: "msa", label: "Bahasa Melayu", hint: "About 1.2 MB the first time" },
] as const;

export type OcrLanguageId = (typeof OCR_LANGUAGES)[number]["id"];
