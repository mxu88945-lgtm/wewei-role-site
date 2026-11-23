export type SenseKind = 'blow' | 'shake' | 'rotation' | 'longPress'
export type SenseSettings = { enabled: boolean; blow: boolean; shake: boolean; rotation: boolean; longPress: boolean }
export type SenseEvent = { event: string; strength?: number; direction?: string; duration_ms?: number; timestamp?: number }
export type SensorEventBundle = { events: SenseEvent[]; at: number }

export const DEFAULT_SENSE_SETTINGS: SenseSettings = { enabled: false, blow: false, shake: false, rotation: false, longPress: false }
export const PERSONA_SENSE_EVENT = 'weijing:persona-sense'
export const SENSOR_PROMPT = '这是用户在现实中对手机做的动作，请用角色自己的口吻自然回应一两句，不要提传感器、JSON 或这条提示。'
export const kindForEvent = (event: string): SenseKind | null => ({ user_blowing: 'blow', device_shaken: 'shake', device_rotated: 'rotation', screen_touched: 'longPress' } as Record<string, SenseKind>)[event] || null
export const labelForEvent = (event: SenseEvent) => {
  if (event.event === 'user_blowing') return '（你对着屏幕吹了口气）'
  if (event.event === 'device_shaken') return '（你晃了晃手机）'
  if (event.event === 'device_rotated') return `（你转了转手机${event.direction === 'left' ? '，向左' : event.direction === 'right' ? '，向右' : ''}）`
  if (event.event === 'screen_touched') return '（你长按了一下屏幕）'
  return '（你对手机做了一个动作）'
}
export const mergeSensorEvents = (events: SenseEvent[], now = Date.now()): SensorEventBundle | null => {
  const valid = events.filter((event) => event && event.event && now - (event.timestamp || now) <= 3000)
  return valid.length ? { events: valid.slice(-8), at: now } : null
}
export const sensorEventPrompt = (bundle: SensorEventBundle) => `<sensor_event>${JSON.stringify({ events: bundle.events, at: bundle.at })}</sensor_event>\n${SENSOR_PROMPT}`
export const permissionMessage = (error: unknown) => /denied|permission/i.test(error instanceof Error ? error.message : String(error)) ? '权限没有打开：请在 iPhone 设置里允许动作或麦克风，再点一次开关。' : '这项感知在当前浏览器不可用，请换 HTTPS 的 iPhone 页面试试。'
export const isMainChatScope = (page: string, conversation?: { phone?: unknown } | null) => page === 'chat' && !conversation?.phone

export function acceptSensorBundle(bundle: SensorEventBundle | null, state: { lastReactionAt: number; replyBusy: boolean }, now = Date.now()) {
  if (!bundle || state.replyBusy || (state.lastReactionAt > 0 && now - state.lastReactionAt < 20_000)) return false
  state.lastReactionAt = now
  return true
}

export type SenseRuntimeOptions = { onBundle: (bundle: SensorEventBundle) => void; onPermissionError?: (kind: SenseKind, message: string) => void; getTouchElement?: () => Element | undefined }
export class SenseInteractionRuntime {
  private bridge: any = null
  private enabled = new Set<SenseKind>()
  private pending: SenseEvent[] = []
  private timer: number | undefined
  private paused = false
  constructor(private readonly options: SenseRuntimeOptions) {}
  async set(kind: SenseKind, on: boolean) {
    if (!on) { this.disable(kind); return }
    if (this.enabled.has(kind)) return
    if (!this.bridge) {
      // @ts-expect-error JS source intentionally mirrors the upstream ES module.
      const mod = await import('./sense-bridge.js')
      this.bridge = new mod.SenseBridge({ localOnly: true })
      this.bridge.addEventListener('sense', (event: CustomEvent<SenseEvent>) => this.receive(event.detail))
    }
    try {
      if (kind === 'blow') await this.bridge.enableBlow()
      else if (kind === 'shake') await this.bridge.enableShake()
      else if (kind === 'rotation') await this.bridge.enableRotation()
      else this.bridge.enableTouch(this.options.getTouchElement?.() || document.documentElement)
      this.enabled.add(kind)
    } catch (error) {
      this.options.onPermissionError?.(kind, permissionMessage(error))
      throw error
    }
  }
  disable(kind: SenseKind) { this.enabled.delete(kind); this.bridge?.disable(kind) }
  pause() { this.paused = true; this.bridge?.disableAll() }
  async resume() { if (!this.paused) return; this.paused = false; for (const kind of [...this.enabled]) { this.enabled.delete(kind); await this.set(kind, true).catch(() => { this.enabled.add(kind) }) } }
  dispose() { this.bridge?.disableAll(); this.enabled.clear(); if (this.timer) window.clearTimeout(this.timer) }
  private receive(event: SenseEvent) {
    if (this.paused || !kindForEvent(event.event)) return
    this.pending.push(event)
    if (this.timer) window.clearTimeout(this.timer)
    this.timer = window.setTimeout(() => { const bundle = mergeSensorEvents(this.pending); this.pending = []; this.timer = undefined; if (bundle) this.options.onBundle(bundle) }, 3000)
  }
}
