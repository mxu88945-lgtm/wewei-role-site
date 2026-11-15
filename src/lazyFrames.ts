// v246：美化卡片（带 <style>/<script> 的消息）每张都是一个独立的 iframe 文档。
// 打开长对话时 60 条窗口里可能同时挂上几十个，iOS 会因内存把页面杀掉（「重复出现问题」）。
// 只给靠近屏幕的卡片挂 srcdoc；离开且已加载超过上限时，最久没看到的先卸载（保留高度占位）。

export const LAZY_FRAME_ROOT_MARGIN = '600px 0px'
export const LAZY_FRAME_CAP = 8

export type LazyFrameEntry = { id: number; keepAlive: boolean; near: boolean; loaded: boolean; seenAt: number }

/** Pure bookkeeping, testable without a DOM. Returns ids that should unload. */
export class LazyFrameBook {
  private entries = new Map<number, LazyFrameEntry>()
  private clock = 0
  constructor(private cap = LAZY_FRAME_CAP) {}
  add(id: number, keepAlive: boolean) { this.entries.set(id, { id, keepAlive, near: false, loaded: false, seenAt: 0 }) }
  remove(id: number) { this.entries.delete(id) }
  /** Mark visibility; returns { load, unload } decisions. */
  update(id: number, near: boolean): { load: boolean; unload: number[] } {
    const entry = this.entries.get(id)
    if (!entry) return { load: false, unload: [] }
    entry.near = near
    let load = false
    if (near) { entry.seenAt = ++this.clock; if (!entry.loaded) { entry.loaded = true; load = true } }
    return { load, unload: this.evict() }
  }
  loadedCount() { let n = 0; for (const e of this.entries.values()) if (e.loaded) n++; return n }
  private evict() {
    const out: number[] = []
    let loaded = this.loadedCount()
    if (loaded <= this.cap) return out
    const far = [...this.entries.values()].filter((e) => e.loaded && !e.near && !e.keepAlive).sort((a, b) => a.seenAt - b.seenAt)
    for (const e of far) {
      if (loaded <= this.cap) break
      e.loaded = false; loaded--; out.push(e.id)
    }
    return out
  }
}

type Listener = (loaded: boolean) => void
const book = new LazyFrameBook()
const listeners = new Map<number, Listener>()
const elements = new Map<Element, number>()
let nextId = 1
let observer: IntersectionObserver | null | undefined

function getObserver() {
  if (observer !== undefined) return observer
  if (typeof IntersectionObserver === 'undefined') { observer = null; return observer }
  observer = new IntersectionObserver((records) => {
    for (const record of records) {
      const id = elements.get(record.target)
      if (id === undefined) continue
      const { load, unload } = book.update(id, record.isIntersecting)
      if (load) listeners.get(id)?.(true)
      for (const other of unload) listeners.get(other)?.(false)
    }
  }, { rootMargin: LAZY_FRAME_ROOT_MARGIN })
  return observer
}

/** Observe a card shell; `onChange(true)` mounts the frame, `false` unmounts it. Returns cleanup. */
export function observeLazyFrame(element: Element, keepAlive: boolean, onChange: Listener) {
  const io = getObserver()
  if (!io) { onChange(true); return () => undefined }
  const id = nextId++
  book.add(id, keepAlive)
  listeners.set(id, onChange)
  elements.set(element, id)
  io.observe(element)
  return () => {
    io.unobserve(element)
    elements.delete(element)
    listeners.delete(id)
    book.remove(id)
  }
}

export function hasMediaElement(html: string) {
  return /<(?:audio|video)\b/i.test(html)
}
