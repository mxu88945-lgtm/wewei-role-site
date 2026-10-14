import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Character } from './characterCard'
import type { Conversation } from './conversationLifecycle'
import { completeChat, type ApiConfig, type ChatApiMessage } from './chatApi'
import { prepareChatImage, type ChatImage } from './chatImages'
import { durableGet, durableSet } from './persistentStore'
import { characterBrief, communityMemberIds, findMentionIds, type Moment } from './moments'
import {
  FORUM_BOARDS, FORUM_FLOOR_IMAGE_LIMIT, FORUM_THREAD_IMAGE_LIMIT, FORUM_USER, forumPromptPixels, buildFloorsPrompt, buildThreadPrompt, floorNumber, floorsText, forumThreadLine, parseFloors, parseThreadDraft,
  pickForumReaders, sortThreads, threadsFromMoments, type ForumBoard, type ForumFloor, type ForumThread,
} from './forum'
import type { MomentSeed } from './Moments'

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

const STORE_KEY = 'weijing.forum'
const MOMENTS_KEY = 'weijing.moments'
const MAX_THREADS = 300
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

export function Forum({ characters, conversations, userName, userAvatar, api, seed, onSeedUsed, onSaveToMemory }: Props) {
  const [threads, setThreads] = useState<ForumThread[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [board, setBoard] = useState<ForumBoard | 'all'>('all')
  const [sortMode, setSortMode] = useState<'new' | 'hot'>('new')
  const [openId, setOpenId] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeAuthor, setComposeAuthor] = useState(FORUM_USER)
  const [composeBoard, setComposeBoard] = useState<ForumBoard>('日常')
  const [composeTitle, setComposeTitle] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composeAnonymous, setComposeAnonymous] = useState(false)
  const [composeSource, setComposeSource] = useState<{ conversationId: string; excerpt: string } | null>(null)
  const [replyTo, setReplyTo] = useState(0)
  const [replyText, setReplyText] = useState('')
  const [replyAnonymous, setReplyAnonymous] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [composeImages, setComposeImages] = useState<ChatImage[]>([])
  const [replyImages, setReplyImages] = useState<ChatImage[]>([])
  const [viewer, setViewer] = useState('')
  const threadsRef = useRef(threads)
  threadsRef.current = threads

  useEffect(() => {
    let cancelled = false
    Promise.all([durableGet<ForumThread[]>(STORE_KEY), durableGet<Moment[]>(MOMENTS_KEY)])
      .then(([stored, moments]) => {
        if (cancelled) return
        // 第一次打开论坛：把旧动态搬进来，原数据不删。
        setThreads(stored ? stored : moments?.length ? threadsFromMoments(moments) : [])
        setReady(true)
      })
      .catch(() => setReady(true))
    return () => { cancelled = true }
  }, [])
  useEffect(() => { if (ready) void durableSet(STORE_KEY, threads.slice(0, MAX_THREADS)) }, [threads, ready])

  useEffect(() => {
    if (!seed) return
    setComposeAuthor(seed.authorId === 'user' ? FORUM_USER : seed.authorId)
    setComposeSource({ conversationId: seed.sourceConversationId, excerpt: seed.sourceExcerpt })
    setComposeBoard('剧情讨论')
    setComposeTitle('')
    setComposeBody(seed.authorId === 'user' ? seed.sourceExcerpt.slice(0, 200) : '')
    setComposeOpen(true)
    setOpenId('')
    onSeedUsed()
  }, [seed, onSeedUsed])

  const phoneGroups = conversations.filter((item) => item.phone)
  const memberIds = communityMemberIds(conversations)
  const members = memberIds.map((id) => characters.find((item) => item.id === id)).filter(Boolean) as Character[]
  const nameOf = (id: string) => id === FORUM_USER ? userName : characters.find((item) => item.id === id)?.name || '已离开的角色'
  const avatarOf = (id: string) => id === FORUM_USER ? userAvatar : characters.find((item) => item.id === id)?.avatar
  const people = members.map((item) => ({ id: item.id, name: item.name }))
  const visible = useMemo(() => sortThreads(threads.filter((item) => board === 'all' || item.board === board), sortMode), [threads, board, sortMode])
  const recentLines = (exceptId = '') => sortThreads(threads, 'new').filter((item) => item.id !== exceptId).slice(0, 6).map((item) => forumThreadLine(item, nameOf))
  const update = (id: string, change: (thread: ForumThread) => ForumThread) => {
    threadsRef.current = threadsRef.current.map((item) => item.id === id ? change(item) : item)
    setThreads(threadsRef.current)
  }

  const addImages = async (files: FileList | null, current: ChatImage[], limit: number, set: (images: ChatImage[]) => void) => {
    const picked = Array.from(files || []).slice(0, Math.max(0, limit - current.length))
    if (!picked.length) { if (files?.length) setError(`最多 ${limit} 张图`); return }
    try {
      const images = await Promise.all(picked.map((file) => prepareChatImage(file)))
      set([...current, ...images].slice(0, limit))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '图片读取失败')
    }
  }

  const imagePicker = (current: ChatImage[], limit: number, set: (images: ChatImage[]) => void) => <div className="forum-image-picks">
    {current.map((image) => <span key={image.id} className="forum-image-pick"><img src={image.dataUrl} alt="" /><button aria-label="移除图片" onClick={() => set(current.filter((item) => item.id !== image.id))}>×</button></span>)}
    {current.length < limit && <label className="forum-image-add" aria-label="加图片">📷<input type="file" accept="image/*" multiple onChange={(event) => { void addImages(event.target.files, current, limit, set); event.target.value = '' }} /></label>}
  </div>

  const imageGrid = (images: ChatImage[] | undefined) => images?.length ? <div className={`forum-images count-${Math.min(images.length, 3)}`}>{images.map((image) => <button key={image.id} onClick={() => setViewer(image.dataUrl)}><img src={image.dataUrl} alt="" loading="lazy" /></button>)}</div> : null

  const callModel = async (messages: ChatApiMessage[], maxTokens: number) => {
    let output = ''
    await completeChat({ api, messages, temperature: .95, topP: .95, maxTokens, streaming: false, signal: new AbortController().signal, onDelta: (delta) => { output += delta } })
    return output
  }

  const gatherFloors = async (threadId: string, trigger: string, mentionedIds: string[] = []) => {
    const thread = threadsRef.current.find((item) => item.id === threadId)
    if (!thread || thread.locked) return
    const readers = pickForumReaders(memberIds, thread, mentionedIds).map((id) => characters.find((item) => item.id === id)).filter(Boolean) as Character[]
    if (!readers.length) return
    setBusy('大家正在盖楼…')
    setError('')
    try {
      const promptInput = {
        thread, nameOf, userName, trigger,
        briefs: readers.map((character) => characterBrief(character, conversations)),
        candidateNames: readers.map((character) => character.name),
        mentionedNames: mentionedIds.map(nameOf),
        recent: recentLines(threadId).slice(0, 4),
      }
      const pixels = forumPromptPixels(thread)
      let raw: string
      try {
        raw = await callModel(buildFloorsPrompt({ ...promptInput, pixels }), 1800)
      } catch (cause) {
        // 模型不支持看图时退回纯文字，大家照样能盖楼。
        if (!pixels.length) throw cause
        raw = await callModel(buildFloorsPrompt(promptInput), 1800)
      }
      const parsed = parseFloors(raw, floorNumber(thread.floors.length) + 6)
      const byName = (name: string) => readers.find((character) => character.name === name)?.id
      const now = Date.now()
      const floors: ForumFloor[] = parsed.floors.flatMap((floor, index) => {
        const authorId = byName(floor.author)
        return authorId ? [{ id: uid(), authorId, text: floor.text, replyToFloor: floor.replyToFloor || undefined, anonymous: floor.anonymous || undefined, createdAt: now + index }] : []
      })
      const likes = parsed.likes.map(byName).filter((id): id is string => Boolean(id))
      if (!floors.length && !likes.length) throw new Error('模型没有给出可用的回帖')
      update(threadId, (item) => ({ ...item, likes: [...new Set([...item.likes, ...likes])], floors: [...item.floors, ...floors], updatedAt: floors.length ? now + floors.length : item.updatedAt }))
    } catch (cause) {
      setError(`盖楼失败：${cause instanceof Error ? cause.message : '请稍后再试'}`)
    } finally {
      setBusy('')
    }
  }

  const resetCompose = () => { setComposeImages([]); setComposeOpen(false); setComposeTitle(''); setComposeBody(''); setComposeSource(null); setComposeAuthor(FORUM_USER); setComposeAnonymous(false) }

  const publish = async (randomAuthor = false) => {
    let authorId = composeAuthor
    let title = composeTitle.trim()
    let body = composeBody.trim()
    let threadBoard = composeBoard
    let anonymous = composeAnonymous
    let imageNote: string | undefined
    const images = randomAuthor ? [] : composeImages
    if (randomAuthor) {
      if (!members.length) return
      authorId = members[Math.floor(Math.random() * members.length)].id
      title = ''; body = ''
    }
    if (authorId !== FORUM_USER && (!title || !body)) {
      const author = characters.find((item) => item.id === authorId)
      if (!author) return
      setBusy(`${author.name} 正在开帖…`)
      setError('')
      try {
        const raw = await callModel(buildThreadPrompt({ authorName: author.name, brief: characterBrief(author, conversations), userName, recent: recentLines(), board: randomAuthor ? undefined : composeBoard, sourceExcerpt: randomAuthor ? undefined : composeSource?.excerpt, hint: randomAuthor ? '' : [title, body].filter(Boolean).join('：') }), 600)
        const draft = parseThreadDraft(raw)
        if (!draft) throw new Error('模型没写出完整的标题和正文')
        title = draft.title; body = draft.body; anonymous = draft.anonymous; imageNote = images.length ? undefined : draft.image
        if (randomAuthor && draft.board) threadBoard = draft.board
      } catch (cause) {
        setError(`开帖失败：${cause instanceof Error ? cause.message : '请稍后再试'}`)
        setBusy('')
        return
      }
      setBusy('')
    }
    if (!title || (!body && !images.length)) return
    const now = Date.now()
    const thread: ForumThread = { id: uid(), board: threadBoard, title, authorId, anonymous: anonymous || undefined, body, ...(images.length ? { images } : {}), ...(imageNote ? { imageNote } : {}), createdAt: now, updatedAt: now, floors: [], likes: [], ...(!randomAuthor && composeSource ? { sourceConversationId: composeSource.conversationId, sourceExcerpt: composeSource.excerpt } : {}) }
    threadsRef.current = [thread, ...threadsRef.current]
    setThreads(threadsRef.current)
    resetCompose()
    setOpenId(thread.id)
    await gatherFloors(thread.id, '帖子刚发出来，逛论坛的角色自然地来回帖、抢沙发、互相接话（不是每个人都必须说话）。', findMentionIds(`${title} ${body}`, people))
  }

  const sendReply = async (thread: ForumThread) => {
    const text = replyText.trim()
    const images = replyImages
    if (!text && !images.length) return
    const target = replyTo
    update(thread.id, (item) => ({ ...item, floors: [...item.floors, { id: uid(), authorId: FORUM_USER, text, ...(images.length ? { images } : {}), replyToFloor: target || undefined, anonymous: replyAnonymous || undefined, createdAt: Date.now() }], updatedAt: Date.now() }))
    setReplyText(''); setReplyTo(0); setReplyImages([])
    const targetFloor = target >= 2 ? thread.floors[target - 2] : undefined
    const targetAuthor = target === 1 ? thread.authorId : targetFloor?.authorId
    const mentioned = [...new Set([...(targetAuthor && targetAuthor !== FORUM_USER ? [targetAuthor] : []), ...findMentionIds(text, people)])]
    await gatherFloors(thread.id, `${replyAnonymous ? '一位匿名网友' : userName}刚刚回帖了${target ? `（回复${target}楼）` : ''}${images.length ? `，贴了 ${images.length} 张图` : ''}。相关角色接着回应，不相关的可以不说话。`, mentioned)
  }

  const saveToMemory = (thread: ForumThread) => {
    const groupIds = phoneGroups.filter((group) => thread.authorId === FORUM_USER || group.participantIds?.includes(thread.authorId)).map((group) => group.id)
    const floors = floorsText(thread, nameOf, 12)
    onSaveToMemory(groupIds, `论坛｜${thread.title}`, `${thread.anonymous ? '有人匿名' : nameOf(thread.authorId)}在论坛「${thread.board}」版发帖《${thread.title}》：“${thread.body}”${floors ? `\n楼里：\n${floors}` : ''}`)
    update(thread.id, (item) => ({ ...item, savedToMemory: true }))
    setMenuOpen(false)
  }

  if (!members.length) return <div className="privacy-note">先建一个小手机群，群里的角色就会住进论坛，可以开帖、盖楼、互怼。</div>

  const avatarNode = (id: string, anonymous?: boolean) => {
    if (anonymous) return <span className="forum-avatar anonymous">匿</span>
    const avatar = avatarOf(id)
    return avatar ? <img className="forum-avatar" src={avatar} alt="" /> : <span className="forum-avatar">{nameOf(id).slice(-1)}</span>
  }

  const status = <>
    {viewer && <button className="forum-viewer" aria-label="关闭大图" onClick={() => setViewer('')}><img src={viewer} alt="" /></button>}
    {busy && <div className="moments-busy">{busy}</div>}
    {error && <div className="moments-error" role="alert">{error}<button aria-label="关闭" onClick={() => setError('')}>×</button></div>}
  </>

  const opened = threads.find((item) => item.id === openId)
  if (opened && !composeOpen) {
    const thread = opened
    return <div className="forum">
      <div className="forum-detail-bar"><button onClick={() => { setOpenId(''); setMenuOpen(false); setReplyTo(0) }}>‹ 返回论坛</button><span className="forum-board-tag">{thread.board}</span><button className="moment-more" aria-label="帖子管理" onClick={() => setMenuOpen(!menuOpen)}>•••</button></div>
      {menuOpen && <div className="moment-menu">
        <button onClick={() => { update(thread.id, (item) => ({ ...item, pinned: !item.pinned })); setMenuOpen(false) }}>{thread.pinned ? '取消置顶' : '置顶'}</button>
        <button onClick={() => { update(thread.id, (item) => ({ ...item, locked: !item.locked })); setMenuOpen(false) }}>{thread.locked ? '解除锁帖' : '锁帖'}</button>
        <button disabled={thread.savedToMemory} onClick={() => saveToMemory(thread)}>{thread.savedToMemory ? '已存进群记忆' : '存进群记忆'}</button>
        <button className="danger" onClick={() => { if (window.confirm('删除这个帖子和全部楼层？')) { setThreads((current) => current.filter((item) => item.id !== thread.id)); setOpenId(''); setMenuOpen(false) } }}>删除帖子</button>
      </div>}
      {status}
      <article className="forum-op">
        <h3>{thread.pinned ? '📌 ' : ''}{thread.title}</h3>
        <header>{avatarNode(thread.authorId, thread.anonymous)}<div><strong>{thread.anonymous ? '匿名用户' : nameOf(thread.authorId)} <em>楼主</em></strong><small>1楼 · {timeLabel(thread.createdAt)}</small></div></header>
        {thread.body && <p className="moment-text">{thread.body}</p>}
        {imageGrid(thread.images)}
        {thread.imageNote && <div className="moment-image">📷 {thread.imageNote}</div>}
        {thread.sourceExcerpt && <button className="moment-source" onClick={() => setSourceOpen(!sourceOpen)}>出处：{conversations.find((item) => item.id === thread.sourceConversationId)?.title || '原剧情'} {sourceOpen ? '收起' : '查看'}</button>}
        {sourceOpen && thread.sourceExcerpt && <blockquote className="moment-source-text">{thread.sourceExcerpt}</blockquote>}
        <div className="moment-actions"><button className={thread.likes.includes(FORUM_USER) ? 'liked' : ''} onClick={() => update(thread.id, (item) => ({ ...item, likes: item.likes.includes(FORUM_USER) ? item.likes.filter((id) => id !== FORUM_USER) : [...item.likes, FORUM_USER] }))}>♡ {thread.likes.length || ''}</button>{!thread.locked && <button onClick={() => setReplyTo(1)}>回复楼主</button>}</div>
        {thread.likes.length > 0 && <div className="moment-likes">♡ {thread.likes.map(nameOf).join('、')}</div>}
      </article>
      {thread.floors.map((floor, index) => {
        const number = floorNumber(index)
        const target = floor.replyToFloor ? (floor.replyToFloor === 1 ? { name: thread.anonymous ? '匿名用户' : nameOf(thread.authorId), text: thread.body } : thread.floors[floor.replyToFloor - 2] ? { name: thread.floors[floor.replyToFloor - 2].anonymous ? '匿名用户' : nameOf(thread.floors[floor.replyToFloor - 2].authorId), text: thread.floors[floor.replyToFloor - 2].text } : null) : null
        const isOp = !floor.anonymous && !thread.anonymous && floor.authorId === thread.authorId
        return <article key={floor.id} className="forum-floor">
          <header>{avatarNode(floor.authorId, floor.anonymous)}<div><strong>{floor.anonymous ? '匿名用户' : nameOf(floor.authorId)}{isOp && <em>楼主</em>}</strong><small>{number}楼 · {timeLabel(floor.createdAt)}</small></div>{!thread.locked && <button className="forum-reply-button" onClick={() => setReplyTo(number)}>回复</button>}</header>
          {target && <blockquote className="forum-quote">回复 {floor.replyToFloor}楼 {target.name}：{target.text.slice(0, 40)}{target.text.length > 40 ? '…' : ''}</blockquote>}
          {floor.text && <p className="moment-text">{floor.text}</p>}
          {imageGrid(floor.images)}
        </article>
      })}
      {thread.locked ? <div className="moment-closed">帖子已锁，不能再回</div> : <>
        <button className="forum-more-floors" disabled={Boolean(busy)} onClick={() => void gatherFloors(thread.id, '再来一轮：逛论坛的角色继续刷这个帖子，接着楼里的话头吐槽、互怼、站队。')}>让大家再盖一轮</button>
        <div className="forum-reply-box">
          {replyTo > 0 && <div className="moment-source-chip">回复 {replyTo}楼<button onClick={() => setReplyTo(0)}>×</button></div>}
          <textarea onFocus={revealOnFocus} rows={2} value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="回帖……可以 @角色" />
          {imagePicker(replyImages, FORUM_FLOOR_IMAGE_LIMIT, setReplyImages)}
          <div className="forum-reply-actions"><label className="forum-anon"><input type="checkbox" checked={replyAnonymous} onChange={(event) => setReplyAnonymous(event.target.checked)} />匿名</label><button className="primary" disabled={Boolean(busy) || (!replyText.trim() && !replyImages.length)} onClick={() => void sendReply(thread)}>回帖</button></div>
        </div>
      </>}
    </div>
  }

  return <div className="forum">
    <div className="forum-toolbar">
      <button className="library-sheet-save" disabled={Boolean(busy)} onClick={() => setComposeOpen(true)}>＋ 发帖</button>
      <button className="forum-random" disabled={Boolean(busy)} onClick={() => void publish(true)}>🎲 让角色开帖</button>
    </div>
    {status}
    {composeOpen && <article className="moment-compose">
      <label>谁来发<select value={composeAuthor} onChange={(event) => setComposeAuthor(event.target.value)}><option value={FORUM_USER}>{userName}（我）</option>{members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>版块<select value={composeBoard} onChange={(event) => setComposeBoard(event.target.value as ForumBoard)}>{FORUM_BOARDS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <input className="forum-title-input" onFocus={revealOnFocus} value={composeTitle} onChange={(event) => setComposeTitle(event.target.value)} maxLength={40} placeholder={composeAuthor === FORUM_USER ? '标题' : '标题（留空让 TA 自己起）'} />
      <textarea onFocus={revealOnFocus} value={composeBody} onChange={(event) => setComposeBody(event.target.value)} rows={4} placeholder={composeAuthor === FORUM_USER ? '正文……可以 @角色' : '留空就让 TA 自己写；写一句话就是给 TA 的主题方向'} />
      {imagePicker(composeImages, FORUM_THREAD_IMAGE_LIMIT, setComposeImages)}
      {composeSource && <div className="moment-source-chip">关联原剧情：{composeSource.excerpt.slice(0, 40)}…<button onClick={() => setComposeSource(null)}>×</button></div>}
      {composeAuthor === FORUM_USER && <label className="forum-anon"><input type="checkbox" checked={composeAnonymous} onChange={(event) => setComposeAnonymous(event.target.checked)} />匿名发帖</label>}
      <div className="moment-compose-actions"><button onClick={resetCompose}>取消</button><button className="primary" disabled={Boolean(busy) || (composeAuthor === FORUM_USER && (!composeTitle.trim() || (!composeBody.trim() && !composeImages.length)))} onClick={() => void publish()}>发布</button></div>
    </article>}
    <div className="forum-boards" role="tablist">{(['all', ...FORUM_BOARDS] as const).map((item) => <button key={item} role="tab" aria-selected={board === item} className={board === item ? 'active' : ''} onClick={() => setBoard(item)}>{item === 'all' ? '全部' : item}</button>)}</div>
    <div className="forum-sort"><button className={sortMode === 'new' ? 'active' : ''} onClick={() => setSortMode('new')}>最新回复</button><button className={sortMode === 'hot' ? 'active' : ''} onClick={() => setSortMode('hot')}>最热</button></div>
    {!visible.length && <div className="privacy-note">{board === 'all' ? '论坛还很安静。发第一帖，或者点「让角色开帖」。' : `「${board}」版还没有帖子。`}</div>}
    {visible.map((thread) => {
      const last = thread.floors[thread.floors.length - 1]
      return <button key={thread.id} className={`forum-row${thread.pinned ? ' pinned' : ''}`} onClick={() => { setOpenId(thread.id); setReplyTo(0); setSourceOpen(false) }}>
        <strong>{thread.pinned && <span className="forum-pin">置顶</span>}<span className="forum-board-tag">{thread.board}</span>{thread.title}</strong>
        <span className="forum-row-body">{thread.body.slice(0, 50) || (thread.images?.length ? '[图片]' : '')}</span>
        {thread.images?.length ? <span className="forum-row-thumbs">{thread.images.slice(0, 3).map((image) => <img key={image.id} src={image.dataUrl} alt="" loading="lazy" />)}{thread.images.length > 3 && <em>+{thread.images.length - 3}</em>}</span> : null}
        <small>{thread.anonymous ? '匿名用户' : nameOf(thread.authorId)} · 💬 {thread.floors.length} · ♡ {thread.likes.length}{thread.locked ? ' · 已锁' : ''} · {last ? `${last.anonymous ? '匿名' : nameOf(last.authorId)} ${timeLabel(last.createdAt)}回复` : timeLabel(thread.createdAt)}</small>
      </button>
    })}
  </div>
}
