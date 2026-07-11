const DB_NAME = 'weijing-core'
const STORE_NAME = 'state'

type StoredValue<T> = { value: T; savedAt: number }

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

export async function durableSet(key: string, value: unknown) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ value, savedAt: Date.now() }, key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  }).finally(() => database.close())
}
