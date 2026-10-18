import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Character } from './characterCard'
import type { Conversation } from './conversationLifecycle'
import { completeChat, type ApiConfig } from './chatApi'
import { durableGet, durableSet } from './persistentStore'
import {
  MOMENTS_UPDATED_EVENT, USER_AUTHOR, buildCommentPrompt, buildPostPrompt, characterBrief, communityMemberIds, findMentionIds, momentAudienceIds,
  momentLine, parseReaction, sortMoments, splitPostImage, threadText, type Moment, type MomentComment, type MomentVisibility,
} from './moments'

export type MomentSeed = { authorId: string; sourceConversationId: string; sourceExcerpt: string }

type Props = {
  characters: Character[]
  conversations: Conversation[]
  userName: string
  userAvatar?: string
  api: ApiConfig
  seed: MomentSeed | null
  onSeedUsed: () => void
  onSaveToMemory: (groupIds: string[], title: string, content: string) => void
}

const STORE_KEY = 'weijing.moments'
const MAX_MOMENTS = 300
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const revealOnFocus = (event: React.FocusEvent<HTMLElement>) => {
  const target = event.currentTarget
  window.setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320)
}

const timeLabel = (at: number) => {
  const minutes = Math.round((Date.now() - at) / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小时前`
  const date = new Date(at)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function Moments({ characters, conversations, userName, userAvatar, api, seed, onSeedUsed, onSaveToMemory }: Props) {
  const [moments, setMoments] = useState<Moment[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeAuthor, setComposeAuthor] = useState(USER_AUTHOR)
  const [composeText, setComposeText] = useState('')
  const [composeSource, setComposeSource] = useState<{ conversationId: string; excerpt: string } | null>(null)
  const [visibility, setVisibility] = useState<MomentVisibility>({ kind: 'all' })
  const [menuId, setMenuId] = useState('')
  const [commentTarget, setCommentTarget] = useState<{ momentId: string; replyTo?: string } | null>(null)
  const [commentText, setCommentText] = useState('')
  const [sourceOpenId, setSourceOpenId] = useState('')
  const momentsRef = useRef(moments)
  momentsRef.current = moments

  useEffect(() => {
    let cancelled = false
    durableGet<Moment[]>(STORE_KEY).then((stored) => { if (!cancelled) { setMoments(stored || []); setReady(true) } }).catch(() => setReady(true))
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<Moment[]>).detail
      if (Array.isArray(detail)) setMoments(detail)
      else void durableGet<Moment[]>(STORE_KEY).then((stored) => setMoments(stored || []))
    }
    window.addEventListener(MOMENTS_UPDATED_EVENT, sync)
    return () => window.removeEventListener(MOMENTS_UPDATED_EVENT, sync)
  }, [])
  useEffect(() => { if (ready) void durableSet(STORE_KEY, moments.slice(0, MAX_MOMENTS)) }, [moments, ready])

  useEffect(() => {
    if (!seed) return
    setComposeAuthor(seed.authorId)
    setComposeSource({ conversationId: seed.sourceConversationId, excerpt: seed.sourceExcerpt })
    setComposeText(seed.authorId === USER_AUTHOR ? seed.sourceExcerpt.slice(0, 200) : '')
    setComposeOpen(true)
    onSeedUsed()
  }, [seed, onSeedUsed])

  const phoneGroups = conversations.filter((item) => item.phone)
  const memberIds = communityMemberIds(conversations)
  const members = memberIds.map((id) => characters.find((item) => item.id === id)).filter(Boolean) as Character[]
  const nameOf = (id: string) => id === USER_AUTHOR ? userName : characters.find((item) => item.id === id)?.name || '已离开的角色'
  const avatarOf = (id: string) => id === USER_AUTHOR ? userAvatar : characters.find((item) => item.id === id)?.avatar
  const sorted = useMemo(() => sortMoments(moments), [moments])
  const summaries = moments.filter((item) => item.savedToMemory).slice(-5).map((item) => momentLine(item, nameOf))

  const update = (id: string, change: (moment: Moment) => Moment) => setMoments((current) => current.map((item) => item.id === id ? change(item) : item))

  const callModel = async (messages: ReturnType<typeof buildPostPrompt>, maxTokens: number) => {
    let output = ''
    await completeChat({ api, messages, temperature: .95, topP: .95, maxTokens, streaming: false, signal: new AbortController().signal, onDelta: (delta) => { output += delta } })
    return output
  }

  const react = async (momentId: string, trigger: string, mentioned: string[] = []) => {
    const moment = momentsRef.current.find((item) => item.id === momentId)
    if (!moment || moment.commentsClosed) return
    const audience = momentAudienceIds(moment, conversations).map((id) => characters.find((item) => item.id === id)).filter(Boolean) as Character[]
    if (!audience.length) return
    setBusy('大家正在刷动态…')
    setError('')
    try {
      const raw = await callModel(buildCommentPrompt({
        moment, nameOf, userName, trigger,
        briefs: audience.map((character) => characterBrief(character, conversations)),
        candidateNames: audience.map((character) => character.name),
        mentionedNames: mentioned.map(nameOf),
        recent: sorted.filter((item) => item.id !== momentId).slice(0, 4).map((item) => momentLine(item, nameOf)),
      }), 1600)
      const parsed = parseReaction(raw)
      const byName = (name: string) => name === userName ? USER_AUTHOR : audience.find((character) => character.name === name)?.id
      const now = Date.now()
      const comments: MomentComment[] = parsed.comments.flatMap((comment, index) => {
        const authorId = byName(comment.author)
        if (!authorId || authorId === USER_AUTHOR) return []
        const replyId = comment.replyTo ? byName(comment.replyTo) : undefined
        return [{ id: uid(), authorId, replyToAuthorId: replyId && replyId !== authorId ? replyId : undefined, text: comment.text, createdAt: now + index }]
      })
      const likes = parsed.likes.map(byName).filter((id): id is string => Boolean(id) && id !== USER_AUTHOR)
      if (!comments.length && !likes.length) throw new Error('模型没有给出可用的评论')
      update(momentId, (item) => ({ ...item, likes: [...new Set([...item.likes, ...likes])], comments: [...item.comments, ...comments] }))
    } catch (cause) {
      setError(`评论生成失败：${cause instanceof Error ? cause.message : '请稍后再试'}`)
    } finally {
      setBusy('')
    }
  }

  const publish = async () => {
    let text = composeText.trim()
    let image: string | undefined
    if (composeAuthor !== USER_AUTHOR && !text) {
      const author = characters.find((item) => item.id === composeAuthor)
      if (!author) return
      setBusy(`${author.name} 正在编辑动态…`)
      setError('')
      try {
        const raw = await callModel(buildPostPrompt({ author, brief: characterBrief(author, conversations), userName, summaries, recent: sorted.slice(0, 5).map((item) => momentLine(item, nameOf)), sourceExcerpt: composeSource?.excerpt }), 400)
        ;({ text, image } = splitPostImage(raw))
      } catch (cause) {
        setError(`发动态失败：${cause instanceof Error ? cause.message : '请稍后再试'}`)
        setBusy('')
        return
      }
      setBusy('')
    }
    if (!text) return
    const moment: Moment = { id: uid(), authorId: composeAuthor, text, image, createdAt: Date.now(), visibility, likes: [], comments: [], ...(composeSource ? { sourceConversationId: composeSource.conversationId, sourceExcerpt: composeSource.excerpt } : {}) }
    setMoments((current) => [moment, ...current])
    momentsRef.current = [moment, ...momentsRef.current]
    setComposeOpen(false); setComposeText(''); setComposeSource(null); setComposeAuthor(USER_AUTHOR)
    const people = members.map((item) => ({ id: item.id, name: item.name }))
    await react(moment.id, '这条动态刚发出来，能看到的角色自然地来点赞、评论、互相接话（不是每个人都必须说话）。', findMentionIds(text, people))
  }

  const sendComment = async () => {
    if (!commentTarget || !commentText.trim()) return
    const { momentId, replyTo } = commentTarget
    const text = commentText.trim()
    update(momentId, (item) => ({ ...item, comments: [...item.comments, { id: uid(), authorId: USER_AUTHOR, replyToAuthorId: replyTo, text, createdAt: Date.now() }] }))
    momentsRef.current = momentsRef.current.map((item) => item.id === momentId ? { ...item, comments: [...item.comments, { id: 'pending', authorId: USER_AUTHOR, replyToAuthorId: replyTo, text, createdAt: Date.now() }] } : item)
    setCommentText(''); setCommentTarget(null)
    const mentioned = [...new Set([...(replyTo && replyTo !== USER_AUTHOR ? [replyTo] : []), ...findMentionIds(text, members.map((item) => ({ id: item.id, name: item.name })))])]
    await react(momentId, `${userName}刚刚评论了${replyTo ? `（回复 ${nameOf(replyTo)}）` : ''}。相关角色接着回应，不相关的可以不说话。`, mentioned)
  }

  const saveToMemory = (moment: Moment) => {
    const groupIds = moment.visibility.kind === 'group'
      ? [moment.visibility.groupId]
      : phoneGroups.filter((group) => moment.authorId === USER_AUTHOR || group.participantIds?.includes(moment.authorId)).map((group) => group.id)
    const thread = threadText(moment, nameOf, 12)
    onSaveToMemory(groupIds, `动态｜${nameOf(moment.authorId)}`, `${nameOf(moment.authorId)}发了动态：“${moment.text}”${thread ? `\n评论区：\n${thread}` : ''}`)
    update(moment.id, (item) => ({ ...item, savedToMemory: true }))
    setMenuId('')
  }

  const toggleLike = (moment: Moment) => update(moment.id, (item) => ({ ...item, likes: item.likes.includes(USER_AUTHOR) ? item.likes.filter((id) => id !== USER_AUTHOR) : [...item.likes, USER_AUTHOR] }))

  const visibilityLabel = (value: MomentVisibility) => value.kind === 'all' ? '所有角色可见' : value.kind === 'group' ? `仅「${phoneGroups.find((group) => group.id === value.groupId)?.title || '已删除的群'}」可见` : `仅 ${value.memberIds.map(nameOf).join('、')} 可见`

  if (!members.length) return <div className="privacy-note">先建一个小手机群，群里的角色就会住进社区，可以发动态、评论、互相举报。</div>

  return <div className="moments">
    <div className="moments-toolbar">
      <button className="library-sheet-save" disabled={Boolean(busy)} onClick={() => setComposeOpen(true)}>＋ 发动态</button>
    </div>
    {busy && <div className="moments-busy">{busy}</div>}
    {error && <div className="moments-error" role="alert">{error}<button aria-label="关闭" onClick={() => setError('')}>×</button></div>}
    {composeOpen && <article className="moment-compose">
      <label>谁来发<select value={composeAuthor} onChange={(event) => setComposeAuthor(event.target.value)}><option value={USER_AUTHOR}>{userName}（我）</option>{members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <textarea onFocus={revealOnFocus} value={composeText} onChange={(event) => setComposeText(event.target.value)} rows={3} placeholder={composeAuthor === USER_AUTHOR ? '这一刻的想法……可以 @角色' : '留空就让 TA 自己写一条'} />
      {composeSource && <div className="moment-source-chip">关联原剧情：{composeSource.excerpt.slice(0, 40)}…<button onClick={() => setComposeSource(null)}>×</button></div>}
      <label>谁可以看<select value={visibility.kind === 'group' ? `group:${visibility.groupId}` : visibility.kind === 'members' ? 'members' : 'all'} onChange={(event) => {
        const value = event.target.value
        setVisibility(value === 'all' ? { kind: 'all' } : value === 'members' ? { kind: 'members', memberIds: [] } : { kind: 'group', groupId: value.slice(6) })
      }}><option value="all">所有角色</option>{phoneGroups.map((group) => <option key={group.id} value={`group:${group.id}`}>仅「{group.title}」</option>)}<option value="members">指定成员</option></select></label>
      {visibility.kind === 'members' && <div className="moment-member-picks">{members.map((item) => {
        const picked = visibility.memberIds.includes(item.id)
        return <button key={item.id} className={picked ? 'picked' : ''} onClick={() => setVisibility({ kind: 'members', memberIds: picked ? visibility.memberIds.filter((id) => id !== item.id) : [...visibility.memberIds, item.id] })}>{item.name}</button>
      })}</div>}
      <div className="moment-compose-actions"><button onClick={() => { setComposeOpen(false); setComposeSource(null) }}>取消</button><button className="primary" disabled={Boolean(busy) || (composeAuthor === USER_AUTHOR && !composeText.trim()) || (visibility.kind === 'members' && !visibility.memberIds.length)} onClick={() => void publish()}>{composeAuthor !== USER_AUTHOR && !composeText.trim() ? '让 TA 写一条' : '发表'}</button></div>
    </article>}
    {!sorted.length && <div className="privacy-note">社区还很安静。发第一条，或者让某个角色先发。</div>}
    {sorted.map((moment) => {
      const avatar = avatarOf(moment.authorId)
      return <article key={moment.id} className={`moment-card${moment.pinned ? ' pinned' : ''}`}>
        <header>{avatar ? <img src={avatar} alt="" /> : <span className="moment-avatar">{nameOf(moment.authorId).slice(-1)}</span>}<div><strong>{nameOf(moment.authorId)}</strong><small>{moment.pinned ? '置顶 · ' : ''}{timeLabel(moment.createdAt)} · {visibilityLabel(moment.visibility)}</small></div><button className="moment-more" aria-label="动态操作" onClick={() => setMenuId(menuId === moment.id ? '' : moment.id)}>•••</button></header>
        {menuId === moment.id && <div className="moment-menu">
          <button onClick={() => { update(moment.id, (item) => ({ ...item, pinned: !item.pinned })); setMenuId('') }}>{moment.pinned ? '取消置顶' : '置顶'}</button>
          <button onClick={() => { update(moment.id, (item) => ({ ...item, commentsClosed: !item.commentsClosed })); setMenuId('') }}>{moment.commentsClosed ? '打开评论' : '关闭评论'}</button>
          <button disabled={moment.savedToMemory} onClick={() => saveToMemory(moment)}>{moment.savedToMemory ? '已存进群记忆' : '存进群记忆'}</button>
          <button disabled={Boolean(busy) || moment.commentsClosed} onClick={() => { setMenuId(''); void react(moment.id, '再来一轮：能看到的角色继续刷这条动态，接着评论区的话头吐槽、互怼。') }}>让大家再刷一轮</button>
          <button className="danger" onClick={() => { if (window.confirm('删除这条动态和全部评论？')) { setMoments((current) => current.filter((item) => item.id !== moment.id)); setMenuId('') } }}>删除</button>
        </div>}
        <p className="moment-text">{moment.text}</p>
        {moment.image && <div className="moment-image">📷 {moment.image}</div>}
        {moment.sourceExcerpt && <button className="moment-source" onClick={() => setSourceOpenId(sourceOpenId === moment.id ? '' : moment.id)}>出处：{conversations.find((item) => item.id === moment.sourceConversationId)?.title || '原剧情'} {sourceOpenId === moment.id ? '收起' : '查看'}</button>}
        {sourceOpenId === moment.id && <blockquote className="moment-source-text">{moment.sourceExcerpt}</blockquote>}
        <div className="moment-actions"><button className={moment.likes.includes(USER_AUTHOR) ? 'liked' : ''} onClick={() => toggleLike(moment)}>♡ {moment.likes.length || ''}</button>{!moment.commentsClosed && <button onClick={() => setCommentTarget({ momentId: moment.id })}>评论</button>}</div>
        {(moment.likes.length > 0 || moment.comments.length > 0) && <div className="moment-thread">
          {moment.likes.length > 0 && <div className="moment-likes">♡ {moment.likes.map(nameOf).join('、')}</div>}
          {moment.comments.map((comment) => <button key={comment.id} className="moment-comment" disabled={moment.commentsClosed} onClick={() => setCommentTarget({ momentId: moment.id, replyTo: comment.authorId === USER_AUTHOR ? undefined : comment.authorId })}><b>{nameOf(comment.authorId)}</b>{comment.replyToAuthorId && <> 回复 <b>{nameOf(comment.replyToAuthorId)}</b></>}：{comment.text}</button>)}
          {moment.commentsClosed && <div className="moment-closed">评论已关闭</div>}
        </div>}
        {commentTarget?.momentId === moment.id && <div className="moment-comment-input"><input autoFocus onFocus={revealOnFocus} value={commentText} onChange={(event) => setCommentText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void sendComment() }} placeholder={commentTarget.replyTo ? `回复 ${nameOf(commentTarget.replyTo)}` : '评论，可以 @角色'} /><button disabled={!commentText.trim() || Boolean(busy)} onClick={() => void sendComment()}>发送</button><button aria-label="取消" onClick={() => { setCommentTarget(null); setCommentText('') }}>×</button></div>}
      </article>
    })}
  </div>
}
