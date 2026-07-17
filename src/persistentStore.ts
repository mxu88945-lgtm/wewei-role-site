const DB_NAME = 'weijing-core'
const STORE_NAME = 'state'

type StoredValue<T> = { value: T; savedAt: number }
const pendingWrites = new Map<string, Promise<void>>()

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function durableGet<T>(key: string) {
  const database = await openDatabase()
  return new Promise<T | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve((request.result as StoredValue<T> | undefined)?.value)
    request.onerror = () => reject(request.error)
  }).finally(() => database.close())
}

async function durableSetNow(key: string, value: unknown) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const readRequest = store.get(key)
    readRequest.onerror = () => reject(readRequest.error)
    readRequest.onsuccess = () => {
      const previous = (readRequest.result as StoredValue<unknown> | undefined)?.value
      try {
        if (JSON.stringify(previous) === JSON.stringify(value)) {
          resolve()
          return
        }
      } catch {
        // If comparison fails, persist normally rather than risking data loss.
      }
      const writeRequest = store.put({ value, savedAt: Date.now() }, key)
      writeRequest.onsuccess = () => resolve()
      writeRequest.onerror = () => reject(writeRequest.error)
    }
  }).finally(() => database.close())
}

/** Serialize writes per key so an older, slower transaction cannot overwrite newer state. */
export function durableSet(key: string, value: unknown) {
  const previous = pendingWrites.get(key) || Promise.resolve()
  const next = previous.catch(() => undefined).then(() => durableSetNow(key, value))
  pendingWrites.set(key, next)
  return next.finally(() => {
    if (pendingWrites.get(key) === next) pendingWrites.delete(key)
  })
}
