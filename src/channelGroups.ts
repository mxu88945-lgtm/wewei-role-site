export type GroupableChannel = { id: string; name?: string; baseUrl?: string }

export type ChannelGroup<T extends GroupableChannel> = { key: string; label: string; channels: T[] }

export function channelGroupKey(channel: GroupableChannel): string {
  const raw = (channel.baseUrl || '').trim()
  if (raw) {
    for (const candidate of [raw, `https://${raw}`]) {
      try {
        const host = new URL(candidate).hostname.toLowerCase()
        if (host) return host
      } catch {
        // try next candidate
      }
    }
  }
  return `name:${(channel.name || '').trim().toLowerCase() || channel.id}`
}

/** Groups channels sharing the same base URL host. Group order follows first appearance; order inside a group is preserved. */
export function groupChannelsByHost<T extends GroupableChannel>(channels: readonly T[]): ChannelGroup<T>[] {
  const groups = new Map<string, ChannelGroup<T>>()
  for (const channel of channels) {
    const key = channelGroupKey(channel)
    const existing = groups.get(key)
    if (existing) existing.channels.push(channel)
    else groups.set(key, { key, label: key.startsWith('name:') ? (channel.name || '未命名渠道') : key, channels: [channel] })
  }
  return [...groups.values()]
}

export function sortChannelsByHost<T extends GroupableChannel>(channels: readonly T[]): T[] {
  return groupChannelsByHost(channels).flatMap((group) => group.channels)
}
