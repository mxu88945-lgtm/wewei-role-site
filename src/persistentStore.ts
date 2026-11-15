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
    // v246：不再读回旧值再 JSON.stringify 两份比较（整库几 MB 时一次保存要多占三四份内存）；
    // 同一个对象引用已写过就跳过，其它情况直接 put（只克隆一次）。
    try { transaction.objectStore(STORE_NAME).put({ value, savedAt: Date.now() }, key) } catch { transaction.abort() }
  }).then(() => { lastWritten.set(key, value) }).finally(() => database.close())
}

const lastWritten = new Map<string, unknown>()
/** Remember a value just read from IndexedDB so writing the same reference back is skipped. */
export function markDurableClean(key: string, value: unknown) {
  if (value !== undefined) lastWritten.set(key, value)
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

/** For immutable React state only: skip when this exact reference was the last thing read or written. */
export function durableSetIfChanged(key: string, value: unknown) {
  if (value !== undefined && lastWritten.get(key) === value && !pendingWrites.has(key)) return Promise.resolve()
  return durableSet(key, value)
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
