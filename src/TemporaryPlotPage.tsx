import { useState } from 'react'
import { prepareChatImage } from './chatImages'
import { PLOT_IMAGE_LIMIT } from './plotImages'
import { buildPlotImagePrompt, generatePlotImage, type PlotImageGenerationConfig } from './plotImageGeneration'
import type { ApiChannel } from './apiChannels'
import type { Conversation } from './conversationLifecycle'
export type PlotTemplate = { id: string; title: string; text: string; updatedAt: number }

type Plot = NonNullable<Conversation['temporaryPlot']>
export default function TemporaryPlotPage({ plot, onChange, recipients, templates, onTemplatesChange, onBack, imageGeneration, imageChannels, onOpenImageSettings }: { plot?: Plot; onChange: (plot: Plot | undefined) => void; recipients: { id: string; name: string }[]; templates: PlotTemplate[]; onTemplatesChange: (templates: PlotTemplate[]) => void; onBack: () => void; imageGeneration: PlotImageGenerationConfig; imageChannels: ApiChannel[]; onOpenImageSettings: () => void }) {
  const value = plot?.text || ''
  const [defaultMode, setDefaultMode] = useState<Plot['mode']>(plot?.mode || 'once')
  const [defaultUses, setDefaultUses] = useState(plot?.remainingUses || 3)
  const [defaultRecipients, setDefaultRecipients] = useState<string[] | undefined>(plot?.recipientIds)
  const mode = plot?.mode || defaultMode
  const uses = plot?.remainingUses || defaultUses
  const recipientIds = plot ? plot.recipientIds : defaultRecipients
  const changePlot = (patch: Partial<Plot>) => {
    const next = { text: value, mode, remainingUses: uses, recipientIds, images: plot?.images, ...patch, id: crypto.randomUUID() }
    onChange(next.text.trim() || next.images?.length ? next : undefined)
  }
  const images = plot?.images || []
  const [imageBusy, setImageBusy] = useState(false)
  const imageChannel = imageChannels.find((channel) => channel.id === imageGeneration.channelId)
  const generateImage = async () => {
    if (!value.trim()) { setNotice('先写幕后安排，再生成配图。'); return }
    if (!imageChannel) { onOpenImageSettings(); return }
    if (images.length >= PLOT_IMAGE_LIMIT) { setNotice(`最多 ${PLOT_IMAGE_LIMIT} 张配图。`); return }
    setImageBusy(true)
    try {
      const image = await generatePlotImage({ ...imageChannel, modelName: imageGeneration.model.trim() || imageChannel.modelName }, buildPlotImagePrompt(value), imageGeneration.size, `图${images.length + 1}`)
      changePlot({ images: [...images, image] })
      setNotice('配图已生成；发送后会按现有规则附给模型。')
    } catch (error) { setNotice(error instanceof Error ? error.message : '配图生成失败，请检查图片渠道。') }
    finally { setImageBusy(false) }
  }
  const addImages = async (files: FileList | null) => {
    if (!files?.length) return
    setImageBusy(true)
    try {
      const room = Math.max(0, PLOT_IMAGE_LIMIT - images.length)
      const added = []
      for (const file of Array.from(files).slice(0, room)) {
        try { const image = await prepareChatImage(file); added.push({ ...image, name: `图${images.length + added.length + 1}` }) } catch { /* 读不了的跳过 */ }
      }
      if (added.length) changePlot({ images: [...images, ...added] })
      if (files.length > room) setNotice(`最多 ${PLOT_IMAGE_LIMIT} 张，多出来的没加。`)
    } finally { setImageBusy(false) }
  }
  const renameImage = (id: string, name: string) => changePlot({ images: images.map((image) => image.id === id ? { ...image, name: name.slice(0, 20) } : image) })
  const removeImage = (id: string) => { const next = images.filter((image) => image.id !== id); changePlot({ images: next.length ? next : undefined }) }
  const [title, setTitle] = useState('')
  const [notice, setNotice] = useState('')
  const saveTemplate = () => {
    if (!value.trim() || !title.trim()) return
    onTemplatesChange([...templates, { id: crypto.randomUUID(), title: title.trim(), text: value, updatedAt: Date.now() }])
    setTitle(''); setNotice('已加入收藏，其他对话也可选用；只有载入后才会发送。')
  }
  const loadTemplate = (template: PlotTemplate) => {
    if (value.trim() && value !== template.text && !window.confirm('载入这份收藏并替换当前临时剧情？')) return
    changePlot({ text: template.text }); setNotice(`已载入「${template.title}」，可继续修改。`)
  }
  return <section className="story-tools-page">
    <header className="story-tools-header"><button onClick={onBack} aria-label="返回聊天设置">‹</button><h2>临时剧情</h2><span>自动保存</span></header>
    <p>仅本对话生效。只有你 @ 点名且符合下方接收范围的角色收到幕后安排；单人聊天直接发送或续演即可。原文不作为聊天消息显示，不向其他成员提供。</p>
    <label>生效时长<select value={mode} onChange={(event) => { const next = event.target.value as Plot['mode']; setDefaultMode(next); changePlot({ mode: next }) }}><option value="once">仅下一次（默认）</option><option value="counted">持续指定次数</option><option value="persistent">持续到手动结束</option></select></label>
    {mode === 'counted' && <label>剩余成功次数<input type="number" min={1} max={100} value={uses} onChange={(event) => { const next = Math.max(1, Math.min(100, Math.floor(Number(event.target.value) || 1))); setDefaultUses(next); changePlot({ remainingUses: next }) }} /></label>}
    {recipients.length > 1 && <fieldset className="plot-recipients"><legend>私下接收范围</legend><label className="story-tools-check"><input type="checkbox" checked={recipientIds === undefined} onChange={(event) => { const next = event.target.checked ? undefined : []; setDefaultRecipients(next); changePlot({ recipientIds: next }) }} />本次 @ 谁就给谁</label>{recipients.map((recipient) => <label className="story-tools-check" key={recipient.id}><input type="checkbox" checked={recipientIds?.includes(recipient.id) || false} onChange={(event) => { const next = event.target.checked ? [...recipientIds || [], recipient.id] : (recipientIds || []).filter((id) => id !== recipient.id); setDefaultRecipients(next); changePlot({ recipientIds: next }) }} />允许 {recipient.name}（仍需 @）</label>)}{recipientIds?.length === 0 && <p>尚未选择接收者：这份安排暂时不会发送给任何角色。</p>}</fieldset>}
    <label>幕后安排<textarea rows={12} value={value} onChange={(event) => changePlot({ text: event.target.value })} placeholder="例如：让他接到一通紧急电话；或这场保持缓慢对峙，不急着和解……" /></label>
    <article className="story-tools-card"><h3>幕后配图（{images.length}/{PLOT_IMAGE_LIMIT}）</h3>
      <p>给每张图起个名字，在安排里写怎么用，例如「让他发一条热搜，配上 热搜截图」。他会看图，在正文合适的位置贴出来；用过的图自动移走。每张图约多上千 token，持续模式下没用掉的图每轮都会带上。</p>
      {images.length > 0 && <div className="plot-images">{images.map((image) => <div className="plot-image-row" key={image.id}><img src={image.dataUrl} alt="" /><input value={image.name} onChange={(event) => renameImage(image.id, event.target.value)} aria-label="配图名字" placeholder="名字，比如 热搜截图" /><button type="button" className="secondary-button" onClick={() => removeImage(image.id)}>删除</button></div>)}</div>}
      <div className="story-tools-actions"><button type="button" className="secondary-button" disabled={imageBusy || images.length >= PLOT_IMAGE_LIMIT} onClick={() => void generateImage()}>{imageBusy ? '生成中…' : '配图'}</button>{images.length < PLOT_IMAGE_LIMIT && <label className="secondary-button">添加图片<input type="file" multiple hidden disabled={imageBusy} onChange={(event) => { void addImages(event.target.files); event.target.value = '' }} /></label>}<button type="button" className="text-button" onClick={onOpenImageSettings}>图片接口设置</button></div>
      {images.length > 0 && !value.trim() && <p>先写幕后安排，图才会随安排一起发出。</p>}
    </article>
    <div className="story-tools-actions"><button disabled={!value && !images.length} onClick={() => onChange(undefined)}>清空 / 结束</button></div>
    <p>{mode === 'persistent' ? '成功回复后仍保留，直到你手动结束。' : mode === 'counted' ? '确认安排落实后扣一次；一次 @ 多位接收者也只扣一次。用完自动结束。' : '确认安排落实后清空。'}失败或停止时不消耗；生成期间的新修改留给下一次。持续方向不会要求重复已经发生的事件。</p>
    {mode !== 'persistent' && <p>回复完成后会用当前渠道额外做一次简短检查；若明确未落实，会自动补写一次并再次检查；检查本身出错或给不出结论时按已使用处理。只有检查明确判定冲突时才保留安排并提示，提示里可一键结束。检查内容不会放进聊天正文。</p>}
    <article className="story-tools-card"><h3>收藏当前安排</h3><label>收藏名称<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="突发来电、配角入场……" /></label><button className="secondary-button" disabled={!title.trim() || !value.trim()} onClick={saveTemplate}>保存到剧情收藏</button></article>
    <h3>剧情收藏（{templates.length}）</h3>
    {templates.map((template) => <article className="story-tools-card" key={template.id}><strong>{template.title}</strong><p className="story-tools-excerpt">{template.text.slice(0, 160)}{template.text.length > 160 ? '…' : ''}</p><div className="story-tools-actions"><button onClick={() => loadTemplate(template)}>载入并修改</button><button onClick={() => { if (window.confirm(`删除收藏「${template.title}」？当前临时剧情不受影响。`)) onTemplatesChange(templates.filter((item) => item.id !== template.id)) }}>删除收藏</button></div></article>)}
    {!templates.length && <p>还没有收藏。载入收藏不会自动发送，也不会自动 @ 角色。</p>}
    {notice && <p role="status">{notice}</p>}
  </section>
}
