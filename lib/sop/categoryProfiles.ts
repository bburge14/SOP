import type { CategoryProfile } from "@/types/sop";
import { withStore, CATEGORY_PROFILES_STORE } from "@/lib/sop/db";

// Local-only, same guarantee as the library (lib/sop/library.ts): plain
// IndexedDB reads/writes, no fetch/API route anywhere in this file, never
// synced or sent anywhere on their own. A profile only ever reaches the AI
// when generate() explicitly sends its `context` alongside a topic — same
// opt-in-by-use pattern as everything else in this app.

/** Trimmed + lowercased so "User Reset" and "user reset" hit the same profile. */
export function normalizeCategoryKey(category: string): string {
  return category.trim().toLowerCase();
}

export async function getCategoryProfile(category: string): Promise<CategoryProfile | undefined> {
  const key = normalizeCategoryKey(category);
  if (!key) return undefined;
  return withStore<CategoryProfile | undefined>(CATEGORY_PROFILES_STORE, "readonly", (store) => store.get(key));
}

/** Alphabetical by display name — used to populate the category picker's suggestions. */
export async function listCategoryProfiles(): Promise<CategoryProfile[]> {
  const all = await withStore<CategoryProfile[]>(CATEGORY_PROFILES_STORE, "readonly", (store) => store.getAll());
  return all.sort((a, b) => a.category.localeCompare(b.category));
}

export async function saveCategoryProfile(profile: CategoryProfile): Promise<void> {
  await withStore(CATEGORY_PROFILES_STORE, "readwrite", (store) => store.put(profile));
}

export async function deleteCategoryProfile(category: string): Promise<void> {
  await withStore(CATEGORY_PROFILES_STORE, "readwrite", (store) => store.delete(normalizeCategoryKey(category)));
}
