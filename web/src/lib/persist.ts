import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { createStore, del, get, set } from 'idb-keyval'

const store = createStore('kumlod', 'query-cache')
const CACHE_KEY = 'kumlod-query-cache'

/** Keeps the last fetched data in IndexedDB so the app opens offline. */
export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key, store).then((v) => v ?? null),
    setItem: (key, value) => set(key, value, store),
    removeItem: (key) => del(key, store),
  },
  key: CACHE_KEY,
  // Short, so data survives the app being closed right after it loaded.
  throttleTime: 300,
})

/** Cached data is kept for 7 days. */
export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000

/** Removes the persisted cache (on logout or when the session ends). */
export async function clearPersistedCache(): Promise<void> {
  await del(CACHE_KEY, store)
}
