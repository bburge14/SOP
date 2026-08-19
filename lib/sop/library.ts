import type { SavedSop } from "@/types/sop";

// Local-only SOP library — IndexedDB, on this device, never synced or sent
// anywhere. Nothing in this file ever calls fetch()/an API route; browsing,
// listing, loading, and deleting a saved SOP are pure local-storage
// operations. That's the actual mechanism behind "the AI doesn't have
// access to saved SOPs unless they're brought back into the session" — the
// library has no code path that reaches the network at all, and loading a
// record just populates the same workspace state Import already does,
// which by itself never calls the AI either.
const DB_NAME = "sop-writer";
const DB_VERSION = 1;
const STORE_NAME = "sops";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("category", "category", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the local SOP library."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = fn(tx.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Local SOP library operation failed."));
    });
  } finally {
    db.close();
  }
}

export async function saveSopToLibrary(sop: SavedSop): Promise<void> {
  await withStore("readwrite", (store) => store.put(sop));
}

/** Newest-first by updatedAt. */
export async function listSavedSops(): Promise<SavedSop[]> {
  const all = await withStore<SavedSop[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteSopFromLibrary(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}
