import { describe, expect, it } from 'vitest'
import { channelGroupKey, groupChannelsByHost, sortChannelsByHost } from './channelGroups'

describe('channel grouping by host', () => {
  const channels = [
    { id: 'a', name: 'A', baseUrl: 'https://Relay.example.com/v1' },
    { id: 'b', name: 'B', baseUrl: 'https://api.openai.com/v1' },
    { id: 'c', name: 'C', baseUrl: 'https://relay.example.com/claude' },
    { id: 'd', name: 'D', baseUrl: '' },
    { id: 'e', name: 'E', baseUrl: 'relay.example.com/v2' },
    { id: 'f', name: 'D', baseUrl: 'not a url ::' },
  ]

  it('uses lowercase hostname, falling back to the name', () => {
    expect(channelGroupKey(channels[0])).toBe('relay.example.com')
    expect(channelGroupKey(channels[3])).toBe('name:d')
  })

  it('keeps first-appearance group order and in-group order', () => {
    const groups = groupChannelsByHost(channels)
    expect(groups.map((g) => g.channels.map((c) => c.id))).toEqual([['a', 'c', 'e'], ['b'], ['d', 'f']])
    expect(groups[0].label).toBe('relay.example.com')
    expect(sortChannelsByHost(channels).map((c) => c.id)).toEqual(['a', 'c', 'e', 'b', 'd', 'f'])
  })

  it('does not mutate input', () => {
    const copy = channels.map((c) => ({ ...c }))
    sortChannelsByHost(channels)
    expect(channels).toEqual(copy)
  })
})
