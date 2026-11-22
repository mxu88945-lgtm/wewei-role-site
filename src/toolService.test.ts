import { afterEach, describe, expect, it, vi } from 'vitest'
import { callTool, DEFAULT_TOOL_SERVICE_URL, fetchToolDefinitions, readToolServiceConfig, saveToolServiceConfig } from './toolService'

afterEach(() => vi.unstubAllGlobals())

describe('toolService', () => {
  it('uses the default URL and stores URL/key locally', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    expect(readToolServiceConfig(storage)).toEqual({ url: DEFAULT_TOOL_SERVICE_URL, key: '' })
    saveToolServiceConfig({ url: 'https://tools.example/', key: 'secret' }, storage)
    expect(readToolServiceConfig(storage)).toEqual({ url: 'https://tools.example', key: 'secret' })
  })

  it('discovers tools and calls with parsed arguments without exposing the key in the body', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).endsWith('/tools')) return new Response(JSON.stringify({ tools: [{ type: 'function', function: { name: 'read_url' } }] }))
      return new Response(JSON.stringify({ ok: true, result: '正文' }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const config = { url: 'https://tools.example', key: 'secret' }
    expect(await fetchToolDefinitions(config)).toHaveLength(1)
    expect(await callTool(config, { id: '1', name: 'read_url', arguments: '{"url":"https://example.com"}' })).toBe('正文')
    const call = fetchMock.mock.calls[1]
    expect(JSON.parse(String(call[1]?.body))).toEqual({ name: 'read_url', arguments: { url: 'https://example.com' } })
    expect(String(call[1]?.body)).not.toContain('secret')
    expect((call[1]?.headers as Record<string, string>).Authorization).toBe('Bearer secret')
  })

  it('accepts the bare array role-tools actually returns and keeps the key out of weijing.* backup keys', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ type: 'function', function: { name: 'read_url' } }, { type: 'function', function: { name: 'web_search' } }]))))
    expect(await fetchToolDefinitions({ url: 'https://tools.example', key: 'secret' })).toHaveLength(2)
    const values = new Map<string, string>()
    saveToolServiceConfig({ url: '', key: 'secret' }, { setItem: (key: string, value: string) => { values.set(key, value) } })
    expect([...values.keys()].some((key) => key.startsWith('weijing.'))).toBe(false)
  })

  it('rejects failed discovery and tool calls for the caller to fall back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 503 })))
    await expect(fetchToolDefinitions({ url: 'https://tools.example', key: 'secret' })).rejects.toThrow('HTTP 503')
    await expect(callTool({ url: 'https://tools.example', key: 'secret' }, { id: '1', name: 'x', arguments: '{}' })).rejects.toThrow('HTTP 503')
  })
})
