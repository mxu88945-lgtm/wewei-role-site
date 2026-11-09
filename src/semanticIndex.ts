/**
 * 语义索引的增量构建（纯逻辑 + 可注入依赖）：
 * 只嵌入向量库里还没有的片段（按内容哈希去重），每批最多 32 条，批间隔 1.5 秒；
 * 任何一批失败就停下，交给调用方退避。全部建完后顺手清掉已不存在的旧片段。
 */
import type { Segment } from './semanticSegments'
import { normalize, type VectorRecord, type VectorStore } from './semanticVectorDb'

export const INDEX_BATCH_SIZE = 32
export const INDEX_BATCH_GAP_MS = 1500
/** 限速 / 429 / 超时 / 5xx / 断网：歇 1 分钟后自动续建 */
export const TRANSIENT_BACKOFF_MS = 60 * 1000
/** 其他错误（Key 错、模型名错等）：歇 30 分钟 */
export const INDEX_BACKOFF_MS = 30 * 60 * 1000

/** 能自己好起来的错误：限速、超时、服务端 5xx、网络断了。 */
export function isTransientError(message: string, online = typeof navigator === 'undefined' ? true : navigator.onLine !== false): boolean {
  if (!online) return true
  return /429|rate.?limit|TPM|RPM|TPD|RPD|too many requests|timed? ?out|timeout|超时|HTTP 5\d\d|failed to fetch|fetch failed|network|load failed|offline|离线|网络/i.test(message)
}

export function backoffFor(message: string, online?: boolean): number {
  return isTransientError(message, online) ? TRANSIENT_BACKOFF_MS : INDEX_BACKOFF_MS
}

export interface IndexDeps {
  store: VectorStore
  embed: (texts: string[]) => Promise<number[][]>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  /** 每批之前检查一次：开关被关掉 / 渠道或模型换了就停 */
  shouldContinue?: () => boolean
  onProgress?: (indexed: number, total: number) => void
  onPut?: (records: VectorRecord[]) => void
  onRemove?: (keys: string[]) => void
}

export interface IndexResult {
  indexed: number
  total: number
  embedded: number
  pruned: number
  error?: string
  stopped?: boolean
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function runIndexPass(
  segments: Segment[],
  model: string,
  deps: IndexDeps,
  opts: { batchSize?: number; gapMs?: number } = {},
): Promise<IndexResult> {
  const batchSize = Math.max(1, Math.min(INDEX_BATCH_SIZE, opts.batchSize ?? INDEX_BATCH_SIZE))
  const gap = opts.gapMs ?? INDEX_BATCH_GAP_MS
  const sleep = deps.sleep ?? defaultSleep
  const now = deps.now ?? Date.now
  const total = segments.length
  const existing = await deps.store.keys(model)
  const missing = segments.filter((segment) => !existing.has(segment.key))
  let indexed = total - missing.length
  let embedded = 0
  deps.onProgress?.(indexed, total)

  let dim = 0
  for (let i = 0; i < missing.length; i += batchSize) {
    if (deps.shouldContinue && !deps.shouldContinue()) return { indexed, total, embedded, pruned: 0, stopped: true }
    const batch = missing.slice(i, i + batchSize)
    try {
      const vectors = await deps.embed(batch.map((segment) => segment.text))
      if (vectors.length !== batch.length) throw new Error('向量条数和片段条数对不上')
      const records: VectorRecord[] = batch.map((segment, j) => {
        const vector = vectors[j]
        if (!dim) dim = vector.length
        if (vector.length !== dim) throw new Error('同一批向量维度不一致')
        return { key: segment.key, model, conversationId: segment.conversationId, dim: vector.length, vec: normalize(vector), text: segment.text, msgIds: segment.msgIds, createdAt: now() }
      })
      await deps.store.put(records)
      deps.onPut?.(records)
      embedded += records.length
      indexed += records.length
      deps.onProgress?.(indexed, total)
    } catch (error) {
      return { indexed, total, embedded, pruned: 0, error: (error as Error).message || '嵌入失败' }
    }
    if (i + batchSize < missing.length) await sleep(gap)
  }

  // 全部建完：清理已不存在的片段（删掉/改写的消息、删掉的对话）
  const current = new Set(segments.map((segment) => segment.key))
  const stale = [...existing].filter((key) => !current.has(key))
  // 一个片段都没有时不清理：多半是数据还没读出来，别把已建好的向量当成过期删掉。
  if (stale.length && segments.length) {
    try {
      await deps.store.remove(stale)
      deps.onRemove?.(stale)
    } catch {
      /* 清理失败不影响召回：召回时会按当前消息原文校验 */
    }
  }
  return { indexed, total, embedded, pruned: stale.length }
}
