import { useEffect, useState } from 'react'
import type { Character } from './characterCard'
import type { Conversation } from './conversationLifecycle'
import { completeChat, type ApiConfig } from './chatApi'
import { prepareChatImage, type ChatImage } from './chatImages'
import { characterBrief } from './moments'
import { PHONE_POINTS_EVENT, readPoints, type PointsState } from './phonePoints'
import {
  PHONE_DIARY_EVENT, currentMood, parseDailyMoods, readPhoneDiary, setOnlineMood, writePhoneDiary,
  type DiaryEntry, type PhoneDiaryState,
} from './phoneDiary'

const uid = () => `diary-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const DIARY_IMAGE_LIMIT = 9
const when = (at: number) => new Date(at).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function PhoneDiary({ members, conversations, userName, api }: { members: Character[]; conversations: Conversation[]; userName: string; api: ApiConfig }) {
  const [state, setState] = useState<PhoneDiaryState>(readPhoneDiary)
  const [points, setPoints] = useState<PointsState>(readPoints)
  const [compose, setCompose] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [images, setImages] = useState<ChatImage[]>([])
  const [viewer, setViewer] = useState('')
  const [imageBusy, setImageBusy] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const sync = () => setState(readPhoneDiary())
    const syncPoints = () => setPoints(readPoints())
    window.addEventListener(PHONE_DIARY_EVENT, sync)
    window.addEventListener(PHONE_POINTS_EVENT, syncPoints)
    return () => { window.removeEventListener(PHONE_DIARY_EVENT, sync); window.removeEventListener(PHONE_POINTS_EVENT, syncPoints) }
  }, [])

  const saveState = (next: PhoneDiaryState) => { setState(next); writePhoneDiary(next) }
  const resetCompose = () => { setCompose(false); setEditingId(''); setTitle(''); setBody(''); setImages([]) }
  const addImages = async (files: FileList | null) => {
    const picked = Array.from(files || []).slice(0, Math.max(0, DIARY_IMAGE_LIMIT - images.length))
    if (!picked.length) { if (files?.length) setError(`每篇日记最多 ${DIARY_IMAGE_LIMIT} 张图`); return }
    setImageBusy(true)
    setError('')
    try {
      const prepared = await Promise.all(picked.map((file) => prepareChatImage(file)))
      setImages((current) => [...current, ...prepared].slice(0, DIARY_IMAGE_LIMIT))
    } catch (cause) { setError(cause instanceof Error ? cause.message : '图片读取失败') }
    finally { setImageBusy(false) }
  }
  const saveEntry = () => {
    const cleanBody = body.trim()
    if (!cleanBody && !images.length) return
    const now = Date.now()
    const cleanTitle = title.trim() || new Date(now).toLocaleDateString([], { month: 'long', day: 'numeric' })
    const entries = editingId
      ? state.entries.map((entry) => entry.id === editingId ? { ...entry, title: cleanTitle.slice(0, 50), body: cleanBody, images, updatedAt: now } : entry)
      : [{ id: uid(), title: cleanTitle.slice(0, 50), body: cleanBody, images, createdAt: now, updatedAt: now, unlockedBy: [] }, ...state.entries]
    saveState({ ...state, entries })
    resetCompose()
  }
  const editEntry = (entry: DiaryEntry) => { setEditingId(entry.id); setTitle(entry.title); setBody(entry.body); setImages(entry.images || []); setCompose(true) }

  const generateMoods = async () => {
    if (!members.length || busy) return
    if (!api.apiKey || !api.baseUrl || !api.modelName) { setError('先配置聊天 API，才能让他们自己写今日心情。'); return }
    setBusy('大家正在改在线心情…')
    setError('')
    let raw = ''
    try {
      await completeChat({
        api, temperature: .95, topP: .95, maxTokens: 900, streaming: false, signal: new AbortController().signal,
        messages: [
          { role: 'system', content: `你在为惟境小手机里的成年角色生成今天的在线心情。${userName}是他们共同认识的人。每个人必须保持自己的人设和语气，心情像微信状态：很短、自然、有个性，可以带一个 emoji，可以阴阳怪气、吃醋、忙碌或开心，不能替${userName}说话。` },
          { role: 'user', content: `${members.map((member) => `${characterBrief(member, conversations)}\n角色ID：${member.id}`).join('\n\n')}\n\n请给每个人写一句今天的自定义在线心情，每句不超过 20 字。只输出 JSON：{"moods":[{"id":"角色ID","text":"心情"}]}` },
        ],
        onDelta: (delta) => { raw += delta },
      })
      const parsed = parseDailyMoods(raw)
      if (!parsed.length) throw new Error('模型没有写出可用的心情')
      const allowed = new Set(members.map((member) => member.id))
      let next = state
      const now = Date.now()
      for (const mood of parsed) if (allowed.has(mood.id)) next = setOnlineMood(next, mood.id, mood.text, now)
      saveState(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '心情生成失败')
    } finally { setBusy('') }
  }

  return <div className="phone-diary">
    {viewer && <button className="forum-viewer" aria-label="关闭大图" onClick={() => setViewer('')}><img src={viewer} alt="" /></button>}
    <section className="phone-mood-wall">
      <header><div><strong>今日在线心情</strong><small>他们聊天时也会自己改，每天自动过期</small></div><button type="button" disabled={Boolean(busy)} onClick={() => void generateMoods()}>{busy ? '正在写…' : '让大家写'}</button></header>
      {error && <div className="moments-error" role="alert">{error}<button aria-label="关闭" onClick={() => setError('')}>×</button></div>}
      <div className="phone-mood-list">{members.map((member) => {
        const mood = currentMood(state, member.id)
        return <div key={member.id}>{member.avatar ? <img src={member.avatar} alt="" /> : <i>{member.name.slice(-1)}</i>}<span><b>{member.name}</b><small>{mood?.text || '今天还没写心情'}</small></span><em>{points.balances[member.id] || 0} 分</em></div>
      })}</div>
    </section>

    <div className="phone-diary-head"><div><strong>{userName}的私人日记</strong><small>他们每篇各自花 5 积分解锁</small></div><button type="button" onClick={() => setCompose(!compose)}>{compose ? '收起' : '＋ 写日记'}</button></div>
    {compose && <section className="moment-compose phone-diary-compose">
      <input value={title} maxLength={50} onChange={(event) => setTitle(event.target.value)} placeholder="日记标题（可不写）" />
      <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} placeholder="写给自己看的……" />
      <div className="forum-image-picks">
        {images.map((image) => <span key={image.id} className="forum-image-pick"><img src={image.dataUrl} alt="" /><button type="button" aria-label="移除图片" onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))}>×</button></span>)}
        {images.length < DIARY_IMAGE_LIMIT && <label className="forum-image-add" aria-label="添加日记图片">📷<input type="file" accept="image/*" multiple onChange={(event) => { void addImages(event.target.files); event.target.value = '' }} /></label>}
        {imageBusy && <small className="phone-diary-image-busy">图片处理中…</small>}
      </div>
      <div className="moment-compose-actions"><button type="button" onClick={resetCompose}>取消</button><button type="button" className="primary" disabled={imageBusy || (!body.trim() && !images.length)} onClick={saveEntry}>{editingId ? '保存修改' : '锁进日记'}</button></div>
    </section>}
    {!state.entries.length && <div className="privacy-note">还没有日记。你写下正文后，他们只能看见标题；谁真想偷看，谁自己掏 5 积分。</div>}
    {state.entries.map((entry) => <article key={entry.id} className="phone-diary-entry">
      <header><div><strong>{entry.title}</strong><small>{when(entry.updatedAt)}{entry.updatedAt !== entry.createdAt ? ' · 已修改' : ''}</small></div><button type="button" onClick={() => editEntry(entry)}>编辑</button><button type="button" className="danger" onClick={() => { if (window.confirm(`删除《${entry.title}》？`)) saveState({ ...state, entries: state.entries.filter((item) => item.id !== entry.id) }) }}>删除</button></header>
      {entry.body && <p>{entry.body}</p>}
      {entry.images?.length ? <div className={`forum-images count-${Math.min(entry.images.length, 3)}`}>{entry.images.map((image) => <button key={image.id} type="button" aria-label="查看日记大图" onClick={() => setViewer(image.dataUrl)}><img src={image.dataUrl} alt="" loading="lazy" /></button>)}</div> : null}
      <footer>{entry.unlockedBy.length ? <>已解锁：{entry.unlockedBy.map((id) => members.find((member) => member.id === id)?.name || '已离开的角色').join('、')}</> : '🔒 暂时没人舍得花积分'}</footer>
    </article>)}
  </div>
}
