/**
 * Offline Storage — IndexedDB wrapper
 *
 * Stores:
 *   - drafts     : Content drafts created/edited offline
 *   - syncQueue  : Queued API actions to replay when back online
 *
 * This module is browser-only. Guard all calls with `typeof window !== "undefined"`.
 */

const DB_NAME = "minitik-offline";
const DB_VERSION = 1;

const STORE_DRAFTS = "drafts";
const STORE_SYNC_QUEUE = "syncQueue";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OfflineDraft {
  id: string; // cuid or temp uuid
  title: string;
  description?: string;
  mimeType?: string;
  fileSize?: number;
  /** Base64-encoded thumbnail blob (small preview, optional) */
  thumbnailDataUrl?: string;
  scheduledAt?: string; // ISO string
  createdOffline: boolean;
  lastModifiedAt: number; // Unix ms
  /** True if this draft has been synced to the server */
  synced: boolean;
  /** Server-assigned content ID once synced */
  serverId?: string;
}

export interface QueuedAction {
  id: string; // unique queue entry id
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  queuedAt: number; // Unix ms
  attempts: number;
  lastError?: string;
}

// ─── DB initialisation ────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        const draftsStore = db.createObjectStore(STORE_DRAFTS, { keyPath: "id" });
        draftsStore.createIndex("by_synced", "synced");
        draftsStore.createIndex("by_modified", "lastModifiedAt");
      }

      if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
        const queueStore = db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: "id" });
        queueStore.createIndex("by_queued", "queuedAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function tx(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode
): IDBObjectStore {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Draft CRUD ───────────────────────────────────────────────────────────────

export async function saveDraft(draft: OfflineDraft): Promise<void> {
  const db = await openDb();
  await promisify(tx(db, STORE_DRAFTS, "readwrite").put(draft));
}

export async function getDraft(id: string): Promise<OfflineDraft | undefined> {
  const db = await openDb();
  return promisify<OfflineDraft>(tx(db, STORE_DRAFTS, "readonly").get(id));
}

export async function listDrafts(): Promise<OfflineDraft[]> {
  const db = await openDb();
  return promisify<OfflineDraft[]>(
    tx(db, STORE_DRAFTS, "readonly").getAll()
  );
}

export async function listUnsyncedDrafts(): Promise<OfflineDraft[]> {
  const db = await openDb();
  const store = tx(db, STORE_DRAFTS, "readonly");
  const index = store.index("by_synced");
  return promisify<OfflineDraft[]>(index.getAll(IDBKeyRange.only(false)));
}

export async function markDraftSynced(id: string, serverId: string): Promise<void> {
  const db = await openDb();
  const draft = await promisify<OfflineDraft>(
    tx(db, STORE_DRAFTS, "readonly").get(id)
  );
  if (!draft) return;
  await promisify(
    tx(db, STORE_DRAFTS, "readwrite").put({
      ...draft,
      synced: true,
      serverId,
    })
  );
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await openDb();
  await promisify(tx(db, STORE_DRAFTS, "readwrite").delete(id));
}

export async function clearSyncedDrafts(): Promise<void> {
  const synced = await listDrafts().then((ds) => ds.filter((d) => d.synced));
  const db = await openDb();
  await Promise.all(
    synced.map((d) =>
      promisify(tx(db, STORE_DRAFTS, "readwrite").delete(d.id))
    )
  );
}

// ─── Sync queue ───────────────────────────────────────────────────────────────

export async function enqueueAction(
  action: Omit<QueuedAction, "id" | "queuedAt" | "attempts">
): Promise<QueuedAction> {
  const db = await openDb();
  const entry: QueuedAction = {
    ...action,
    id: crypto.randomUUID(),
    queuedAt: Date.now(),
    attempts: 0,
  };
  await promisify(tx(db, STORE_SYNC_QUEUE, "readwrite").put(entry));
  return entry;
}

export async function listQueuedActions(): Promise<QueuedAction[]> {
  const db = await openDb();
  const store = tx(db, STORE_SYNC_QUEUE, "readonly");
  const index = store.index("by_queued");
  return promisify<QueuedAction[]>(index.getAll());
}

export async function dequeueAction(id: string): Promise<void> {
  const db = await openDb();
  await promisify(tx(db, STORE_SYNC_QUEUE, "readwrite").delete(id));
}

export async function updateQueuedActionAttempt(
  id: string,
  error?: string
): Promise<void> {
  const db = await openDb();
  const action = await promisify<QueuedAction>(
    tx(db, STORE_SYNC_QUEUE, "readonly").get(id)
  );
  if (!action) return;
  await promisify(
    tx(db, STORE_SYNC_QUEUE, "readwrite").put({
      ...action,
      attempts: action.attempts + 1,
      lastError: error,
    })
  );
}

export async function clearSyncQueue(): Promise<void> {
  const db = await openDb();
  await promisify(tx(db, STORE_SYNC_QUEUE, "readwrite").clear());
}

// ─── Storage stats ────────────────────────────────────────────────────────────

export async function getStorageStats(): Promise<{
  drafts: number;
  unsyncedDrafts: number;
  queuedActions: number;
}> {
  const [drafts, unsynced, queue] = await Promise.all([
    listDrafts(),
    listUnsyncedDrafts(),
    listQueuedActions(),
  ]);
  return {
    drafts: drafts.length,
    unsyncedDrafts: unsynced.length,
    queuedActions: queue.length,
  };
}
