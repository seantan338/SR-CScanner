import { safeFileName } from "@/lib/ids";
import { bytesToBlob, zipNamedFiles } from "@/lib/zip-files";

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

export async function shareOrDownload(
  files: File[],
  title: string,
): Promise<"shared" | "downloaded" | "cancelled"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    const payload: ShareData = { files, title };
    const allowed = typeof navigator.canShare === "function" ? navigator.canShare(payload) : files.length === 1;
    if (allowed) {
      try {
        await navigator.share(payload);
        return "shared";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      }
    }
  }
  if (files.length > 1) {
    const entries = await Promise.all(
      files.map(async (file) => ({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) })),
    );
    downloadBlob(bytesToBlob(zipNamedFiles(entries), "application/zip"), safeFileName(title, "zip"));
    return "downloaded";
  }
  downloadBlob(files[0], files[0].name);
  return "downloaded";
}
