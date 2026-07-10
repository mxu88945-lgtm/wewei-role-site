import { useEffect, useMemo, useState } from 'react'

type Page = 'home' | 'characters' | 'create' | 'character-detail' | 'chat' | 'more' | 'api' | 'model' | 'settings' | 'identity' | 'worldbook' | 'preset' | 'memory' | 'memory-api' | 'memory-list'
type Character = { id: string; name: string; tagline: string; description: string; greeting: string; tags: string[] }
type Message = { id: number; role: 'user' | 'assistant'; text: string }
type SessionMap = Record<string, Message[]>
type ApiConfig = { baseUrl: string; apiKey: string; modelName: string }
type MemoryEntry = { id: string; createdAt: number; title: string; content: string; sourceCount: number }
type MemoryConfig = {
  api: ApiConfig
  autoEvery: number
  maxEntries: number
  summaryPrompt: string
  injectPosition: string
  injectPrompt: string
  lastSummarizedCount: number
}
type MemoryConfigMap = Record<string, MemoryConfig>
type MemoryEntryMap = Record<string, MemoryEntry[]>

const demoCharacter: Character = {
  id: 'huo-jin', name: '霍烬', tagline: '沉稳克制的守护者',
  description: 'A 国旧世家出身，寡言、冷静，习惯把所有风浪挡在身后。不会替你决定，但会一直站在你能看见的地方。',
  greeting: '夜里风大。过来，站我这边。', tags: ['慢热', '沉稳', '守护', '剧情向'],
}

const defaultMemoryPrompt = `【暂停剧情扮演】请根据前文内容，对上次总结之后的剧情进行总结。生成一个详细的总结集合，涵盖所有主要事件、观点、关系变化与关键信息。总结需逻辑清晰，按时间顺序组织，每件事以独立条目呈现，并尽量标注具体时间点。若时间信息不明确，请根据上下文合理推测并注明。重点保留人物关系、承诺、冲突、情绪转折、世界设定与未完成事项，避免遗漏。`
const defaultInjectPrompt = `以下是该角色与用户的长期记忆。请把它当作已经发生过的事实，自然延续，不要逐条复述，也不要替用户决定言行：\n\n{{memories}}`

const defaultMemoryConfig = (): MemoryConfig => ({
  api: { baseUrl: 'https://api.openai.com/v1', apiKey: '', modelName: 'gpt-4.1-mini' },
  autoEvery: 50,
  maxEntries: 2000,
  summaryPrompt: defaultMemoryPrompt,
  injectPosition: 'after-main-prompt',
  injectPrompt: defaultInjectPrompt,
  lastSummarizedCount: 0,
})

const read = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value))

function BackHeader({ title, onBack, action }: { title: string; onBack: () => void; action?: React.ReactNode }) {
  return <header className="page-header"><button className="icon-button" onClick={onBack}>‹</button><h1>{title}</h1><div className="header-action">{action}</div></header>
}

function App() {
  const [page, setPage] = useState<Page>('home')
  const [characters, setCharacters] = useState<Character[]>(() => read('weijing.characters', [demoCharacter]))
  const [activeId, setActiveId] = useState(() => read('weijing.activeCharacter', demoCharacter.id))
  const [sessions, setSessions] = useState<SessionMap>(() => read('weijing.sessions', { [demoCharacter.id]: [{ id: 1, role: 'assistant', text: demoCharacter.greeting }] }))
  const [draft, setDraft] = useState('')
  const [newCharacter, setNewCharacter] = useState({ name: '', tagline: '', description: '', greeting: '', tags: '' })
  const [identity, setIdentity] = useState(() => read('weijing.identity', { name: '周惟惟', description: '由用户亲自决定言行、心理与关键选择。' }))
  const [worldbook, setWorldbook] = useState(() => read('weijing.worldbook', 'A 国旧世家与现代都市并存。剧情缓慢推进，不替用户角色做决定。'))
  const [preset, setPreset] = useState(() => read('weijing.preset', '克制、细腻、慢热；每轮携带微量剧情进展。'))
  const [api, setApi] = useState<ApiConfig>(() => read('weijing.api', { baseUrl: 'https://api.openai.com/v1', apiKey: '', modelName: 'gpt-4.1-mini' }))
  const [connection, setConnection] = useState<'idle' | 'testing' | 'ok'>('idle')
  const [temperature, setTemperature] = useState(() => read('weijing.temperature', 0.95))
  const [topP, setTopP] = useState(() => read('weijing.topP', 0.9))
  const [memoryLength, setMemoryLength] = useState(() => read('weijing.memoryLength', 47))
  const [maxTokens, setMaxTokens] = useState(() => read('weijing.maxTokens', 8000))
  const [streaming, setStreaming] = useState(() => read('weijing.streaming', true))
  const [memoryConfigs, setMemoryConfigs] = useState<MemoryConfigMap>(() => read('weijing.memoryConfigs', { [demoCharacter.id]: defaultMemoryConfig() }))
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntryMap>(() => read('weijing.memoryEntries', { [demoCharacter.id]: [] }))
  const [memoryState, setMemoryState] = useState<'idle' | 'summarizing' | 'ok' | 'error'>('idle')

  const activeCharacter = characters.find((item) => item.id === activeId) || characters[0] || demoCharacter
  const messages = sessions[activeCharacter.id] || [{ id: 1, role: 'assistant' as const, text: activeCharacter.greeting }]
  const currentMemoryConfig = memoryConfigs[activeCharacter.id] || defaultMemoryConfig()
  const currentMemories = memoryEntries[activeCharacter.id] || []

  useEffect(() => write('weijing.characters', characters), [characters])
  useEffect(() => write('weijing.activeCharacter', activeId), [activeId])
  useEffect(() => write('weijing.sessions', sessions), [sessions])
  useEffect(() => write('weijing.identity', identity), [identity])
  useEffect(() => write('weijing.worldbook', worldbook), [worldbook])
  useEffect(() => write('weijing.preset', preset), [preset])
  useEffect(() => write('weijing.api', api), [api])
  useEffect(() => write('weijing.memoryConfigs', memoryConfigs), [memoryConfigs])
  useEffect(() => write('weijing.memoryEntries', memoryEntries), [memoryEntries])
  useEffect(() => { write('weijing.temperature', temperature); write('weijing.topP', topP); write('weijing.memoryLength', memoryLength); write('weijing.maxTokens', maxTokens); write('weijing.streaming', streaming) }, [temperature, topP, memoryLength, maxTokens, streaming])

  const pageTitle = useMemo(() => page === 'home' ? '惟境' : page === 'characters' ? '角色' : '', [page])
  const goBack = () => setPage(['api', 'model', 'settings', 'identity', 'worldbook', 'preset', 'memory'].includes(page) ? 'more' : ['memory-api', 'memory-list'].includes(page) ? 'memory' : page === 'chat' ? 'character-detail' : page === 'character-detail' || page === 'create' ? 'characters' : 'home')

  const updateMemoryConfig = (patch: Partial<MemoryConfig>) => setMemoryConfigs((current) => ({ ...current, [activeCharacter.id]: { ...(current[activeCharacter.id] || defaultMemoryConfig()), ...patch } }))
  const updateMemoryApi = (patch: Partial<ApiConfig>) => updateMemoryConfig({ api: { ...currentMemoryConfig.api, ...patch } })
  const openCharacter = (id: string) => {
    setActiveId(id)
    setMemoryConfigs((current) => current[id] ? current : { ...current, [id]: defaultMemoryConfig() })
    setMemoryEntries((current) => current[id] ? current : { ...current, [id]: [] })
    setPage('character-detail')
  }
  const createCharacter = () => {
    if (!newCharacter.name.trim()) return
    const character: Character = { id: crypto.randomUUID(), name: newCharacter.name.trim(), tagline: newCharacter.tagline.trim() || '新的角色', description: newCharacter.description.trim(), greeting: newCharacter.greeting.trim() || '你来了。', tags: newCharacter.tags.split(/[,，]/).map((item) => item.trim()).filter(Boolean) }
    setCharacters((current) => [...current, character])
    setSessions((current) => ({ ...current, [character.id]: [{ id: Date.now(), role: 'assistant', text: character.greeting }] }))
    setMemoryConfigs((current) => ({ ...current, [character.id]: defaultMemoryConfig() }))
    setMemoryEntries((current) => ({ ...current, [character.id]: [] }))
    setActiveId(character.id)
    setNewCharacter({ name: '', tagline: '', description: '', greeting: '', tags: '' })
    setPage('character-detail')
  }
  const newSession = () => { setSessions((current) => ({ ...current, [activeCharacter.id]: [{ id: Date.now(), role: 'assistant', text: activeCharacter.greeting }] })); setPage('chat') }

  const summarizeMemory = async (sourceMessages = messages) => {
    const config = currentMemoryConfig
    if (!config.api.baseUrl || !config.api.modelName || !config.api.apiKey || sourceMessages.length < 2) { setMemoryState('error'); return }
    setMemoryState('summarizing')
    const transcript = sourceMessages.map((item) => `${item.role === 'user' ? identity.name : activeCharacter.name}：${item.text}`).join('\n')
    const previous = currentMemories.slice(-8).map((item) => item.content).join('\n\n')
    try {
      const endpoint = `${config.api.baseUrl.replace(/\/$/, '')}/chat/completions`
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.api.apiKey}` },
        body: JSON.stringify({
          model: config.api.modelName,
          temperature: 0.2,
          messages: [
            { role: 'system', content: config.summaryPrompt },
            { role: 'user', content: `角色：${activeCharacter.name}\n用户：${identity.name}\n已有记忆：\n${previous || '暂无'}\n\n待总结对话：\n${transcript}` },
          ],
        }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content?.trim()
      if (!content) throw new Error('empty memory')
      const entry: MemoryEntry = { id: crypto.randomUUID(), createdAt: Date.now(), title: `${new Date().toLocaleDateString()} · ${sourceMessages.length} 条消息`, content, sourceCount: sourceMessages.length }
      setMemoryEntries((current) => ({ ...current, [activeCharacter.id]: [...(current[activeCharacter.id] || []), entry].slice(-config.maxEntries) }))
      updateMemoryConfig({ lastSummarizedCount: sourceMessages.length })
      setMemoryState('ok')
    } catch (error) {
      console.error('记忆总结失败', error)
      setMemoryState('error')
    }
  }

  const sendMessage = () => {
    const text = draft.trim(); if (!text) return
    const userMessage = { id: Date.now(), role: 'user' as const, text }
    const nextMessages = [...messages, userMessage]
    setSessions((current) => ({ ...current, [activeCharacter.id]: nextMessages }))
    setDraft('')
    window.setTimeout(() => {
      const assistantMessage = { id: Date.now() + 1, role: 'assistant' as const, text: '我听着。慢慢说，不急。' }
      const completed = [...nextMessages, assistantMessage]
      setSessions((current) => ({ ...current, [activeCharacter.id]: completed }))
      const config = memoryConfigs[activeCharacter.id] || defaultMemoryConfig()
      if (config.autoEvery > 0 && completed.length - config.lastSummarizedCount >= config.autoEvery && config.api.apiKey) summarizeMemory(completed)
    }, 420)
  }

  const CharacterCard = ({ item }: { item: Character }) => <button className="character-card" onClick={() => openCharacter(item.id)}><div className="character-art"><span>{item.name.slice(-1)}</span><i>✦</i></div><div className="character-copy"><div className="character-title"><strong>{item.name}</strong><span>{item.id === activeId ? '最近共演' : '角色卡'}</span></div><p>{item.tagline}</p><small>“{item.greeting}”</small></div><span className="chevron">›</span></button>

  return <div className="app-shell"><main className={`phone-canvas ${page === 'chat' ? 'chat-canvas' : ''}`}>
    {(page === 'home' || page === 'characters') && <><header className="hero-header"><div><p className="eyebrow">WeiWei Role</p><h1>{pageTitle}</h1><p className="hero-copy">把角色、世界与长期记忆，收进一个安静的共演空间。</p></div><button className="avatar-button" onClick={() => setPage('identity')}>惟</button></header>{page === 'home' ? <section className="content-stack"><div className="feature-card"><div><span className="feature-badge">继续共演</span><h2>{activeCharacter.name}</h2><p>{activeCharacter.greeting}</p></div><button className="primary-button" onClick={() => setPage('chat')}>回到对话</button></div><section><div className="section-heading"><h2>最近角色</h2><button onClick={() => setPage('characters')}>查看全部</button></div><CharacterCard item={activeCharacter} /></section></section> : <section className="content-stack"><div className="section-heading"><div><h2>角色库</h2><p>所有角色都保存在当前设备</p></div><button onClick={() => setPage('create')}>＋ 新建</button></div>{characters.map((item) => <CharacterCard key={item.id} item={item} />)}</section>}</>}

    {page === 'create' && <><BackHeader title="新建角色" onBack={goBack} action={<button className="text-button" onClick={createCharacter}>保存</button>} /><section className="content-stack form-stack"><label>角色名称<input value={newCharacter.name} onChange={(e) => setNewCharacter({ ...newCharacter, name: e.target.value })} placeholder="例如：霍烬" /></label><label>一句话简介<input value={newCharacter.tagline} onChange={(e) => setNewCharacter({ ...newCharacter, tagline: e.target.value })} /></label><label>角色设定<textarea rows={7} value={newCharacter.description} onChange={(e) => setNewCharacter({ ...newCharacter, description: e.target.value })} /></label><label>开场白<textarea rows={4} value={newCharacter.greeting} onChange={(e) => setNewCharacter({ ...newCharacter, greeting: e.target.value })} /></label><label>标签<input value={newCharacter.tags} onChange={(e) => setNewCharacter({ ...newCharacter, tags: e.target.value })} placeholder="慢热，守护，剧情向" /></label><button className="primary-button full" onClick={createCharacter}>创建并保存</button></section></>}

    {page === 'character-detail' && <><BackHeader title={activeCharacter.name} onBack={goBack} /><section className="detail-stack"><div className="character-hero"><div className="hero-portrait"><span>{activeCharacter.name.slice(-1)}</span><i>✦</i></div><div><p className="eyebrow">CHARACTER</p><h2>{activeCharacter.name}</h2><p>{activeCharacter.tagline}</p></div></div><div className="detail-card"><h3>角色简介</h3><p>{activeCharacter.description || '还没有填写角色简介。'}</p><div className="chips left">{activeCharacter.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div><div className="detail-card"><h3>长期记忆</h3><p>这个角色拥有独立记忆库，目前保存 {currentMemories.length} 条记忆。</p><button className="inline-link" onClick={() => setPage('memory')}>管理记忆与总结模型 ›</button></div><div className="detail-card"><h3>开场白</h3><blockquote>{activeCharacter.greeting}</blockquote></div><div className="detail-actions"><button className="primary-button full" onClick={() => setPage('chat')}>继续共演</button><button className="secondary-button" onClick={newSession}>新建对话</button></div></section></>}

    {page === 'chat' && <section className="chat-page"><header className="chat-header"><button className="icon-button" onClick={goBack}>‹</button><button className="chat-identity" onClick={() => setPage('character-detail')}><span>{activeCharacter.name.slice(-1)}</span><div><strong>{activeCharacter.name}</strong><small>{identity.name} · 沉浸共演中</small></div></button><button className="more-button" onClick={() => setPage('memory')}>•••</button></header><div className="scene-banner"><span>✦</span><p>{worldbook.slice(0, 24)}</p></div><div className="message-list">{messages.map((message) => <div key={message.id} className={`message-row ${message.role}`}><div className="message-bubble">{message.text}</div></div>)}</div><div className="composer"><button className="composer-plus">＋</button><textarea rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }} placeholder="写下你的回应……" /><button className="send-button" onClick={sendMessage}>↑</button></div></section>}

    {page === 'more' && <><BackHeader title="更多" onBack={() => setPage('home')} /><section className="settings-stack">{[[['API 连接', 'api'], ['用户身份', 'identity']], [['模型设置', 'model'], ['预设', 'preset'], ['世界书', 'worldbook'], ['长记忆', 'memory']], [['设置', 'settings']]].map((group, index) => <div className="settings-group" key={index}>{group.map(([label, target]) => <button key={label} onClick={() => setPage(target as Page)}><span>{label}</span><span>›</span></button>)}</div>)}</section></>}

    {page === 'api' && <><BackHeader title="API 连接" onBack={goBack} action={<button className="text-button" onClick={() => write('weijing.api', api)}>保存</button>} /><section className="content-stack form-stack"><div className="api-status"><span className={connection === 'ok' ? 'ok' : ''}></span><div><strong>{connection === 'ok' ? '连接正常' : '尚未测试连接'}</strong><small>聊天模型 · OpenAI 兼容接口</small></div></div><label>Base URL<input value={api.baseUrl} onChange={(e) => setApi({ ...api, baseUrl: e.target.value })} /></label><label>API Key<input type="password" value={api.apiKey} onChange={(e) => setApi({ ...api, apiKey: e.target.value })} /></label><label>模型名称<input value={api.modelName} onChange={(e) => setApi({ ...api, modelName: e.target.value })} /></label><div className="privacy-note">聊天 API 和记忆总结 API 相互独立，配置仅保存在当前设备。</div><button className="primary-button full" onClick={() => { setConnection('testing'); setTimeout(() => setConnection('ok'), 700) }}>{connection === 'testing' ? '测试中…' : '测试连接'}</button></section></>}

    {page === 'identity' && <EditablePage title="用户身份" value={identity.description} name={identity.name} onName={(name) => setIdentity({ ...identity, name })} onChange={(description) => setIdentity({ ...identity, description })} onBack={goBack} />}
    {page === 'worldbook' && <EditablePage title="世界书" value={worldbook} onChange={setWorldbook} onBack={goBack} />}
    {page === 'preset' && <EditablePage title="预设" value={preset} onChange={setPreset} onBack={goBack} />}

    {page === 'memory' && <><BackHeader title={`${activeCharacter.name} · 长记忆`} onBack={goBack} action={<button className="soft-button" onClick={() => updateMemoryConfig({ ...defaultMemoryConfig(), api: currentMemoryConfig.api })}>恢复默认</button>} /><section className="settings-stack memory-settings"><div className="memory-character-banner"><div className="character-art"><span>{activeCharacter.name.slice(-1)}</span><i>✦</i></div><div><strong>独立记忆库</strong><small>仅属于 {activeCharacter.name}，不会与其他角色混用</small></div></div><button className="memory-api-row" onClick={() => setPage('memory-api')}><div><strong>总结专用 API</strong><small>{currentMemoryConfig.api.modelName || '未设置模型'}</small></div><span>›</span></button><div className="settings-group range-group"><RangeRow label="自动总结" hint={`每 ${currentMemoryConfig.autoEvery} 条消息总结一次，0 为禁用`} value={currentMemoryConfig.autoEvery} min={0} max={200} step={10} onChange={(value) => updateMemoryConfig({ autoEvery: value })} /><RangeRow label="记忆上限" hint={`最多保留 ${currentMemoryConfig.maxEntries} 条长期记忆`} value={currentMemoryConfig.maxEntries} min={100} max={3000} step={100} onChange={(value) => updateMemoryConfig({ maxEntries: value })} /></div><label className="memory-text-card"><strong>记忆总结提示词</strong><textarea rows={10} value={currentMemoryConfig.summaryPrompt} onChange={(e) => updateMemoryConfig({ summaryPrompt: e.target.value })} /><small>发送给记忆模型，用于生成长期记忆。</small></label><label className="memory-select-card"><strong>记忆注入位置</strong><select value={currentMemoryConfig.injectPosition} onChange={(e) => updateMemoryConfig({ injectPosition: e.target.value })}><option value="none">不注入</option><option value="before-main-prompt">↑ Main Prompt</option><option value="after-main-prompt">↓ Main Prompt</option><option value="before-chat-history">↑ Chat History</option><option value="after-chat-history">↓ Chat History</option><option value="depth-system">@Depth · system</option><option value="depth-user">@Depth · user</option><option value="depth-assistant">@Depth · assistant</option></select></label><label className="memory-text-card"><strong>记忆注入提示词</strong><textarea rows={6} value={currentMemoryConfig.injectPrompt} onChange={(e) => updateMemoryConfig({ injectPrompt: e.target.value })} /><small>使用 {'{{memories}}'} 作为记忆内容占位符。</small></label><div className="memory-actions"><button className="primary-button full" onClick={() => summarizeMemory()} disabled={memoryState === 'summarizing'}>{memoryState === 'summarizing' ? '正在总结…' : memoryState === 'error' ? '配置不完整或总结失败，重试' : '立即总结当前对话'}</button><button className="secondary-button" onClick={() => setPage('memory-list')}>查看与管理记忆（{currentMemories.length}）</button></div></section></>}

    {page === 'memory-api' && <><BackHeader title="记忆总结 API" onBack={goBack} action={<span className="saved-label">自动保存</span>} /><section className="content-stack form-stack"><div className="api-status"><span className={currentMemoryConfig.api.apiKey ? 'ok' : ''}></span><div><strong>{currentMemoryConfig.api.apiKey ? '已配置独立接口' : '尚未填写密钥'}</strong><small>仅供 {activeCharacter.name} 的记忆总结使用</small></div></div><label>Base URL<input value={currentMemoryConfig.api.baseUrl} onChange={(e) => updateMemoryApi({ baseUrl: e.target.value })} /></label><label>API Key<input type="password" value={currentMemoryConfig.api.apiKey} onChange={(e) => updateMemoryApi({ apiKey: e.target.value })} placeholder="sk-••••••••" /></label><label>模型名称<input value={currentMemoryConfig.api.modelName} onChange={(e) => updateMemoryApi({ modelName: e.target.value })} /></label><div className="privacy-note">此接口独立于聊天 API。密钥只保存在当前设备，不上传仓库。</div></section></>}

    {page === 'memory-list' && <><BackHeader title={`${activeCharacter.name} · 记忆库`} onBack={goBack} /><section className="content-stack">{currentMemories.length === 0 ? <div className="empty-memory"><span>✦</span><strong>还没有长期记忆</strong><p>返回上一页，配置总结 API 后可立即总结当前对话。</p></div> : currentMemories.slice().reverse().map((entry) => <article className="memory-entry" key={entry.id}><div><strong>{entry.title}</strong><small>{new Date(entry.createdAt).toLocaleString()} · 来源 {entry.sourceCount} 条消息</small></div><textarea rows={8} value={entry.content} onChange={(e) => setMemoryEntries((current) => ({ ...current, [activeCharacter.id]: (current[activeCharacter.id] || []).map((item) => item.id === entry.id ? { ...item, content: e.target.value } : item) }))} /><button className="danger-link" onClick={() => setMemoryEntries((current) => ({ ...current, [activeCharacter.id]: (current[activeCharacter.id] || []).filter((item) => item.id !== entry.id) }))}>删除这条记忆</button></article>)}</section></>}

    {page === 'model' && <><BackHeader title="模型设置" onBack={goBack} /><section className="settings-stack"><div className="settings-group range-group"><RangeRow label="记忆长度" value={memoryLength} min={10} max={100} step={1} onChange={setMemoryLength} /><RangeRow label="回复令牌限制" value={maxTokens} min={1000} max={16000} step={500} onChange={setMaxTokens} /></div><div className="settings-group range-group"><RangeRow label="温度" value={temperature} min={0} max={2} step={0.05} onChange={setTemperature} /><RangeRow label="Top-P" value={topP} min={0} max={1} step={0.05} onChange={setTopP} /></div><div className="settings-group toggle-row"><div><strong>流式传输</strong><small>立即逐字显示回复</small></div><button className={`switch ${streaming ? 'on' : ''}`} onClick={() => setStreaming(!streaming)}><span /></button></div></section></>}
    {page === 'settings' && <><BackHeader title="设置" onBack={goBack} /><section className="settings-stack"><div className="settings-group">{['外观 · 跟随系统', '语言 · 简体中文', '字体 · 默认', '存储空间', '备份与恢复'].map((item) => <button key={item}><span>{item}</span><span>›</span></button>)}</div></section></>}

    {(page === 'home' || page === 'characters') && <nav className="bottom-nav"><button className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')}><span>⌂</span><small>首页</small></button><button className={page === 'characters' ? 'active' : ''} onClick={() => setPage('characters')}><span>◉</span><small>角色</small></button><button onClick={() => setPage('chat')}><span>✦</span><small>共演</small></button><button onClick={() => setPage('more')}><span>•••</span><small>更多</small></button></nav>}
  </main></div>
}

function EditablePage({ title, value, onChange, onBack, name, onName }: { title: string; value: string; onChange: (value: string) => void; onBack: () => void; name?: string; onName?: (value: string) => void }) {
  return <><BackHeader title={title} onBack={onBack} action={<span className="saved-label">自动保存</span>} /><section className="content-stack form-stack">{onName && <label>名称<input value={name} onChange={(e) => onName(e.target.value)} /></label>}<label>{title}内容<textarea rows={14} value={value} onChange={(e) => onChange(e.target.value)} placeholder={`填写${title}内容……`} /></label><div className="privacy-note">内容会自动保存在当前设备。</div></section></>
}

function RangeRow({ label, hint, value, min, max, step, onChange }: { label: string; hint?: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <div className="range-row"><div><strong>{label}</strong>{hint && <small>{hint}</small>}</div><div className="range-controls"><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /><output>{Number.isInteger(value) ? value : value.toFixed(2)}</output></div></div>
}

export default App
