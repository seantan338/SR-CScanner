export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}

export function defaultDocumentTitle(date = new Date()): string {
  const formatted = new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `Scan ${formatted}`;
}

export function formatWhen(timestamp: number): string {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

export function safeFileName(title: string, extension: string): string {
  const cleaned = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  const base = cleaned || "document";
  const ext = extension.replace(/^\./, "");
  return `${base}.${ext}`;
}

export function normalizeTag(input: string): string | null {
  const tag = input.trim().replace(/\s+/g, " ").slice(0, 32);
  return tag || null;
}
