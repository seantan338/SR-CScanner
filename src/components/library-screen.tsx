"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Button, Dialog, cx } from "@/components/ui";
import {
  createFolder,
  deleteDocument,
  deleteFolder,
  listLibrary,
  renameDocument,
  setDocumentFolder,
  setDocumentTags,
  type LibraryItem,
} from "@/lib/db";
import { formatWhen, normalizeTag } from "@/lib/ids";
import { documentMatches } from "@/lib/search";
import type { FolderRecord } from "@/lib/types";

type DialogState =
  | { kind: "menu"; id: string }
  | { kind: "rename"; id: string }
  | { kind: "tag"; id: string }
  | { kind: "move"; id: string }
  | { kind: "folder" }
  | null;

export function LibraryScreen() {
  const [items, setItems] = useState<Array<LibraryItem & { thumbUrl: string | null }> | null>(null);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [query, setQuery] = useState("");
  const [folderId, setFolderId] = useState<string | "all" | "unfiled">("all");
  const [tag, setTag] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const thumbUrls = useRef<string[]>([]);

  function showLibrary(library: Awaited<ReturnType<typeof listLibrary>>) {
    thumbUrls.current.forEach((url) => URL.revokeObjectURL(url));
    thumbUrls.current = [];
    setFolders(library.folders);
    setItems(
      library.documents.map((item) => {
        const thumbUrl = item.thumbBlob ? URL.createObjectURL(item.thumbBlob) : null;
        if (thumbUrl) thumbUrls.current.push(thumbUrl);
        return { ...item, thumbUrl };
      }),
    );
  }

  async function reload() {
    showLibrary(await listLibrary());
  }

  useEffect(() => {
    let cancelled = false;
    listLibrary()
      .then((library) => {
        if (!cancelled) showLibrary(library);
      })
      .catch(() => {
        if (!cancelled) setError("Could not open the document library on this device.");
      });
    return () => {
      cancelled = true;
      thumbUrls.current.forEach((url) => URL.revokeObjectURL(url));
      thumbUrls.current = [];
    };
  }, []);

  const tags = useMemo(() => {
    const values = new Set<string>();
    items?.forEach((item) => item.document.tags.forEach((itemTag) => values.add(itemTag)));
    return [...values];
  }, [items]);

  const visible = useMemo(() => {
    return (items ?? []).filter((item) =>
      documentMatches(
        {
          title: item.document.title,
          tags: item.document.tags,
          ocrText: item.document.ocrText,
          folderId: item.document.folderId,
        },
        query,
        folderId,
        tag,
      ),
    );
  }, [items, query, folderId, tag]);

  const active = items?.find((item) => dialog && "id" in dialog && item.document.id === dialog.id);

  async function commitRename() {
    if (!active) return;
    await renameDocument(active.document.id, draft);
    setDialog(null);
    await reload();
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-5 pb-28 lg:pb-10">
      <header className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-tight text-ink">SR-CScanner</h1>
          <p className="mt-1 text-sm text-ink-soft">Sunrise Recruit · documents stay on this device</p>
        </div>
        <Link
          href="/settings"
          className="grid h-11 w-11 place-items-center rounded-full border border-line bg-paper-2"
          aria-label="Settings"
        >
          <Icon name="settings" />
        </Link>
      </header>
      <label className="mb-4 flex h-12 items-center gap-2 rounded-full border border-line bg-paper-2 px-4">
        <Icon name="search" className="text-ink-soft" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search titles, tags, or OCR text"
          className="w-full bg-transparent outline-none"
          aria-label="Search documents"
        />
      </label>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <FilterChip active={folderId === "all" && !tag} onClick={() => { setFolderId("all"); setTag(null); }}>
          All
        </FilterChip>
        <FilterChip active={folderId === "unfiled"} onClick={() => setFolderId("unfiled")}>
          Unfiled
        </FilterChip>
        {folders.map((folder) => (
          <FilterChip key={folder.id} active={folderId === folder.id} onClick={() => setFolderId(folder.id)}>
            {folder.name}
          </FilterChip>
        ))}
        <button type="button" className="h-9 shrink-0 rounded-full border border-dashed border-line px-3 text-sm" onClick={() => { setDraft(""); setDialog({ kind: "folder" }); }}>
          New folder
        </button>
      </div>
      {tags.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {tags.map((item) => (
            <FilterChip key={item} active={tag === item} onClick={() => setTag((current) => (current === item ? null : item))}>
              {item}
            </FilterChip>
          ))}
        </div>
      )}
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      {items === null ? (
        <p className="text-ink-soft">Loading documents…</p>
      ) : visible.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-line bg-paper-2 px-6 py-12 text-center">
          <h2 className="font-display text-3xl">No documents yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Scan a page or import a photo. Files are kept in this browser, with no account and no upload.
          </p>
          <Link href="/scan" className="mt-6 inline-flex h-12 items-center rounded-full bg-teal px-5 font-semibold text-white">
            Scan a document
          </Link>
        </section>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <li key={item.document.id} className="overflow-hidden rounded-3xl border border-line bg-paper-2 shadow-[0_12px_40px_rgba(48,32,12,0.06)]">
              <Link href={`/doc/${item.document.id}`} className="block">
                <div className="aspect-[4/3] bg-paper">
                  {item.thumbUrl ? (
                    <img src={item.thumbUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-ink-soft">No preview</div>
                  )}
                </div>
                <div className="px-4 pt-3">
                  <h2 className="truncate font-semibold">{item.document.title}</h2>
                  <p className="mt-1 text-xs text-ink-soft">
                    {item.document.pageIds.length} {item.document.pageIds.length === 1 ? "page" : "pages"} · {formatWhen(item.document.updatedAt)}
                  </p>
                </div>
              </Link>
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex min-w-0 gap-1 overflow-hidden">
                  {item.document.tags.slice(0, 2).map((itemTag) => (
                    <span key={itemTag} className="truncate rounded-full bg-teal-soft px-2 py-1 text-xs text-teal">
                      {itemTag}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="h-10 rounded-full px-3 text-sm font-semibold text-teal"
                  onClick={() => setDialog({ kind: "menu", id: item.document.id })}
                >
                  Actions
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === "menu" && active && (
        <Dialog title={active.document.title} onClose={() => setDialog(null)}>
          <div className="grid gap-2">
            <Button variant="ghost" onClick={() => { setDraft(active.document.title); setDialog({ kind: "rename", id: active.document.id }); }}>
              Rename
            </Button>
            <Button variant="ghost" onClick={() => { setDraft(""); setDialog({ kind: "tag", id: active.document.id }); }}>
              Add tag
            </Button>
            <Button variant="ghost" onClick={() => setDialog({ kind: "move", id: active.document.id })}>
              Move to folder
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await deleteDocument(active.document.id);
                setDialog(null);
                await reload();
              }}
            >
              Delete document
            </Button>
          </div>
        </Dialog>
      )}
      {dialog?.kind === "rename" && (
        <Dialog title="Rename" onClose={() => setDialog(null)}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} className="h-12 w-full rounded-2xl border border-line px-3" aria-label="Document title" />
          <Button className="mt-3 w-full" onClick={commitRename}>
            Save
          </Button>
        </Dialog>
      )}
      {dialog?.kind === "tag" && active && (
        <Dialog title="Add tag" onClose={() => setDialog(null)}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} className="h-12 w-full rounded-2xl border border-line px-3" placeholder="Client, invoice, visa" aria-label="Tag" />
          <div className="mt-3 flex flex-wrap gap-2">
            {active.document.tags.map((itemTag) => (
              <button
                key={itemTag}
                type="button"
                className="rounded-full bg-paper px-3 py-1 text-sm"
                onClick={async () => {
                  await setDocumentTags(active.document.id, active.document.tags.filter((value) => value !== itemTag));
                  await reload();
                }}
              >
                {itemTag} ×
              </button>
            ))}
          </div>
          <Button
            className="mt-3 w-full"
            onClick={async () => {
              const next = normalizeTag(draft);
              if (!next) return;
              const tags = active.document.tags.some((value) => value.toLowerCase() === next.toLowerCase())
                ? active.document.tags
                : [...active.document.tags, next];
              await setDocumentTags(active.document.id, tags);
              setDialog(null);
              await reload();
            }}
          >
            Add tag
          </Button>
        </Dialog>
      )}
      {dialog?.kind === "move" && active && (
        <Dialog title="Move to folder" onClose={() => setDialog(null)}>
          <div className="grid gap-2">
            <Button variant="ghost" onClick={async () => { await setDocumentFolder(active.document.id, null); setDialog(null); await reload(); }}>
              Unfiled
            </Button>
            {folders.map((folder) => (
              <div key={folder.id} className="flex gap-2">
                <Button className="flex-1" variant="ghost" onClick={async () => { await setDocumentFolder(active.document.id, folder.id); setDialog(null); await reload(); }}>
                  {folder.name}
                </Button>
                <Button
                  variant="danger"
                  aria-label={`Delete folder ${folder.name}`}
                  onClick={async () => {
                    await deleteFolder(folder.id);
                    if (folderId === folder.id) setFolderId("all");
                    await reload();
                  }}
                >
                  <Icon name="trash" />
                </Button>
              </div>
            ))}
          </div>
        </Dialog>
      )}
      {dialog?.kind === "folder" && (
        <Dialog title="New folder" onClose={() => setDialog(null)}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} className="h-12 w-full rounded-2xl border border-line px-3" placeholder="Clients" aria-label="Folder name" />
          <Button
            className="mt-3 w-full"
            onClick={async () => {
              const name = draft.trim();
              if (!name) return;
              await createFolder(name);
              setDialog(null);
              await reload();
            }}
          >
            Create folder
          </Button>
        </Dialog>
      )}
    </main>
  );
}

function FilterChip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("h-9 shrink-0 rounded-full px-3 text-sm font-semibold", active ? "bg-teal text-white" : "bg-paper-2 text-ink border border-line")}
    >
      {children}
    </button>
  );
}
