import { getPersonaState, setPersonaState } from './personaWindowStore'
import { nextPersonaMessageId, updatePersonaThread, type PersonaMessage } from './personaWindow'
import { taskIsActive } from './personaTasks'
import { stripGuardTags } from './personaGate'

/**
 * v297 手机推送（人格窗口）：到点提醒和「TA 主动来找你」都交给 Cloudflare 上的小服务器（和顾祁砚共用一台）。
 * App 被 iPhone 冻住或关掉也能响。设备号、开关只存在这台手机的 localStorage，不进备份和云同步。
 */
export const PUSH_BASE = 'https://push.zhouweiweihome.top'
const ON_KEY = 'weijing.push.on'
const DEVICE_KEY = 'weijing.push.device'
const PROACTIVE_KEY = 'weijing.push.proactive'
const APP_URL = () => (typeof location === 'undefined' ? '' : location.origin + '/wewei-role-site/')

const storage = () => { try { return window.localStorage } catch { return null } }
export const pushOn = () => storage()?.getItem(ON_KEY) === '1'
export function pushProactivePerDay() { const raw = storage()?.getItem(PROACTIVE_KEY); return raw == null ? 3 : Math.max(0, Math.min(6, Number(raw) || 0)) }
export function pushSupported() { return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window }
export function pushStandalone() { return typeof window !== 'undefined' && ((navigator as unknown as { standalone?: boolean }).standalone === true || Boolean(window.matchMedia?.('(display-mode: standalone)').matches)) }

function device() {
  const store = storage()
  let id = store?.getItem(DEVICE_KEY) || ''
  if (!id) {
    const bytes = new Uint8Array(24); crypto.getRandomValues(bytes)
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    store?.setItem(DEVICE_KEY, id)
  }
  return id
}
async function post<T = unknown>(path: string, data: Record<string, unknown>): Promise<T> {
  const res = await fetch(PUSH_BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device: device(), ...data }) })
  if (!res.ok) throw new Error('推送服务 ' + res.status)
  return res.json() as Promise<T>
}
function keyBytes(b64: string) { let s = b64.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const raw = atob(s); return Uint8Array.from(raw, (c) => c.charCodeAt(0)) }

export function pushStatus(): string {
  if (!pushSupported()) return pushStandalone() ? '这台设备不支持网页推送（iOS 需 16.4 以上）' : '先把惟境添加到主屏幕，从主屏幕打开再开启'
  if (Notification.permission === 'denied') return '通知被拒绝了：到 iPhone 设置 → 通知 → 惟境 里打开'
  return pushOn() ? '已开启：App 关着也会响' : '提醒到点、TA 想找你时，App 关着也能收到'
}

export async function enablePush(): Promise<string> {
  if (pushOn()) { await post('/test', { title: personaName() || '惟境', body: '我在。以后到点就这样叫你。', url: APP_URL() }); return '测试推送发出去了' }
  if (!pushSupported()) return pushStatus()
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return '没拿到通知权限'
  const reg = await navigator.serviceWorker.ready
  const { publicKey } = await (await fetch(PUSH_BASE + '/vapid')).json() as { publicKey: string }
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
  await post('/subscribe', { subscription: sub.toJSON() })
  storage()?.setItem(ON_KEY, '1')
  syncPushTasks(true); syncPushContext()
  return '🔔 手机通知开好了'
}

export function setPushProactive(perDay: number) { storage()?.setItem(PROACTIVE_KEY, String(Math.max(0, Math.min(6, Math.round(perDay) || 0)))); syncPushContext() }

const personaName = () => contextBuilder?.()?.name || ''

/** 全部人格、全部窗口里还没到点的任务，整体同步给服务器（完成/取消/删掉的自然就没了）。 */
let lastJobsKey = ''
export function syncPushTasks(force = false) {
  if (!pushOn()) return
  const now = Date.now()
  const jobs = getPersonaState().personas.flatMap((persona) => !persona.enabled ? [] : persona.threads.flatMap((thread) => (thread.tasks || [])
    .filter((task) => taskIsActive(task) && task.firedAt === undefined && task.dueAt > now)
    .map((task) => ({ id: `w:${task.id}`.slice(0, 80), at: task.dueAt, title: `${namesById.get(persona.characterId) || '惟境'} · 提醒`, body: task.text }))))
    .sort((a, b) => a.at - b.at).slice(0, 60)
  const key = JSON.stringify(jobs)
  if (!force && key === lastJobsKey) return
  lastJobsKey = key
  void post('/sync', { jobs, url: APP_URL() }).catch(() => { lastJobsKey = '' })
}

/** 人格窗口页登记：怎么拼当前人格的系统提示与最近聊天。 */
export type PushContext = { name: string; personaId: string; threadId: string; system: string; recent: string }
let contextBuilder: (() => PushContext | null) | null = null
const namesById = new Map<string, string>()
export function registerPushContext(builder: (() => PushContext | null) | null, names?: Array<[string, string]>) {
  contextBuilder = builder
  if (names) for (const [id, name] of names) namesById.set(id, name)
}
export function syncPushContext() {
  if (!pushOn()) return
  let ctx: PushContext | null = null
  try { ctx = contextBuilder?.() || null } catch (error) { console.warn('推送上下文拼装失败', error) }
  const perDay = pushProactivePerDay()
  if (!ctx) { if (!perDay) void post('/context', { perDay: 0 }).catch(() => undefined); return }
  void post('/context', { perDay, system: ctx.system.slice(0, 16000), recent: ctx.recent.slice(-5000), name: ctx.name, conv: `${ctx.personaId}|${ctx.threadId}`, url: APP_URL() }).catch(() => undefined)
}

/** 回到 App：把 TA 在你不在时发的消息放回原来那扇窗口。 */
let pulling = false
export async function pullPushInbox() {
  if (!pushOn() || pulling) return
  pulling = true
  try {
    const { messages } = await post<{ messages?: Array<{ id: string; conv: string; text: string; ts: number }> }>('/inbox', {})
    if (!messages?.length) return
    const done: string[] = []
    setPersonaState((state) => {
      let next = state
      for (const item of messages) {
        const [personaId, threadId] = String(item.conv || '').split('|')
        const persona = next.personas.find((p) => p.id === personaId)
        const thread = persona?.threads.find((t) => t.id === threadId)
        const text = stripGuardTags(String(item.text || '')).trim()
        if (!persona || !thread || !text) continue
        const id = Math.max(nextPersonaMessageId(thread.messages), (thread.messageSequence || 0) + 1)
        const message: PersonaMessage = { id, role: 'assistant', text, createdAt: item.ts || Date.now() }
        next = updatePersonaThread(next, personaId, threadId, (t) => ({ ...t, messages: [...t.messages, message], messageSequence: id, updatedAt: Math.max(t.updatedAt, message.createdAt) }))
        done.push(item.id)
      }
      return next
    })
    if (done.length) await post('/ack', { ids: done })
  } catch (error) { console.warn('推送收件失败', error) }
  finally { pulling = false }
}

let started = false
/** App 启动时调一次：状态变了就同步任务，切到后台时同步上下文，回到前台收消息。 */
export function startPersonaPush(subscribe: (listener: () => void) => () => void) {
  if (started || typeof document === 'undefined') return
  started = true
  let timer: ReturnType<typeof setTimeout> | null = null
  subscribe(() => { if (timer) clearTimeout(timer); timer = setTimeout(() => syncPushTasks(), 1500) })
  document.addEventListener('visibilitychange', () => { if (document.hidden) { syncPushTasks(); syncPushContext() } else void pullPushInbox() })
  window.addEventListener('pagehide', () => syncPushContext())
  setTimeout(() => { syncPushTasks(true); void pullPushInbox() }, 9000)
}
