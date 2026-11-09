/**
 * 语义召回的向量库：独立 IndexedDB（weijing_semantic_recall），不和其他数据混在一起。
 * 每条记录带对话 id；查询只按「模型 + 当前对话 id」取，永远不跨对话。
 * 向量存归一化后的 Float32Array，余弦相似度 = 点积。
 */
export const SEMANTIC_DB_NAME = 'weijing_semantic_recall'
const DB_VERSION = 1
const STORE = 'vectors'

export type VectorRecord = {
  /** 内容哈希（含模型名与对话 id） */
  key: string
  model: string
  conversationId: string
  dim: number
  vec: Float32Array
  /** 片段原文（召回时用来核对消息有没有被改过） */
  text: string
  msgIds: number[]
  createdAt: number
}

export interface VectorStore {
  keys(model: string): Promise<Set<string>>
  forConversation(model: string, conversationId: string): Promise<VectorRecord[]>
  put(records: VectorRecord[]): Promise<void>
  remove(keys: string[]): Promise<void>
  clear(model: string): Promise<void>
}

let openPromise: Promise<IDBDatabase> | undefined

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
  })
}

function openDb(): Promise<IDBDatabase> {
  if (openPromise) return openPromise
  openPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(SEMANTIC_DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex('model', 'model')
        store.createIndex('modelConversation', ['model', 'conversationId'])
      }
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => { db.close(); openPromise = undefined }
      resolve(db)
    }
    req.onerror = () => {
      openPromise = undefined
      reject(req.error ?? new Error('打不开语义向量库'))
    }
  })
  return openPromise
}

export const idbVectorStore: VectorStore = {
  async keys(model) {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readonly')
    const keys = (await request(tx.objectStore(STORE).index('model').getAllKeys(IDBKeyRange.only(model)))) as string[]
    return new Set(keys)
  },
  async forConversation(model, conversationId) {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readonly')
    return (await request(tx.objectStore(STORE).index('modelConversation').getAll(IDBKeyRange.only([model, conversationId])))) as VectorRecord[]
  },
  async put(records) {
    if (!records.length) return
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    records.forEach((record) => store.put(record))
    await done(tx)
  },
  async remove(keys) {
    if (!keys.length) return
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    keys.forEach((key) => store.delete(key))
    await done(tx)
  },
  async clear(model) {
    const keys = await idbVectorStore.keys(model)
    await idbVectorStore.remove([...keys])
  },
}

/** L2 归一化；全零向量原样返回。 */
export function normalize(v: ArrayLike<number>): Float32Array {
  let sum = 0
  for (let i = 0; i < v.length; i += 1) sum += v[i] * v[i]
  const n = Math.sqrt(sum) || 1
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i += 1) out[i] = v[i] / n
  return out
}

/** 两个已归一化向量的余弦相似度；维度不同返回 0。 */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || !a.length) return 0
  let s = 0
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i]
  return s
}
