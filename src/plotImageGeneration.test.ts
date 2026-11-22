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

  it('defaults to manual generation and persists the selected mode', () => {
    expect(readPlotImageGenerationConfig()).toEqual(DEFAULT_PLOT_IMAGE_GENERATION)
    savePlotImageGenerationConfig({ ...DEFAULT_PLOT_IMAGE_GENERATION, mode: 'automatic', channelId: 'img', model: 'dall-e-3' })
    expect(readPlotImageGenerationConfig()).toMatchObject({ mode: 'automatic', channelId: 'img', model: 'dall-e-3' })
  })

  it('keeps a daily count and resets it when the day changes', () => {
    const first = Date.parse('2026-11-22T08:00:00Z')
    const next = Date.parse('2026-11-23T08:00:00Z')
    expect(recordGeneratedPlotImages(2, first)).toBe(2)
    expect(recordGeneratedPlotImages(1, first)).toBe(3)
    expect(readTodayGeneratedPlotImageCount(first)).toBe(3)
    expect(readTodayGeneratedPlotImageCount(next)).toBe(0)
  })

  it('calls the OpenAI-compatible image endpoint and accepts base64 data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: 'abc' }] }), { status: 200 })))
    const image = await generatePlotImage({ id: 'channel', name: '图片', platform: 'custom-openai', protocol: 'openai', baseUrl: 'https://example.test/v1', apiKey: 'secret', modelName: 'dall-e-3', maxTokenField: 'auto' }, '画一间雨夜书房', '1024x1024', '雨夜')
    expect(fetch).toHaveBeenCalledWith('https://example.test/v1/images/generations', expect.objectContaining({ method: 'POST' }))
    expect(image).toMatchObject({ name: '雨夜', dataUrl: 'data:image/png;base64,abc' })
    expect(readTodayGeneratedPlotImageCount()).toBe(1)
  })
})
