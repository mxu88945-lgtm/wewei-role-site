import { beforeEach, describe, expect, it, vi } from 'vitest'

class MapStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, String(value)) }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MapStorage(), configurable: true })
  vi.resetModules()
})

const three = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]

describe('musicStore 歌单管理（v217）', () => {
  it('removeTracks 一次删多首，当前曲目还在就保持', async () => {
    const { useMusicStore } = await import('./musicStore')
    useMusicStore.getState().addTracks(three)
    useMusicStore.getState().setActive('c')
    useMusicStore.getState().removeTracks(['a', 'b'])
    const st = useMusicStore.getState()
    expect(st.tracks.map((t) => t.id)).toEqual(['c'])
    expect(st.activeId).toBe('c')
    expect(JSON.parse(localStorage.getItem('weijing-music-v1') || '{}').tracks).toHaveLength(1)
  })

  it('当前曲目被删时落到剩下的第一首，全删则清空，并清掉被拦下的自动播放', async () => {
    const { useMusicStore } = await import('./musicStore')
    useMusicStore.getState().addTracks(three)
    useMusicStore.getState().setActive('b')
    useMusicStore.getState().setAutoplayBlocked('b')
    useMusicStore.getState().removeTracks(['b'])
    expect(useMusicStore.getState().activeId).toBe('a')
    expect(useMusicStore.getState().autoplayBlockedId).toBe('')
    useMusicStore.getState().removeTracks(['a', 'c'])
    expect(useMusicStore.getState().tracks).toEqual([])
    expect(useMusicStore.getState().activeId).toBe('')
  })

  it('removeTrack 和 renameTrack', async () => {
    const { useMusicStore } = await import('./musicStore')
    useMusicStore.getState().addTracks(three)
    useMusicStore.getState().removeTrack('a')
    useMusicStore.getState().renameTrack('b', '  新名字 ')
    useMusicStore.getState().renameTrack('c', '   ')
    expect(useMusicStore.getState().tracks.map((t) => t.name)).toEqual(['新名字', 'C'])
  })
})
