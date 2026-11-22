import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PLOT_IMAGE_GENERATION, generatePlotImage, readPlotImageGenerationConfig, readTodayGeneratedPlotImageCount, recordGeneratedPlotImages, savePlotImageGenerationConfig } from './plotImageGeneration'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

describe('幕后配图生图', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })
    vi.restoreAllMocks()
  })

  it('defaults to manual generation and stores independent settings locally', () => {
    expect(readPlotImageGenerationConfig()).toEqual(DEFAULT_PLOT_IMAGE_GENERATION)
    savePlotImageGenerationConfig({ ...DEFAULT_PLOT_IMAGE_GENERATION, baseUrl: 'https://images.example/v1', model: 'gpt-image-1', apiKey: 'secret' })
    expect(readPlotImageGenerationConfig()).toMatchObject({ baseUrl: 'https://images.example/v1', model: 'gpt-image-1', apiKey: 'secret' })
    savePlotImageGenerationConfig({ ...readPlotImageGenerationConfig(), mode: 'automatic' })
    expect(readPlotImageGenerationConfig().mode).toBe('automatic')
  })

  it('keeps a daily count and resets it when the day changes', () => {
    const first = Date.parse('2026-11-22T08:00:00Z')
    const next = Date.parse('2026-11-23T08:00:00Z')
    expect(recordGeneratedPlotImages(2, first)).toBe(2)
    expect(recordGeneratedPlotImages(1, first)).toBe(3)
    expect(readTodayGeneratedPlotImageCount(first)).toBe(3)
    expect(readTodayGeneratedPlotImageCount(next)).toBe(0)
  })

  it('calls the independent OpenAI-compatible image endpoint and accepts base64 data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: 'abc' }] }), { status: 200 })))
    const config = { ...DEFAULT_PLOT_IMAGE_GENERATION, baseUrl: 'https://example.test/v1', apiKey: 'secret', model: 'gpt-image-1' }
    const image = await generatePlotImage(config, '画一间雨夜书房', '雨夜')
    expect(fetch).toHaveBeenCalledWith('https://example.test/v1/images/generations', expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' } }))
    expect(image).toMatchObject({ name: '雨夜', dataUrl: 'data:image/png;base64,abc' })
    expect(readTodayGeneratedPlotImageCount()).toBe(1)
  })

  it('adds /v1 when the configured Base URL does not include it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: 'abc' }] }), { status: 200 })))
    await generatePlotImage({ ...DEFAULT_PLOT_IMAGE_GENERATION, baseUrl: 'https://example.test', apiKey: 'secret', model: 'gpt-image-1' }, '画一盏灯', '灯')
    expect(fetch).toHaveBeenCalledWith('https://example.test/v1/images/generations', expect.anything())
  })

  it('returns a friendly configuration error before making a request', async () => {
    await expect(generatePlotImage(DEFAULT_PLOT_IMAGE_GENERATION, '画一盏灯', '灯')).rejects.toThrow('Base URL、模型和密钥')
  })
})
