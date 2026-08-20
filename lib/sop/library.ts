import type { SavedSop } from "@/types/sop";
import { withStore, SOPS_STORE } from "@/lib/sop/db";

// Local-only SOP library — IndexedDB, on this device, never synced or sent
// anywhere. Nothing in this file ever calls fetch()/an API route; browsing,
// listing, loading, and deleting a saved SOP are pure local-storage
// operations. That's the actual mechanism behind "the AI doesn't have
// access to saved SOPs unless they're brought back into the session" — the
// library has no code path that reaches the network at all, and loading a
// record just populates the same workspace state Import already does,
// which by itself never calls the AI either.

export async function saveSopToLibrary(sop: SavedSop): Promise<void> {
  await withStore(SOPS_STORE, "readwrite", (store) => store.put(sop));
}

/** Newest-first by updatedAt. */
export async function listSavedSops(): Promise<SavedSop[]> {
  const all = await withStore<SavedSop[]>(SOPS_STORE, "readonly", (store) => store.getAll());
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteSopFromLibrary(id: string): Promise<void> {
  await withStore(SOPS_STORE, "readwrite", (store) => store.delete(id));
}
