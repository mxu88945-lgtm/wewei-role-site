export const CONNECTIVITY_TARGETS = [
  { key: 'gate', label: 'gate', url: 'https://gate.zhouweiweihome.top' },
  { key: 'push', label: 'push', url: 'https://push.zhouweiweihome.top' },
  { key: 'tools', label: 'tools', url: 'https://tools.zhouweiweihome.top' },
] as const

export type ConnectivityResult = {
  key: string
  label: string
  url: string
  ok: boolean
  latencyMs: number | null
  error?: string
}

const TIMEOUT_MS = 8000

export async function checkConnectivity(): Promise<ConnectivityResult[]> {
  return Promise.all(CONNECTIVITY_TARGETS.map(async (target) => {
    const started = performance.now()
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetch(target.url, { method: 'GET', cache: 'no-store', mode: 'cors', signal: controller.signal })
      return { ...target, ok: response.ok, latencyMs: Math.round(performance.now() - started), ...(response.ok ? {} : { error: `HTTP ${response.status}` }) }
    } catch (error) {
      return { ...target, ok: false, latencyMs: null, error: error instanceof DOMException && error.name === 'AbortError' ? '请求超时' : '无法连接' }
    } finally { window.clearTimeout(timer) }
  }))
}
