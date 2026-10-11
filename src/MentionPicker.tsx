import { memo, useEffect, useState } from 'react'
import { loadAvatarThumbnail, peekAvatarThumbnail } from './avatarThumbnail'

export type MentionPickerMember = { id: string; name: string; avatar?: string }

function MentionAvatar({ name, avatar }: { name: string; avatar?: string }) {
  const [src, setSrc] = useState(() => peekAvatarThumbnail(avatar))
  useEffect(() => {
    const now = peekAvatarThumbnail(avatar)
    setSrc(now)
    if (now || !avatar) return
    let live = true
    void loadAvatarThumbnail(avatar).then((thumb) => { if (live) setSrc(thumb) })
    return () => { live = false }
  }, [avatar])
  return src ? <img src={src} alt="" decoding="async" /> : <span>{name.slice(-1)}</span>
}

/**
 * The group-chat @ picker. Kept as its own memoised component so opening it does
 * not need anything from the chat besides the member list, and member avatars are
 * shown as small cached thumbnails (see avatarThumbnail.ts).
 */
function MentionPicker({ members, onPick, onClose }: { members: MentionPickerMember[]; onPick: (name: string) => void; onClose: () => void }) {
  return <div className="mention-picker-layer" role="dialog" aria-modal="true" aria-label="选择要提及的角色">
    <button className="drawer-backdrop" aria-label="关闭角色选择" onClick={onClose} />
    <section className="mention-picker">
      <header><strong>选择 @ 的角色</strong><button onClick={onClose}>×</button></header>
      {members.map((member) => <button className="mention-member" key={member.id} onClick={() => onPick(member.name)}><MentionAvatar name={member.name} avatar={member.avatar} /><strong>{member.name}</strong></button>)}
    </section>
  </div>
}

export default memo(MentionPicker)
