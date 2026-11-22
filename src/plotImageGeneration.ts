import type { PlotImage } from './chatImages'

export type PlotImageGenerationMode = 'manual' | 'automatic'
export type PlotImageGenerationConfig = {
  mode: PlotImageGenerationMode
  baseUrl: string
  model: string
  apiKey: string
  size: '1024x1024' | '1792x1024' | '1024x1792'
}

type DailyCount = { day: string; count: number }
export const PLOT_IMAGE_GENERATION_CONFIG_KEY = 'weijing.plotImageGeneration'
export const PLOT_IMAGE_GENERATION_COUNT_KEY = 'weijing.plotImageGenerationCount'
export const DEFAULT_PLOT_IMAGE_GENERATION: PlotImageGenerationConfig = { mode: 'manual', baseUrl: '', model: '', apiKey: '', size: '1024x1024' }

const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10)
const storage = () => {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function readPlotImageGenerationConfig(): PlotImageGenerationConfig {
  const raw = storage()?.getItem(PLOT_IMAGE_GENERATION_CONFIG_KEY)
  try {
    const value = raw ? JSON.parse(raw) as Partial<PlotImageGenerationConfig> : {}
    return {
      mode: value.mode === 'automatic' ? 'automatic' : 'manual',
      baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : '',
      model: typeof value.model === 'string' ? value.model : '',
      apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
      size: value.size === '1792x1024' || value.size === '1024x1792' ? value.size : '1024x1024',
    }
  } catch { return { ...DEFAULT_PLOT_IMAGE_GENERATION } }
}

export function savePlotImageGenerationConfig(config: PlotImageGenerationConfig) {
  try { storage()?.setItem(PLOT_IMAGE_GENERATION_CONFIG_KEY, JSON.stringify(config)) } catch { /* 私密模式不影响当前页面 */ }
}

export function readTodayGeneratedPlotImageCount(now = Date.now()): number {
  try {
    const value = JSON.parse(storage()?.getItem(PLOT_IMAGE_GENERATION_COUNT_KEY) || 'null') as DailyCount | null
    return value?.day === today(now) && Number.isFinite(value.count) ? Math.max(0, value.count) : 0
  } catch { return 0 }
}

export function recordGeneratedPlotImages(amount = 1, now = Date.now()): number {
  const count = readTodayGeneratedPlotImageCount(now) + Math.max(0, Math.floor(amount))
  try { storage()?.setItem(PLOT_IMAGE_GENERATION_COUNT_KEY, JSON.stringify({ day: today(now), count })) } catch { /* 计数失败不影响图片 */ }
  return count
}

function endpoint(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/+$/, '')
  if (/\/v1$/i.test(base)) return `${base}/images/generations`
  return `${base}/v1/images/generations`
}

function dataUrlFromBase64(value: string) {
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`
}

async function imageUrlToDataUrl(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`图片下载失败（${response.status}）`)
  const blob = await response.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}

export async function generatePlotImage(config: PlotImageGenerationConfig, prompt: string, name: string, signal?: AbortSignal): Promise<PlotImage> {
  if (!config.baseUrl.trim() || !config.apiKey.trim() || !config.model.trim()) throw new Error('请先在“图片接口设置”里填写 Base URL、模型和密钥。')
  if (!prompt.trim()) throw new Error('请先写幕后安排，再生成配图。')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(endpoint(config.baseUrl), {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model.trim(), prompt: prompt.trim().slice(0, 4000), n: 1, size: config.size }),
    })
    const payload = await response.json().catch(() => null) as { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } } | null
    if (!response.ok) throw new Error(payload?.error?.message || `图片接口请求失败（${response.status}）`)
    const first = payload?.data?.[0]
    if (!first?.b64_json && !first?.url) throw new Error('图片接口没有返回图片。')
    const dataUrl = first.b64_json ? dataUrlFromBase64(first.b64_json) : await imageUrlToDataUrl(first.url!, controller.signal)
    recordGeneratedPlotImages(1)
    return { id: crypto.randomUUID(), name: name.trim() || '本轮配图', dataUrl, width: 1024, height: 1024 }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('图片生成超时，请检查接口地址或网络后重试。')
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

export function buildPlotImagePrompt(direction: string) {
  return `根据以下幕后剧情安排，生成一张适合嵌入角色扮演正文的叙事配图。只画画面，不要文字、字幕、水印或边框。保持人物和场景符合安排，但不要替用户决定未写明的动作或结果。幕后安排：\n${direction.trim().slice(0, 3500)}`
}
