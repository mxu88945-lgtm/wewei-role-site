import type { ReactNode } from 'react'
import { groupChannelsByHost, type GroupableChannel } from './channelGroups'

export function ChannelOptions<T extends GroupableChannel>({ channels, renderLabel }: { channels: readonly T[]; renderLabel?: (channel: T) => ReactNode }) {
  const label = renderLabel ?? ((channel: T) => channel.name || '未命名渠道')
  return <>{groupChannelsByHost(channels).map((group) => group.channels.length > 1
    ? <optgroup key={group.key} label={group.label}>{group.channels.map((item) => <option key={item.id} value={item.id}>{label(item)}</option>)}</optgroup>
    : group.channels.map((item) => <option key={item.id} value={item.id}>{label(item)}</option>))}</>
}
