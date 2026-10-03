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
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error || new Error('数据保存失败'))
    transaction.onerror = () => reject(transaction.error)
    const store = transaction.objectStore(STORE_NAME)
    const readRequest = store.get(key)
    readRequest.onsuccess = () => {
      const previous = (readRequest.result as StoredValue<unknown> | undefined)?.value
      try { if (JSON.stringify(previous) === JSON.stringify(value)) return } catch { /* Save normally. */ }
      try { store.put({ value, savedAt: Date.now() }, key) } catch { transaction.abort() }
    }
  }).finally(() => database.close())
}

export async function durableSnapshot(): Promise<Record<string, unknown>> {
  await Promise.all([...pendingWrites.values()])
  const database = await openDatabase()
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME)
    const data: Record<string, unknown> = {}
    const request = transaction.objectStore(STORE_NAME).openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      const key = String(cursor.key)
      if (key.startsWith('weijing.')) data[key] = (cursor.value as StoredValue<unknown>).value
      cursor.continue()
    }
    transaction.oncomplete = () => resolve(data)
    transaction.onabort = () => reject(transaction.error || new Error('无法读取完整备份'))
    transaction.onerror = () => reject(transaction.error)
  }).finally(() => database.close())
}

/** Replace the database in one transaction; an aborted restore leaves old data intact. */
export async function replaceDurableSnapshot(data: Record<string, unknown>) {
  await Promise.all([...pendingWrites.values()])
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error || new Error('恢复失败，原数据已保留'))
    transaction.onerror = () => reject(transaction.error)
    const store = transaction.objectStore(STORE_NAME)
    try {
      store.clear()
      for (const [key, value] of Object.entries(data)) store.put({ value, savedAt: Date.now() }, key)
    } catch { transaction.abort() }
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
