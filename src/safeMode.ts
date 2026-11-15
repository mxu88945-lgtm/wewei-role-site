/**
 * v245 安全模式 + 启动崩溃检测。
 * - 安全模式：不加载立绘、开场模板、歌词（这些是可选功能，内存大户）。
 * - iOS 内存不够时会直接杀掉网页进程，JS 来不及报错 → 用「启动未正常结束」计数：
 *   每次启动 +1，正常运行 20 秒或切到后台就清零；连续 2 次没清零 → 下次自动进安全模式。
 * key 不用 weijing.* 前缀，免得被备份带走。
 */
export const SAFE_MODE_KEY = 'wj-safe-mode'
export const BOOT_PENDING_KEY = 'wj-boot-pending'
export const BOOT_OK_MS = 20_000
export const CRASH_BOOTS_FOR_SAFE = 2

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const storage = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }

let cached: boolean | null = null

export function isSafeMode(): boolean {
  if (cached !== null) return cached
  const store = storage()
  let on = false
  try { on = store?.getItem(SAFE_MODE_KEY) === '1' } catch { /* ignore */ }
  try { if (typeof location !== 'undefined' && /[?&]safe=1\b/.test(location.search)) on = true } catch { /* ignore */ }
  cached = on
  return on
}

export function setSafeMode(on: boolean, store: Store | null = storage()) {
  try { if (on) store?.setItem(SAFE_MODE_KEY, '1'); else store?.removeItem(SAFE_MODE_KEY) } catch { /* ignore */ }
  cached = null
}

/** 启动时调用：返回这次是否因为连续异常退出而自动进了安全模式。 */
export function noteBootStart(store: Store | null = storage()): boolean {
  if (!store) return false
  let pending = 0
  try { pending = Number(store.getItem(BOOT_PENDING_KEY)) || 0 } catch { /* ignore */ }
  let auto = false
  if (pending >= CRASH_BOOTS_FOR_SAFE && store.getItem(SAFE_MODE_KEY) !== '1') { setSafeMode(true, store); auto = true }
  try { store.setItem(BOOT_PENDING_KEY, String(pending + 1)) } catch { /* ignore */ }
  return auto
}

export function noteBootOk(store: Store | null = storage()) {
  try { store?.removeItem(BOOT_PENDING_KEY) } catch { /* ignore */ }
}

export function reloadApp(safe?: boolean) {
  if (safe !== undefined) setSafeMode(safe)
  try { location.replace(location.pathname) } catch { location.reload() }
}
