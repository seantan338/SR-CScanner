export interface SearchableDocument {
  title: string;
  tags: string[];
  ocrText: string;
  folderId: string | null;
}

export function documentMatches(
  document: SearchableDocument,
  query: string,
  folderId: string | "all" | "unfiled",
  tag: string | null,
): boolean {
  if (folderId === "unfiled" && document.folderId) return false;
  if (folderId !== "all" && folderId !== "unfiled" && document.folderId !== folderId) return false;
  if (tag && !document.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) return false;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (document.title.toLowerCase().includes(needle)) return true;
  if (document.ocrText.toLowerCase().includes(needle)) return true;
  return document.tags.some((item) => item.toLowerCase().includes(needle));
}
