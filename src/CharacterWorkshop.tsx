import { useEffect, useRef, useState } from 'react'
import { completeChat } from './chatApi'
import type { ApiChannel } from './apiChannels'
import { createCharacterCardPng, type Character } from './characterCard'
import { buildCharacterWorkshopPrompt, characterFromWorkshopDraft, parseCharacterWorkshopDraft, type CharacterWorkshopBrief, type CharacterWorkshopDraft } from './characterWorkshop'
import './character-workshop.css'

type SavedWorkshop = { brief: CharacterWorkshopBrief; result: CharacterWorkshopDraft | null; avatar?: string }

const initialBrief: CharacterWorkshopBrief = { concept: '', name: '', relationship: '', tone: '细腻、自然、剧情向', pace: '慢热，靠事件逐步递进', boundaries: '不替用户决定言行、心理与关键选择' }
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
  const [result, setResult] = useState<CharacterWorkshopDraft | null>(saved.result || null)
  const [avatar, setAvatar] = useState(saved.avatar || '')
  const [cardImage, setCardImage] = useState('')
  const [channelId, setChannelId] = useState(defaultChannelId || channels[0]?.id || '')
  const [state, setState] = useState<'idle' | 'generating' | 'error'>('idle')
  const [error, setError] = useState('')
  const [pngExporting, setPngExporting] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const channel = channels.find((item) => item.id === channelId) || channels[0]

  useEffect(() => {
    try { localStorage.setItem('weijing.characterWorkshop', JSON.stringify({ brief, result, avatar })) } catch {}
  }, [brief, result, avatar])

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

  const makeCharacter = () => result ? characterFromWorkshopDraft(result, avatar) : null
  const exportPng = async () => {
    const character = makeCharacter()
    const imageSource = cardImage || avatar
    if (!character || !imageSource) { setError('先点右侧头像位置，上传一张角色立绘。'); return }
    setPngExporting(true); setError('')
    try {
      const blob = await createCharacterCardPng(character, imageSource)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${character.name || '角色卡'}-CardV3.png`.replace(/[\\/:*?"<>|]/g, '_')
      document.body.append(anchor); anchor.click(); anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1200)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '带元数据 PNG 导出失败。')
    } finally { setPngExporting(false) }
  }
  const clear = () => {
    controllerRef.current?.abort()
    setBrief(initialBrief); setResult(null); setAvatar(''); setCardImage(''); setError(''); setState('idle')
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
        <div className="workshop-card worldbook-preview"><div><strong>自动世界书</strong><small>{result.worldbook.length} 条 · 加入角色库后仍可逐条编辑</small></div>{result.worldbook.map((entry, index) => <details key={`${entry.title}-${index}`}><summary>{entry.title}</summary><label><span>关键词</span><input value={entry.keywords.join('，')} onChange={(event) => patchResult({ worldbook: result.worldbook.map((item, itemIndex) => itemIndex === index ? { ...item, keywords: event.target.value.split(/[,，]/).map((value) => value.trim()).filter(Boolean) } : item) })} /></label><TextArea label="正文" value={entry.content} onChange={(content) => patchResult({ worldbook: result.worldbook.map((item, itemIndex) => itemIndex === index ? { ...item, content } : item) })} /></details>)}</div>
        <div className="workshop-actions"><button onClick={() => { const character = makeCharacter(); if (character) onExport(character) }}>导出 V3 JSON</button><button disabled={!avatar || pngExporting} onClick={exportPng}>{pngExporting ? '正在写入元数据…' : avatar ? '导出元数据 PNG' : '上传立绘后导出 PNG'}</button><button className="primary" onClick={() => { const character = makeCharacter(); if (character) onSave(character) }}>加入角色库</button></div>
      </>}
    </section>
  </div>
}
