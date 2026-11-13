export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function pagesForExport<T extends { selected: boolean }>(pages: readonly T[]): T[] {
  const selected = pages.filter((page) => page.selected);
  return selected.length > 0 ? selected : [...pages];
}
