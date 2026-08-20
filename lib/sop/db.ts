// Shared local-only IndexedDB plumbing for the SOP library and category
// profiles (lib/sop/library.ts, lib/sop/categoryProfiles.ts) — on this
// device, never synced or sent anywhere. Centralized so both stores are
// declared in one onupgradeneeded handler against one database, rather than
// each module opening "sop-writer" with its own version number and upgrade
// logic, which is a real footgun with IndexedDB (two modules racing to
// upgrade the same database independently).
const DB_NAME = "sop-writer";
const DB_VERSION = 2;

export const SOPS_STORE = "sops";
export const CATEGORY_PROFILES_STORE = "categoryProfiles";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SOPS_STORE)) {
        const store = db.createObjectStore(SOPS_STORE, { keyPath: "id" });
        store.createIndex("category", "category", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(CATEGORY_PROFILES_STORE)) {
        db.createObjectStore(CATEGORY_PROFILES_STORE, { keyPath: "categoryKey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the local database."));
  });
}

export async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = fn(tx.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Local database operation failed."));
    });
  } finally {
    db.close();
  }
}
