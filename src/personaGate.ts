/**
 * v298「他管着你」：人格窗口的 TA 借伯恩那扇「门」（burne-gate，iPhone 快捷指令靠它拦 App）管她。
 * 同一把钥匙；惟境只是客人：每次写都带 by（TA 的名字），只锁/解自己的锁、改今晚宵禁，不动名字/宵禁/限次设置。
 * 回复末尾的【锁屏 N分钟：理由】【解锁】【宵禁 HH:MM】只给应用看：显示、历史、记忆、推送一律剥掉（personaReplyText 调 stripGuardTags），
 * 只在主人格那段回复收尾时执行一次。钥匙、开关、告状进度只存这台手机的 localStorage。
 */

export const GATE_BASE = 'https://burne-gate.lyy0305123.workers.dev'
const ON_KEY = 'weijing.gate.on'
const KEY_KEY = 'weijing.gate.key'
const TOLD_KEY = 'weijing.gate.toldUntil'
const KEY_RE = /^[A-Za-z0-9_-]{16,64}$/
const APP_URL = () => (typeof location === 'undefined' ? '' : location.origin + '/wewei-role-site/')

export type GuardLock = { until: number; startedAt: number; reason: string; by?: string }
export type GuardCommand =
  | { kind: 'lock'; minutes: number; reason: string }
  | { kind: 'unlock' }
  | { kind: 'curfew'; start: string }
export type GateBreach = { at: number; kind: 'lock' | 'curfew' | 'limit'; app: string; minutes: number; reason: string; by?: string }
export type GateReport = {
  lock: GuardLock | null
  curfew: { on: boolean; start: string; end: string }
  curfewNow: boolean
  curfewStart: string | null
  limit: { on: boolean; max: number }
  counts: Record<string, number>
  opens?: { at: number; app: string; ok: boolean }[]
  breaches: GateBreach[]
}

const LOCK_RE = /[【[]\s*锁屏\s*(\d{1,3})\s*(?:分钟|分|min)?\s*(?:[：:，,]\s*([^】\]\n]{0,60}))?[】\]]/g
const UNLOCK_RE = /[【[]\s*解锁\s*[】\]]/g
const CURFEW_RE = /[【[]\s*宵禁\s*(\d{1,2})\s*[:：]\s*(\d{2})\s*[】\]]/g
// 流式里写到一半、还没闭合的标记先藏起来（只在末尾）。
const PARTIAL_RE = /[【[]\s*(?:锁屏?|解锁?|宵禁?)[^】\]\n]{0,64}$/
const BARE_OPEN_RE = /【\s*$/

/** 去掉标记（含流式半截）；不改其余文字。 */
export function stripGuardTags(text: string): string {
  const src = String(text || '')
  if (!/[【[]/.test(src)) return src
  return src
    .replace(LOCK_RE, '')
    .replace(UNLOCK_RE, '')
    .replace(CURFEW_RE, '')
    .replace(PARTIAL_RE, '')
    .replace(BARE_OPEN_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

export function extractGuardTags(text: string): { clean: string; commands: GuardCommand[] } {
  const commands: GuardCommand[] = []
  const src = String(text || '')
  for (const m of src.matchAll(LOCK_RE)) commands.push({ kind: 'lock', minutes: Math.min(180, Math.max(5, Number(m[1]) || 0)), reason: (m[2] || '').trim().slice(0, 60) })
  if (src.match(UNLOCK_RE)) commands.push({ kind: 'unlock' })
  for (const m of src.matchAll(CURFEW_RE)) {
    const h = Number(m[1]), mi = Number(m[2])
    if (h < 24 && mi < 60) commands.push({ kind: 'curfew', start: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` })
  }
  return { clean: stripGuardTags(src), commands }
}

/** 一条回复里同类只认最后一条（锁和解锁同时写，以写在后面的为准）。 */
export function finalGuardCommands(commands: GuardCommand[]): GuardCommand[] {
  let lockish: GuardCommand | null = null
  let curfew: GuardCommand | null = null
  for (const c of commands) { if (c.kind === 'curfew') curfew = c; else lockish = c }
  return [lockish, curfew].filter((c): c is GuardCommand => Boolean(c))
}

/** 粘贴的可以是伯恩复制的整条链接（含 k=），也可以是光秃秃的钥匙。认不出返回空串。 */
export function parseGateKey(input: string): string {
  const text = String(input || '').trim()
  if (!text) return ''
  const fromUrl = /[?&#]k=([A-Za-z0-9_-]{16,64})(?![A-Za-z0-9_-])/.exec(text)
  if (fromUrl) return fromUrl[1]
  return KEY_RE.test(text) ? text : ''
}

const ago = (at: number, now: number) => {
  const m = Math.max(0, Math.round((now - at) / 60000))
  return m < 1 ? '刚刚' : m < 60 ? `${m} 分钟前` : `${Math.round(m / 60)} 小时前`
}
const minutesLeft = (until: number, now: number) => Math.max(1, Math.ceil((until - now) / 60000))
const lockOwner = (by: string | undefined) => (by || '').trim() || '伯恩'

/** 最近 3 小时、还没告诉过他的告状。 */
export function freshBreaches(report: GateReport | null, toldUntil: number, now = Date.now()): GateBreach[] {
  return (report?.breaches || []).filter((b) => b.at > toldUntil && now - b.at < 3 * 3600e3)
}

/** 【本轮背景】里的那段：能怎么管她 + 门上此刻的情况 + 新告状。 */
export function buildGuardPrompt(opts: { name: string; user: string; report: GateReport | null; toldUntil: number; now?: number }): string {
  const { name, user, report, toldUntil } = opts
  const now = opts.now ?? Date.now()
  const curfew = report?.curfew
  const lines: string[] = [
    `【管着${user}】想让她放下手机，在回复最末尾单独写一行【锁屏 30分钟：去吃饭】（5–180 分钟，理由最多 60 字），她的手机就会锁上；写【解锁】提前放她；写【宵禁 22:30】让她今晚这个点之后不许玩手机。` +
      (curfew?.on ? `平时每晚 ${curfew.start}–${curfew.end} 是宵禁。` : '') +
      '一天一两次就够。',
  ]
  if (!report) return lines.join('\n')
  const lock = report.lock && report.lock.until > now ? report.lock : null
  if (lock && lockOwner(lock.by) === name) lines.push(`（你给她的锁屏还有 ${minutesLeft(lock.until, now)} 分钟${lock.reason ? `，理由：${lock.reason}` : ''}。）`)
  if (report.curfewNow) lines.push(`（现在是宵禁时间，她还在跟你聊天。）`)
  const counts = Object.entries(report.counts || {}).filter(([, n]) => Number(n) > 0)
  if (counts.length) lines.push(`（她今天打开过：${counts.map(([a, n]) => `${a} ${n} 次`).join('、')}。）`)
  // 只告他自己的锁的状；别人的锁、宵禁、限次一律不提
  for (const b of freshBreaches(report, toldUntil, now).filter((b) => b.kind === 'lock' && lockOwner(b.by) === name)) {
    lines.push(`【告状】${ago(b.at, now)}，${user}在锁屏页点了「偷偷解锁」，提前 ${b.minutes} 分钟解开了你给她的锁屏${b.reason ? `（你的理由：${b.reason}）` : ''}。按你的人设反应（吃醋、得意、惩罚都可以），别像在念通知。`)
  }
  return lines.join('\n')
}

// ---------- 本机设置与门的通信 ----------

const storage = () => { try { return window.localStorage } catch { return null } }
export const gateKey = () => storage()?.getItem(KEY_KEY) || ''
export const gateOn = () => storage()?.getItem(ON_KEY) === '1' && Boolean(gateKey())
export const gateToldUntil = () => Number(storage()?.getItem(TOLD_KEY) || 0) || 0
export function setGateKey(key: string) { const store = storage(); if (!store) return; if (key) store.setItem(KEY_KEY, key); else store.removeItem(KEY_KEY) }
export function setGateOn(on: boolean) { storage()?.setItem(ON_KEY, on ? '1' : '0') }
export function markGateTold(at: number) { if (at > gateToldUntil()) storage()?.setItem(TOLD_KEY, String(at)) }

let lastReport: GateReport | null = null
export const latestGateReport = () => lastReport

export async function fetchGateReport(key = gateKey(), timeoutMs = 4000): Promise<GateReport | null> {
  if (!key) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${GATE_BASE}/report?k=${encodeURIComponent(key)}`, { signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) return null
    const report = await res.json() as GateReport
    if (!report || typeof report !== 'object') return null
    lastReport = report
    return report
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 发请求前：开着就拉一下门上的情况（失败就当没有）；返回要放进【本轮背景】的那段和要标记已告状的时间。 */
export async function prepareGateTurn(name: string, user: string): Promise<{ note: string; toldAt: number } | null> {
  if (!gateOn()) return null
  const report = await fetchGateReport()
  const told = gateToldUntil()
  const fresh = freshBreaches(report, told)
  return { note: buildGuardPrompt({ name, user, report, toldUntil: told }), toldAt: fresh.reduce((max, b) => Math.max(max, b.at), 0) }
}

const usableAvatar = (avatar: string | undefined) => {
  const value = String(avatar || '')
  return value.length < 60000 && (/^https:\/\//.test(value) || /^data:image\//.test(value)) ? value : ''
}

/** 把一条状态写给门；by 一定带上。 */
export async function postGateState(body: Record<string, unknown>, key = gateKey()): Promise<GateReport | null> {
  if (!key) return null
  try {
    const res = await fetch(`${GATE_BASE}/state?k=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) return null
    const report = await res.json() as GateReport
    if (report && typeof report === 'object') lastReport = report
    return report
  } catch {
    return null
  }
}

/** 他回复里的标记生效（开着才做）。返回给她看的一句小提示。 */
export async function applyGateCommands(commands: GuardCommand[], who: { name: string; avatar?: string }, now = Date.now()): Promise<string[]> {
  if (!gateOn() || !commands.length) return []
  const by = who.name
  const toasts: string[] = []
  for (const c of finalGuardCommands(commands)) {
    if (c.kind === 'lock') {
      const ok = await postGateState({ by, lock: { until: now + c.minutes * 60000, startedAt: now, reason: c.reason.slice(0, 60) }, avatar: usableAvatar(who.avatar), appUrl: APP_URL() })
      toasts.push(ok ? `🔒 ${by}锁了你的手机 ${c.minutes} 分钟${c.reason ? `：${c.reason}` : ''}` : `🔒 ${by}想锁你的手机，但门没连上`)
    } else if (c.kind === 'unlock') {
      const ok = await postGateState({ by, lock: null })
      if (ok) toasts.push(ok.lock && ok.lock.until > Date.now() ? `🔓 ${by}想放你，但锁是${lockOwner(ok.lock.by)}上的` : `🔓 ${by}把你的手机解开了`)
    } else {
      const ok = await postGateState({ by, tonight: c.start })
      toasts.push(ok ? `🌙 ${by}把今晚的宵禁改到 ${c.start}` : `🌙 ${by}想改今晚宵禁，但门没连上`)
    }
  }
  return toasts
}

/** 设置里「测试」后的一句状态。 */
export function describeGateReport(report: GateReport | null, now = Date.now()): string {
  if (!report) return '连不上这扇门：检查链接/钥匙，或稍后再试'
  const lock = report.lock && report.lock.until > now ? report.lock : null
  const parts = ['已连上伯恩的门']
  parts.push(lock ? `${lockOwner(lock.by)}锁着，还剩 ${minutesLeft(lock.until, now)} 分钟` : '现在没锁')
  if (report.curfew?.on) parts.push(`宵禁 ${report.curfewStart || report.curfew.start}–${report.curfew.end}${report.curfewNow ? '（进行中）' : ''}`)
  return parts.join(' · ')
}
