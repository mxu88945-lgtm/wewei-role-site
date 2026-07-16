import { useEffect, useRef, useState } from 'react'
import { completeChat, type ChatApiContentPart } from './chatApi'
import type { ApiChannel } from './apiChannels'
import { createCharacterCardPng, importCharacterCard, type Character, type RegexScript } from './characterCard'
import {
  applyWorkshopCopilotPatch, buildCharacterWorkshopPrompt, buildWorkshopCopilotCompressionPrompt,
  buildWorkshopCopilotPrompt, characterFromWorkshopDraft, createEmptyCharacterWorkshopDraft,
  describeWorkshopCopilotPatch, parseCharacterWorkshopDraft, parseWorkshopCopilotResponse,
  type CharacterWorkshopBrief, type CharacterWorkshopDraft, type WorkshopCopilotMessage, type WorkshopCopilotPatch,
} from './characterWorkshop'
import './character-workshop.css'

type SavedWorkshop = {
  brief: CharacterWorkshopBrief
  result: CharacterWorkshopDraft | null
  avatar?: string
  copilotMessages?: WorkshopCopilotMessage[]
  copilotMemory?: string
  pendingCopilotPatch?: WorkshopCopilotPatch | null
  copilotUndoSnapshot?: CharacterWorkshopDraft | null
}

const initialBrief: CharacterWorkshopBrief = { concept: '', name: '', relationship: '', tone: '细腻、自然、剧情向', pace: '慢热，靠事件逐步递进', boundaries: '不替用户决定言行、心理与关键选择' }
const blankWorldEntry = () => ({ title: '新世界书条目', keywords: [] as string[], content: '', constant: false })
const blankRegex = (): RegexScript => ({
  id: crypto.randomUUID(), scriptName: '新 UI 美化', findRegex: '', replaceString: '', trimStrings: [],
  placement: [1, 2], disabled: false, markdownOnly: false, promptOnly: false, runOnEdit: false,
  substituteRegex: 0, minDepth: null, maxDepth: null,
})

type PendingCopilotImage = { id: string; name: string; dataUrl: string; thumbnailUrl: string }

const readImage = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error(`读取“${file.name}”失败。`))
  reader.onload = () => {
    const image = new Image()
    image.onerror = () => reject(new Error(`“${file.name}”不是可识别的图片。`))
    image.onload = () => resolve(image)
    image.src = String(reader.result || '')
  }
  reader.readAsDataURL(file)
})

const renderImage = (image: HTMLImageElement, maxSide: number, quality: number) => {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器暂时无法处理这张图片。')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

const prepareCopilotImage = async (file: File): Promise<PendingCopilotImage> => {
  if (!file.type.startsWith('image/')) throw new Error(`“${file.name}”不是图片。`)
  if (file.size > 15 * 1024 * 1024) throw new Error(`“${file.name}”超过 15MB，请先裁小一点。`)
  const image = await readImage(file)
  return {
    id: crypto.randomUUID(), name: file.name,
    dataUrl: renderImage(image, 1600, .86),
    thumbnailUrl: renderImage(image, 420, .78),
  }
}
const loadSaved = (): SavedWorkshop => {
  try { return JSON.parse(localStorage.getItem('weijing.characterWorkshop') || '') as SavedWorkshop } catch { return { brief: initialBrief, result: null } }
}

function TextArea({ label, value, rows = 5, onChange }: { label: string; value: string; rows?: number; onChange: (value: string) => void }) {
  return <label><span>{label}</span><textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

export default function CharacterWorkshop({ channels, defaultChannelId, onBack, onSave, onExport, onAvatar }: {
  channels: ApiChannel[]
  defaultChannelId: string
  onBack: () => void
  onSave: (character: Character) => void
  onExport: (character: Character) => void
  onAvatar: (file: File) => Promise<string>
}) {
  const saved = useRef(loadSaved()).current
  const [brief, setBrief] = useState(saved.brief || initialBrief)
  const [result, setResult] = useState<CharacterWorkshopDraft | null>(saved.result ? { ...saved.result, worldbook: saved.result.worldbook || [], regexScripts: saved.result.regexScripts || [] } : null)
  const [avatar, setAvatar] = useState(saved.avatar || '')
  const [cardImage, setCardImage] = useState('')
  const [channelId, setChannelId] = useState(defaultChannelId || channels[0]?.id || '')
  const [state, setState] = useState<'idle' | 'generating' | 'error'>('idle')
  const [error, setError] = useState('')
  const [pngExporting, setPngExporting] = useState(false)
  const [exportNotice, setExportNotice] = useState('')
  const [copilotMessages, setCopilotMessages] = useState<WorkshopCopilotMessage[]>(saved.copilotMessages || [])
  const [copilotMemory, setCopilotMemory] = useState(saved.copilotMemory || '')
  const [pendingCopilotPatch, setPendingCopilotPatch] = useState<WorkshopCopilotPatch | null>(saved.pendingCopilotPatch || null)
  const [copilotUndoSnapshot, setCopilotUndoSnapshot] = useState<CharacterWorkshopDraft | null>(saved.copilotUndoSnapshot || null)
  const [copilotInput, setCopilotInput] = useState('')
  const [copilotImages, setCopilotImages] = useState<PendingCopilotImage[]>([])
  const [copilotImageBusy, setCopilotImageBusy] = useState(false)
  const [copilotState, setCopilotState] = useState<'idle' | 'thinking' | 'compressing'>('idle')
  const [copilotError, setCopilotError] = useState('')
  const controllerRef = useRef<AbortController | null>(null)
  const copilotControllerRef = useRef<AbortController | null>(null)
  const copilotEndRef = useRef<HTMLDivElement | null>(null)
  const copilotImageInputRef = useRef<HTMLInputElement | null>(null)
  const channel = channels.find((item) => item.id === channelId) || channels[0]

  useEffect(() => {
    try { localStorage.setItem('weijing.characterWorkshop', JSON.stringify({ brief, result, avatar, copilotMessages, copilotMemory, pendingCopilotPatch, copilotUndoSnapshot })) } catch {}
  }, [brief, result, avatar, copilotMessages, copilotMemory, pendingCopilotPatch, copilotUndoSnapshot])

  useEffect(() => { copilotEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [copilotMessages, copilotState])

  const patchBrief = (patch: Partial<CharacterWorkshopBrief>) => setBrief((current) => ({ ...current, ...patch }))
  const patchResult = (patch: Partial<CharacterWorkshopDraft>) => setResult((current) => current ? { ...current, ...patch } : current)

  const generate = async () => {
    if (!brief.concept.trim()) { setError('先告诉我你想做一个什么样的角色。'); setState('error'); return }
    if (!channel?.apiKey.trim() || !channel.modelName.trim()) { setError('当前 API 渠道还没有可用的密钥或模型，请先去 API 设置。'); setState('error'); return }
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState('generating'); setError('')
    let raw = ''
    try {
      await completeChat({
        api: channel,
        messages: [
          { role: 'system', content: '你只输出严格有效的 JSON，不使用 Markdown，不添加解释。' },
          { role: 'user', content: buildCharacterWorkshopPrompt(brief) },
        ],
        temperature: .82,
        topP: .9,
        maxTokens: 12000,
        streaming: false,
        signal: controller.signal,
        onDelta: (delta) => { raw += delta },
      })
      setResult(parseCharacterWorkshopDraft(raw))
      setState('idle')
    } catch (cause) {
      if (controller.signal.aborted) { setState('idle'); return }
      setError(cause instanceof Error ? cause.message : '生成失败，请重试。')
      setState('error')
    }
  }

  const appendCopilotMessage = (role: WorkshopCopilotMessage['role'], content: string, images?: WorkshopCopilotMessage['images']) => {
    const message = { id: crypto.randomUUID(), role, content, ...(images?.length ? { images } : {}) }
    setCopilotMessages((current) => [...current, message])
    return message
  }

  const askCopilot = async (quickRequest?: string) => {
    const typedRequest = (quickRequest ?? copilotInput).trim()
    const request = typedRequest || (copilotImages.length ? '请查看我附上的截图，结合当前工坊草稿和已有正则，指出画面里不对的地方，并给出可以写入工坊的修正方案。' : '')
    if (!request || copilotState !== 'idle' || copilotImageBusy) return
    if (!channel?.apiKey.trim() || !channel.modelName.trim()) { setCopilotError('当前 API 渠道还没有可用的密钥或模型，请先去 API 设置。'); return }
    const draft = result || createEmptyCharacterWorkshopDraft()
    copilotControllerRef.current?.abort()
    const controller = new AbortController()
    copilotControllerRef.current = controller
    const history = copilotMessages
    const images = copilotImages
    const displayImages = images.map(({ id, name, thumbnailUrl }) => ({ id, name, dataUrl: thumbnailUrl }))
    const userMessage = appendCopilotMessage('user', request, displayImages)
    setCopilotInput(''); setCopilotImages([]); setCopilotError(''); setCopilotState('thinking')
    let raw = ''
    try {
      const prompt = buildWorkshopCopilotPrompt({ draft, request, messages: history, memory: copilotMemory, pendingPatch: pendingCopilotPatch })
      const content: ChatApiContentPart[] = [
        { type: 'text', text: prompt },
        ...images.map((image): ChatApiContentPart => ({ type: 'image_url', image_url: { url: image.dataUrl, detail: 'high' } })),
      ]
      await completeChat({
        api: channel,
        messages: [
          { role: 'system', content: '你是可持续对话的角色卡工坊助手。严格按用户提示输出单个 JSON 对象，不要 Markdown。' },
          { role: 'user', content },
        ],
        temperature: .66, topP: .9, maxTokens: 16000, streaming: false, signal: controller.signal,
        onDelta: (delta) => { raw += delta },
      })
      const response = parseWorkshopCopilotResponse(raw)
      appendCopilotMessage('assistant', response.reply)
      if (response.patch) setPendingCopilotPatch(response.patch)
      setCopilotState('idle')
    } catch (cause) {
      setCopilotMessages((current) => current.filter((message) => message.id !== userMessage.id))
      setCopilotInput(typedRequest)
      setCopilotImages(images)
      if (controller.signal.aborted) { setCopilotState('idle'); return }
      setCopilotError(cause instanceof Error ? cause.message : '工坊助手暂时没接住，请重试。')
      setCopilotState('idle')
    }
  }

  const compressCopilotContext = async () => {
    if (copilotState !== 'idle' || copilotMessages.length < 6) { setCopilotError('至少聊满 6 条消息后再压缩，短对话不用压。'); return }
    if (!channel?.apiKey.trim() || !channel.modelName.trim()) { setCopilotError('当前 API 渠道还没有可用的密钥或模型。'); return }
    const keep = copilotMessages.slice(-4)
    const compress = copilotMessages.slice(0, -4)
    const controller = new AbortController()
    copilotControllerRef.current = controller
    setCopilotError(''); setCopilotState('compressing')
    let raw = ''
    try {
      await completeChat({
        api: channel,
        messages: [
          { role: 'system', content: '你只输出忠实、精简的中文长期记忆摘要，不添加解释。' },
          { role: 'user', content: buildWorkshopCopilotCompressionPrompt(compress, copilotMemory) },
        ],
        temperature: .2, topP: .8, maxTokens: 3000, streaming: false, signal: controller.signal,
        onDelta: (delta) => { raw += delta },
      })
      const memory = raw.trim().replace(/^```\w*\s*/i, '').replace(/\s*```$/i, '')
      if (!memory) throw new Error('模型没有返回摘要。')
      setCopilotMemory(memory)
      setCopilotMessages(keep.map(({ images: _images, ...message }) => message))
      setCopilotState('idle')
    } catch (cause) {
      if (controller.signal.aborted) { setCopilotState('idle'); return }
      setCopilotError(cause instanceof Error ? cause.message : '压缩失败，请重试。')
      setCopilotState('idle')
    }
  }

  const applyCopilotProposal = () => {
    if (!pendingCopilotPatch) return
    const before = result || createEmptyCharacterWorkshopDraft()
    setCopilotUndoSnapshot(before)
    setResult(applyWorkshopCopilotPatch(before, pendingCopilotPatch))
    setPendingCopilotPatch(null)
    appendCopilotMessage('assistant', '已经按你确认的方案写进工坊草稿了。之后还想换颜色、改气泡或调整规则，继续在这里告诉我就行。')
  }

  const undoCopilotApply = () => {
    if (!copilotUndoSnapshot) return
    setResult(copilotUndoSnapshot)
    setCopilotUndoSnapshot(null)
    appendCopilotMessage('assistant', '刚才那次写入已经撤销，工坊恢复到修改前。')
  }

  const clearCopilotConversation = () => {
    copilotControllerRef.current?.abort()
    setCopilotMessages([]); setCopilotMemory(''); setPendingCopilotPatch(null); setCopilotUndoSnapshot(null)
    setCopilotInput(''); setCopilotImages([]); setCopilotError(''); setCopilotState('idle')
  }

  const addCopilotImages = async (files: FileList | null) => {
    if (!files?.length || copilotImageBusy) return
    const room = 3 - copilotImages.length
    if (room <= 0) { setCopilotError('一次最多附 3 张截图，先删掉一张再选。'); return }
    setCopilotImageBusy(true); setCopilotError('')
    try {
      const selected = Array.from(files).slice(0, room)
      const prepared = await Promise.all(selected.map(prepareCopilotImage))
      setCopilotImages((current) => [...current, ...prepared].slice(0, 3))
      if (files.length > room) setCopilotError(`一次最多附 3 张截图，已保留前 ${room} 张。`)
    } catch (cause) {
      setCopilotError(cause instanceof Error ? cause.message : '图片处理失败，请换一张再试。')
    } finally {
      setCopilotImageBusy(false)
      if (copilotImageInputRef.current) copilotImageInputRef.current.value = ''
    }
  }

  const makeCharacter = () => result ? characterFromWorkshopDraft(result, avatar) : null
  const exportPng = async () => {
    const character = makeCharacter()
    const imageSource = cardImage || avatar
    if (!character || !imageSource) { setError('先点右侧头像位置，上传一张角色立绘。'); return }
    setPngExporting(true); setError(''); setExportNotice('')
    try {
      const blob = await createCharacterCardPng(character, imageSource)
      const filename = `${character.name || '角色卡'}-CardV3.png`.replace(/[\\/:*?"<>|]/g, '_')
      const file = new File([blob], filename, { type: 'image/png' })
      const verified = await importCharacterCard(file)
      if (verified.name !== character.name || (verified.characterBook?.entries.length || 0) !== (character.characterBook?.entries.length || 0)) throw new Error('导出自检未通过，请不要使用这张 PNG')
      const shareData = { files: [file], title: `${character.name} · Card V3` }
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        try {
          await navigator.share(shareData)
          setExportNotice('角色卡已通过自检。iPhone 请在分享面板选择“存储到文件”，不要“存储图像”到相册。')
          return
        } catch (cause) {
          if (cause instanceof DOMException && cause.name === 'AbortError') { setExportNotice('已取消分享，角色卡没有损坏。再次点击即可重新导出。'); return }
        }
      }
      const url = URL.createObjectURL(file)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename
      document.body.append(anchor); anchor.click(); anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 4000)
      setExportNotice('角色卡已通过自检并下载。请从“文件/下载项”导入，不要转存到照片 App。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '带元数据 PNG 导出失败。')
    } finally { setPngExporting(false) }
  }
  const clear = () => {
    controllerRef.current?.abort()
    copilotControllerRef.current?.abort()
    setBrief(initialBrief); setResult(null); setAvatar(''); setCardImage(''); setError(''); setExportNotice(''); setState('idle')
    setCopilotMessages([]); setCopilotMemory(''); setPendingCopilotPatch(null); setCopilotUndoSnapshot(null); setCopilotInput(''); setCopilotError(''); setCopilotState('idle')
    localStorage.removeItem('weijing.characterWorkshop')
  }

  return <div className="workshop-page">
    <header className="page-header"><button className="icon-button" onClick={onBack}>‹</button><h1>AI 角色卡工坊</h1><div className="header-action"><button className="text-button" onClick={clear}>清空</button></div></header>
    <section className="workshop-stack">
      <div className="workshop-intro"><span>✦</span><div><strong>把脑洞交给我</strong><p>生成完整 Card V3，结果先进入草稿，不会覆盖角色库里的任何卡。</p></div></div>
      <div className="workshop-card brief-card">
        <label><span>一句话讲讲这个角色 *</span><textarea rows={5} value={brief.concept} onChange={(event) => patchBrief({ concept: event.target.value })} placeholder="例如：国外认识的年下珠宝设计师，表面小奶狗，实际很会以退为进；有自己的品牌和人生目标……" /></label>
        <div className="workshop-two"><label><span>指定姓名</span><input value={brief.name} onChange={(event) => patchBrief({ name: event.target.value })} placeholder="留空让 AI 取名" /></label><label><span>与用户的关系</span><input value={brief.relationship} onChange={(event) => patchBrief({ relationship: event.target.value })} placeholder="旧识、宿敌、契约婚姻…" /></label></div>
        <details><summary>细化风格与边界</summary><TextArea label="文风与气质" rows={3} value={brief.tone} onChange={(tone) => patchBrief({ tone })} /><TextArea label="感情节奏" rows={3} value={brief.pace} onChange={(pace) => patchBrief({ pace })} /><TextArea label="绝对边界" rows={3} value={brief.boundaries} onChange={(boundaries) => patchBrief({ boundaries })} /></details>
        <label><span>生成所用渠道</span><select value={channelId} onChange={(event) => setChannelId(event.target.value)}>{channels.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.modelName || '未选模型'}</option>)}</select></label>
        {error && <div className="workshop-error">{error}</div>}
        <button className="workshop-generate" disabled={state === 'generating'} onClick={generate}>{state === 'generating' ? '正在认真捏人…' : result ? '重新生成整张卡' : '✦ 生成角色卡'}</button>
        {state === 'generating' && <button className="workshop-stop" onClick={() => controllerRef.current?.abort()}>停止生成</button>}
      </div>

      <div className="workshop-card workshop-copilot">
        <div className="copilot-heading">
          <div className="copilot-avatar">✦</div>
          <div><strong>AI 工坊助手</strong><small>持续对话 · 可操作整张草稿</small></div>
          <div className="copilot-live"><i />{channel?.modelName || '未选择模型'}</div>
        </div>
        <div className="copilot-toolbar">
          <button disabled={copilotState !== 'idle' || copilotMessages.length < 6} onClick={compressCopilotContext}>{copilotState === 'compressing' ? '压缩中…' : '压缩上下文'}</button>
          <button disabled={!copilotMessages.length && !copilotMemory && !pendingCopilotPatch} onClick={clearCopilotConversation}>清空会话</button>
        </div>
        {copilotMemory && <details className="copilot-memory"><summary>已压缩的长期记忆</summary><p>{copilotMemory}</p></details>}
        <div className="copilot-quick">
          {['帮我设计开场栏美化', '检查并修好现有正则', '把消息气泡换一种风格', '陪我继续调整整张卡'].map((request) => <button key={request} disabled={copilotState !== 'idle'} onClick={() => askCopilot(request)}>{request}</button>)}
        </div>
        <div className="copilot-chat" aria-live="polite">
          {copilotMessages.length === 0 && <div className="copilot-welcome"><strong>你可以像聊天一样慢慢说。</strong><p>比如“状态栏想要冷灰玻璃感，先别动气泡”“这个正则为什么没生效”“把现有开场栏改成可折叠”。我会读当前草稿，和你讨论，再把确认的方案写进去。</p></div>}
          {copilotMessages.map((message) => <div key={message.id} className={`copilot-message ${message.role}`}>
            <span>{message.role === 'user' ? '你' : '工坊助手'}</span>
            {!!message.images?.length && <div className="copilot-message-images">{message.images.map((image) => <img key={image.id} src={image.dataUrl} alt={image.name || '用户截图'} />)}</div>}
            <p>{message.content}</p>
          </div>)}
          {copilotState === 'thinking' && <div className="copilot-message assistant thinking"><span>工坊助手</span><p>正在查看草稿和已有正则<span className="copilot-dots">•••</span></p></div>}
          <div ref={copilotEndRef} />
        </div>
        {pendingCopilotPatch && <div className="copilot-proposal">
          <div><small>待确认改动</small><strong>{pendingCopilotPatch.summary}</strong></div>
          <ul>{describeWorkshopCopilotPatch(pendingCopilotPatch).map((item) => <li key={item}>{item}</li>)}</ul>
          <p>你可以继续聊天让它调整这份方案，满意后再写入。</p>
          <div><button onClick={() => setPendingCopilotPatch(null)}>放弃</button><button className="primary" onClick={applyCopilotProposal}>写入整个工坊</button></div>
        </div>}
        {copilotUndoSnapshot && <div className="copilot-undo"><span>上一次改动已写入草稿</span><button onClick={undoCopilotApply}>撤销这次写入</button></div>}
        {copilotError && <div className="workshop-error">{copilotError}</div>}
        {!!copilotImages.length && <div className="copilot-image-preview">
          {copilotImages.map((image) => <div key={image.id}><img src={image.thumbnailUrl} alt={image.name} /><button type="button" aria-label={`移除 ${image.name}`} onClick={() => setCopilotImages((current) => current.filter((item) => item.id !== image.id))}>×</button></div>)}
        </div>}
        <div className="copilot-composer">
          <div className="copilot-input-wrap">
            <textarea rows={3} value={copilotInput} disabled={copilotState !== 'idle'} onChange={(event) => setCopilotInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void askCopilot() } }} placeholder={result ? '说说哪里不满意，也可以附截图让它直接看…' : '先聊角色构想，或附参考图从零开始建立草稿…'} />
            <input ref={copilotImageInputRef} className="copilot-image-input" type="file" accept="image/*" multiple onChange={(event) => void addCopilotImages(event.currentTarget.files)} />
          </div>
          <div className="copilot-actions">
            <button type="button" className="copilot-image-button" disabled={copilotState !== 'idle' || copilotImageBusy || copilotImages.length >= 3} onClick={() => copilotImageInputRef.current?.click()}>{copilotImageBusy ? '处理中' : '＋ 图片'}</button>
            {copilotState === 'thinking' ? <button className="copilot-send stop" onClick={() => copilotControllerRef.current?.abort()}>停止</button> : <button className="copilot-send" disabled={copilotImageBusy || (!copilotInput.trim() && !copilotImages.length)} onClick={() => askCopilot()}>发送</button>}
          </div>
        </div>
        <div className="copilot-hint">可同时发送文字与最多 3 张截图。助手只提交改动提案；必须由你点“写入整个工坊”才会真的修改。压缩上下文后仅保留截图结论，不保留旧图片。</div>
      </div>

      {result && <>
        <div className="workshop-result-heading"><div><small>CHARACTER CARD 3.0</small><h2>{result.name}</h2><p>{result.tagline}</p></div><label className="workshop-avatar">{avatar ? <img src={avatar} alt="" /> : <span>＋立绘</span>}<input type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (file) { setCardImage(await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(new Error('读取立绘失败')); reader.readAsDataURL(file) })); setAvatar(await onAvatar(file)) } event.currentTarget.value = '' }} /></label></div>
        <div className="workshop-card result-card">
          <div className="workshop-two"><label><span>姓名</span><input value={result.name} onChange={(event) => patchResult({ name: event.target.value })} /></label><label><span>标签</span><input value={result.tags.join('，')} onChange={(event) => patchResult({ tags: event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) })} /></label></div>
          <label><span>一句话简介</span><input value={result.tagline} onChange={(event) => patchResult({ tagline: event.target.value })} /></label>
          <TextArea label="角色描述" rows={10} value={result.description} onChange={(description) => patchResult({ description })} />
          <TextArea label="性格与行为逻辑" rows={8} value={result.personality} onChange={(personality) => patchResult({ personality })} />
          <TextArea label="场景与初始关系" rows={7} value={result.scenario} onChange={(scenario) => patchResult({ scenario })} />
          <TextArea label="开场白" rows={10} value={result.greeting} onChange={(greeting) => patchResult({ greeting })} />
          <details><summary>高级提示词与示例对话</summary><TextArea label="系统提示词" rows={10} value={result.systemPrompt} onChange={(systemPrompt) => patchResult({ systemPrompt })} /><TextArea label="历史后置指令" rows={8} value={result.postHistoryInstructions} onChange={(postHistoryInstructions) => patchResult({ postHistoryInstructions })} /><TextArea label="示例对话" rows={8} value={result.mesExample} onChange={(mesExample) => patchResult({ mesExample })} /><TextArea label="作者说明" rows={6} value={result.creatorNotes} onChange={(creatorNotes) => patchResult({ creatorNotes })} /></details>
        </div>
        <div className="workshop-card worldbook-preview">
          <div className="workshop-section-heading"><div><strong>世界书小项目</strong><small>{result.worldbook.length} 条 · 可自行添加、删除和逐条编辑</small></div><button onClick={() => patchResult({ worldbook: [...result.worldbook, blankWorldEntry()] })}>＋ 添加</button></div>
          {result.worldbook.length === 0 && <div className="workshop-empty">还没有世界书，点右上角添加一条。</div>}
          {result.worldbook.map((entry, index) => <details key={index}><summary>{entry.title || `条目 ${index + 1}`}</summary><label><span>标题</span><input value={entry.title} onChange={(event) => patchResult({ worldbook: result.worldbook.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) })} /></label><label><span>关键词</span><input value={entry.keywords.join('，')} onChange={(event) => patchResult({ worldbook: result.worldbook.map((item, itemIndex) => itemIndex === index ? { ...item, keywords: event.target.value.split(/[,，]/).map((value) => value.trim()).filter(Boolean) } : item) })} /></label><TextArea label="正文" value={entry.content} onChange={(content) => patchResult({ worldbook: result.worldbook.map((item, itemIndex) => itemIndex === index ? { ...item, content } : item) })} /><label className="workshop-check"><input type="checkbox" checked={entry.constant === true} onChange={(event) => patchResult({ worldbook: result.worldbook.map((item, itemIndex) => itemIndex === index ? { ...item, constant: event.target.checked } : item) })} /><span>常驻（无需关键词也会发送给模型）</span></label><button className="workshop-delete" onClick={() => patchResult({ worldbook: result.worldbook.filter((_, itemIndex) => itemIndex !== index) })}>删除这条世界书</button></details>)}
        </div>
        <div className="workshop-card worldbook-preview">
          <div className="workshop-section-heading"><div><strong>正则与 UI 美化</strong><small>{result.regexScripts.length} 条 · 可粘贴 HTML/CSS 替换模板</small></div><button onClick={() => patchResult({ regexScripts: [...result.regexScripts, blankRegex()] })}>＋ 添加</button></div>
          {result.regexScripts.length === 0 && <div className="workshop-empty">普通角色卡不必填写；需要状态栏、消息框等美化时再添加。</div>}
          {result.regexScripts.map((script, index) => <details key={script.id}><summary>{script.scriptName || `UI 美化 ${index + 1}`}</summary><label><span>名称</span><input value={script.scriptName} onChange={(event) => patchResult({ regexScripts: result.regexScripts.map((item) => item.id === script.id ? { ...item, scriptName: event.target.value } : item) })} /></label><TextArea label="查找正则" rows={4} value={script.findRegex} onChange={(findRegex) => patchResult({ regexScripts: result.regexScripts.map((item) => item.id === script.id ? { ...item, findRegex } : item) })} /><TextArea label="替换内容（支持 HTML/CSS）" rows={8} value={script.replaceString} onChange={(replaceString) => patchResult({ regexScripts: result.regexScripts.map((item) => item.id === script.id ? { ...item, replaceString } : item) })} /><label className="workshop-check"><input type="checkbox" checked={!script.disabled} onChange={(event) => patchResult({ regexScripts: result.regexScripts.map((item) => item.id === script.id ? { ...item, disabled: !event.target.checked } : item) })} /><span>启用这条美化</span></label><button className="workshop-delete" onClick={() => patchResult({ regexScripts: result.regexScripts.filter((item) => item.id !== script.id) })}>删除这条美化</button></details>)}
        </div>
        <div className="workshop-export-block"><div className="workshop-actions"><button onClick={() => { const character = makeCharacter(); if (character) onExport(character) }}>导出 V3 JSON</button><button disabled={!avatar || pngExporting} onClick={exportPng}>{pngExporting ? '正在生成并自检…' : avatar ? '导出／分享元数据 PNG' : '上传立绘后导出 PNG'}</button><button className="primary" onClick={() => { const character = makeCharacter(); if (character) onSave(character) }}>加入角色库</button></div>{exportNotice && <div className="workshop-export-notice">✓ {exportNotice}</div>}<div className="workshop-export-tip">iPhone：请选择“存储到文件”，再从文件 App 导入。存进相册会被系统洗掉角色卡元数据。</div></div>
      </>}
    </section>
  </div>
}
