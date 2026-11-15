import Dexie, { type Table } from "dexie";
import { createId } from "@/lib/ids";
import type {
  DocumentRecord,
  FilterId,
  FolderRecord,
  OcrWord,
  PageRecord,
  Quad,
  SignaturePlacement,
  SignatureRecord,
} from "@/lib/types";

class ScannerDB extends Dexie {
  folders!: Table<FolderRecord, string>;
  documents!: Table<DocumentRecord, string>;
  pages!: Table<PageRecord, string>;
  signatures!: Table<SignatureRecord, string>;

  constructor() {
    super("sr-cscanner");
    this.version(1).stores({
      folders: "id, createdAt",
      documents: "id, updatedAt, folderId",
      pages: "id, documentId",
      signatures: "id, createdAt",
    });
  }
}

let database: ScannerDB | null = null;

export function getDb(): ScannerDB {
  if (typeof window === "undefined") {
    throw new Error("Documents are stored in this browser and are not available during server rendering.");
  }
  if (!database) database = new ScannerDB();
  return database;
}

export interface NewPageInput {
  imageBlob: Blob;
  originalBlob: Blob;
  thumbBlob: Blob;
  corners: Quad;
  filter: FilterId;
  width: number;
  height: number;
}

export async function createDocument(title: string, folderId: string | null = null): Promise<string> {
  const id = createId();
  const now = Date.now();
  await getDb().documents.add({
    id,
    title,
    createdAt: now,
    updatedAt: now,
    folderId,
    tags: [],
    pageIds: [],
    ocrText: "",
  });
  return id;
}

export async function addPage(documentId: string, input: NewPageInput): Promise<string> {
  const db = getDb();
  const id = createId();
  await db.transaction("rw", db.documents, db.pages, async () => {
    const document = await db.documents.get(documentId);
    if (!document) throw new Error("That document is no longer on this device.");
    await db.pages.add({
      ...input,
      id,
      documentId,
      ocrText: "",
      ocrWords: [],
      signature: null,
    });
    await db.documents.update(documentId, {
      pageIds: [...document.pageIds, id],
      updatedAt: Date.now(),
    });
  });
  return id;
}

export async function replacePage(pageId: string, input: NewPageInput): Promise<void> {
  const db = getDb();
  const existing = await db.pages.get(pageId);
  if (!existing) throw new Error("That page is no longer on this device.");
  await db.pages.update(pageId, {
    ...input,
    ocrText: "",
    ocrWords: [],
  });
  await db.documents.update(existing.documentId, { updatedAt: Date.now(), ocrText: "" });
  await refreshOcrCache(existing.documentId);
}

export async function updatePage(pageId: string, patch: Partial<PageRecord>): Promise<void> {
  const db = getDb();
  const existing = await db.pages.get(pageId);
  if (!existing) return;
  await db.pages.update(pageId, patch);
  await db.documents.update(existing.documentId, { updatedAt: Date.now() });
}

export async function loadDocument(id: string): Promise<{ document: DocumentRecord; pages: PageRecord[] } | null> {
  const db = getDb();
  const document = await db.documents.get(id);
  if (!document) return null;
  const rows = await db.pages.bulkGet(document.pageIds);
  const pages = rows.filter((page): page is PageRecord => Boolean(page));
  if (pages.length !== document.pageIds.length) {
    await db.documents.update(id, { pageIds: pages.map((page) => page.id) });
    document.pageIds = pages.map((page) => page.id);
  }
  return { document, pages };
}

export interface LibraryItem {
  document: DocumentRecord;
  thumbBlob: Blob | null;
}

export async function listLibrary(): Promise<{ documents: LibraryItem[]; folders: FolderRecord[] }> {
  const db = getDb();
  const [documents, folders] = await Promise.all([
    db.documents.orderBy("updatedAt").reverse().toArray(),
    db.folders.orderBy("createdAt").toArray(),
  ]);
  const thumbs = await db.pages.bulkGet(documents.map((document) => document.pageIds[0]).filter(Boolean));
  const thumbById = new Map(thumbs.filter((page): page is PageRecord => Boolean(page)).map((page) => [page.id, page.thumbBlob]));
  return {
    folders,
    documents: documents.map((document) => ({
      document,
      thumbBlob: thumbById.get(document.pageIds[0]) ?? null,
    })),
  };
}

export async function renameDocument(id: string, title: string): Promise<void> {
  const next = title.trim().slice(0, 120);
  if (!next) return;
  await getDb().documents.update(id, { title: next, updatedAt: Date.now() });
}

export async function setDocumentTags(id: string, tags: string[]): Promise<void> {
  await getDb().documents.update(id, { tags, updatedAt: Date.now() });
}

export async function setDocumentFolder(id: string, folderId: string | null): Promise<void> {
  await getDb().documents.update(id, { folderId, updatedAt: Date.now() });
}

export async function reorderDocumentPages(id: string, pageIds: string[]): Promise<void> {
  await getDb().documents.update(id, { pageIds, updatedAt: Date.now() });
}

export async function deletePage(documentId: string, pageId: string): Promise<boolean> {
  const db = getDb();
  let removedDocument = false;
  await db.transaction("rw", db.documents, db.pages, async () => {
    const document = await db.documents.get(documentId);
    if (!document) return;
    await db.pages.delete(pageId);
    const pageIds = document.pageIds.filter((id) => id !== pageId);
    if (pageIds.length === 0) {
      await db.documents.delete(documentId);
      removedDocument = true;
      return;
    }
    await db.documents.update(documentId, { pageIds, updatedAt: Date.now() });
  });
  if (!removedDocument) await refreshOcrCache(documentId);
  return removedDocument;
}

export async function deleteDocument(id: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.documents, db.pages, async () => {
    const document = await db.documents.get(id);
    if (!document) return;
    await db.pages.bulkDelete(document.pageIds);
    await db.documents.delete(id);
  });
}

export async function createFolder(name: string): Promise<string> {
  const id = createId();
  await getDb().folders.add({ id, name: name.trim().slice(0, 40), createdAt: Date.now() });
  return id;
}

export async function deleteFolder(id: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.folders, db.documents, async () => {
    const documents = await db.documents.where("folderId").equals(id).toArray();
    await Promise.all(documents.map((document) => db.documents.update(document.id, { folderId: null })));
    await db.folders.delete(id);
  });
}

export async function savePageOcr(pageId: string, ocrText: string, ocrWords: OcrWord[]): Promise<void> {
  const page = await getDb().pages.get(pageId);
  if (!page) return;
  await getDb().pages.update(pageId, { ocrText, ocrWords });
  await refreshOcrCache(page.documentId);
}

export async function refreshOcrCache(documentId: string): Promise<void> {
  const db = getDb();
  const document = await db.documents.get(documentId);
  if (!document) return;
  const pages = await db.pages.bulkGet(document.pageIds);
  const ocrText = pages
    .map((page) => page?.ocrText?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
  await db.documents.update(documentId, { ocrText, updatedAt: Date.now() });
}

export async function listSignatures(): Promise<SignatureRecord[]> {
  return getDb().signatures.orderBy("createdAt").reverse().toArray();
}

export async function saveSignature(blob: Blob): Promise<string> {
  const id = createId();
  await getDb().signatures.add({ id, createdAt: Date.now(), blob });
  return id;
}

export async function deleteSignature(id: string): Promise<void> {
  await getDb().signatures.delete(id);
}

export function emptySignature(blob: Blob): SignaturePlacement {
  return { blob, x: 0.52, y: 0.78, w: 0.4, h: 0.14 };
}
