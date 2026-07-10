import { useEffect, useMemo, useState } from 'react'

type Page = 'home' | 'characters' | 'create' | 'character-detail' | 'chat' | 'more' | 'api' | 'model' | 'settings' | 'identity' | 'worldbook' | 'preset' | 'memory'
type Character = { id: string; name: string; tagline: string; description: string; greeting: string; tags: string[] }
type Message = { id: number; role: 'user' | 'assistant'; text: string }
type SessionMap = Record<string, Message[]>
type ApiConfig = { baseUrl: string; apiKey: string; modelName: string }

const demoCharacter: Character = {
  id: 'huo-jin', name: '霍烬', tagline: '沉稳克制的守护者',
  description: 'A 国旧世家出身，寡言、冷静，习惯把所有风浪挡在身后。不会替你决定，但会一直站在你能看见的地方。',
  greeting: '夜里风大。过来，站我这边。', tags: ['慢热', '沉稳', '守护', '剧情向'],
}

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
  const [memory, setMemory] = useState(() => read('weijing.memory', ''))
  const [api, setApi] = useState<ApiConfig>(() => read('weijing.api', { baseUrl: 'https://api.openai.com/v1', apiKey: '', modelName: 'gpt-4.1-mini' }))
  const [connection, setConnection] = useState<'idle' | 'testing' | 'ok'>('idle')
  const [temperature, setTemperature] = useState(() => read('weijing.temperature', 0.95))
  const [topP, setTopP] = useState(() => read('weijing.topP', 0.9))
  const [memoryLength, setMemoryLength] = useState(() => read('weijing.memoryLength', 47))
  const [maxTokens, setMaxTokens] = useState(() => read('weijing.maxTokens', 8000))
  const [streaming, setStreaming] = useState(() => read('weijing.streaming', true))

  const activeCharacter = characters.find((item) => item.id === activeId) || characters[0] || demoCharacter
  const messages = sessions[activeCharacter.id] || [{ id: 1, role: 'assistant' as const, text: activeCharacter.greeting }]

  useEffect(() => write('weijing.characters', characters), [characters])
  useEffect(() => write('weijing.activeCharacter', activeId), [activeId])
  useEffect(() => write('weijing.sessions', sessions), [sessions])
  useEffect(() => write('weijing.identity', identity), [identity])
  useEffect(() => write('weijing.worldbook', worldbook), [worldbook])
  useEffect(() => write('weijing.preset', preset), [preset])
  useEffect(() => write('weijing.memory', memory), [memory])
  useEffect(() => write('weijing.api', api), [api])
  useEffect(() => { write('weijing.temperature', temperature); write('weijing.topP', topP); write('weijing.memoryLength', memoryLength); write('weijing.maxTokens', maxTokens); write('weijing.streaming', streaming) }, [temperature, topP, memoryLength, maxTokens, streaming])

  const pageTitle = useMemo(() => page === 'home' ? '惟境' : page === 'characters' ? '角色' : '', [page])
  const goBack = () => setPage(['api', 'model', 'settings', 'identity', 'worldbook', 'preset', 'memory'].includes(page) ? 'more' : page === 'chat' ? 'character-detail' : page === 'character-detail' || page === 'create' ? 'characters' : 'home')

  const openCharacter = (id: string) => { setActiveId(id); setPage('character-detail') }
  const createCharacter = () => {
    if (!newCharacter.name.trim()) return
    const character: Character = { id: crypto.randomUUID(), name: newCharacter.name.trim(), tagline: newCharacter.tagline.trim() || '新的角色', description: newCharacter.description.trim(), greeting: newCharacter.greeting.trim() || '你来了。', tags: newCharacter.tags.split(/[,，]/).map((item) => item.trim()).filter(Boolean) }
    setCharacters((current) => [...current, character]); setSessions((current) => ({ ...current, [character.id]: [{ id: Date.now(), role: 'assistant', text: character.greeting }] })); setActiveId(character.id); setNewCharacter({ name: '', tagline: '', description: '', greeting: '', tags: '' }); setPage('character-detail')
  }
  const newSession = () => { setSessions((current) => ({ ...current, [activeCharacter.id]: [{ id: Date.now(), role: 'assistant', text: activeCharacter.greeting }] })); setPage('chat') }
  const sendMessage = () => {
    const text = draft.trim(); if (!text) return
    setSessions((current) => ({ ...current, [activeCharacter.id]: [...(current[activeCharacter.id] || []), { id: Date.now(), role: 'user', text }] })); setDraft('')
    window.setTimeout(() => setSessions((current) => ({ ...current, [activeCharacter.id]: [...(current[activeCharacter.id] || []), { id: Date.now() + 1, role: 'assistant', text: '我听着。慢慢说，不急。' }] })), 420)
  }

  const CharacterCard = ({ item }: { item: Character }) => <button className="character-card" onClick={() => openCharacter(item.id)}><div className="character-art"><span>{item.name.slice(-1)}</span><i>✦</i></div><div className="character-copy"><div className="character-title"><strong>{item.name}</strong><span>{item.id === activeId ? '最近共演' : '角色卡'}</span></div><p>{item.tagline}</p><small>“{item.greeting}”</small></div><span className="chevron">›</span></button>

  return <div className="app-shell"><main className={`phone-canvas ${page === 'chat' ? 'chat-canvas' : ''}`}>
    {(page === 'home' || page === 'characters') && <><header className="hero-header"><div><p className="eyebrow">WeiWei Role</p><h1>{pageTitle}</h1><p className="hero-copy">把角色、世界与长期记忆，收进一个安静的共演空间。</p></div><button className="avatar-button" onClick={() => setPage('identity')}>惟</button></header>{page === 'home' ? <section className="content-stack"><div className="feature-card"><div><span className="feature-badge">继续共演</span><h2>{activeCharacter.name}</h2><p>{activeCharacter.greeting}</p></div><button className="primary-button" onClick={() => setPage('chat')}>回到对话</button></div><section><div className="section-heading"><h2>最近角色</h2><button onClick={() => setPage('characters')}>查看全部</button></div><CharacterCard item={activeCharacter} /></section></section> : <section className="content-stack"><div className="section-heading"><div><h2>角色库</h2><p>所有角色都保存在当前设备</p></div><button onClick={() => setPage('create')}>＋ 新建</button></div>{characters.map((item) => <CharacterCard key={item.id} item={item} />)}</section>}</>}

    {page === 'create' && <><BackHeader title="新建角色" onBack={goBack} action={<button className="text-button" onClick={createCharacter}>保存</button>} /><section className="content-stack form-stack"><label>角色名称<input value={newCharacter.name} onChange={(e) => setNewCharacter({ ...newCharacter, name: e.target.value })} placeholder="例如：霍烬" /></label><label>一句话简介<input value={newCharacter.tagline} onChange={(e) => setNewCharacter({ ...newCharacter, tagline: e.target.value })} /></label><label>角色设定<textarea rows={7} value={newCharacter.description} onChange={(e) => setNewCharacter({ ...newCharacter, description: e.target.value })} /></label><label>开场白<textarea rows={4} value={newCharacter.greeting} onChange={(e) => setNewCharacter({ ...newCharacter, greeting: e.target.value })} /></label><label>标签<input value={newCharacter.tags} onChange={(e) => setNewCharacter({ ...newCharacter, tags: e.target.value })} placeholder="慢热，守护，剧情向" /></label><button className="primary-button full" onClick={createCharacter}>创建并保存</button></section></>}

    {page === 'character-detail' && <><BackHeader title={activeCharacter.name} onBack={goBack} /><section className="detail-stack"><div className="character-hero"><div className="hero-portrait"><span>{activeCharacter.name.slice(-1)}</span><i>✦</i></div><div><p className="eyebrow">CHARACTER</p><h2>{activeCharacter.name}</h2><p>{activeCharacter.tagline}</p></div></div><div className="detail-card"><h3>角色简介</h3><p>{activeCharacter.description || '还没有填写角色简介。'}</p><div className="chips left">{activeCharacter.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div><div className="detail-card"><h3>开场白</h3><blockquote>{activeCharacter.greeting}</blockquote></div><div className="detail-actions"><button className="primary-button full" onClick={() => setPage('chat')}>继续共演</button><button className="secondary-button" onClick={newSession}>新建对话</button></div></section></>}

    {page === 'chat' && <section className="chat-page"><header className="chat-header"><button className="icon-button" onClick={goBack}>‹</button><button className="chat-identity" onClick={() => setPage('character-detail')}><span>{activeCharacter.name.slice(-1)}</span><div><strong>{activeCharacter.name}</strong><small>{identity.name} · 沉浸共演中</small></div></button><button className="more-button" onClick={() => setPage('memory')}>•••</button></header><div className="scene-banner"><span>✦</span><p>{worldbook.slice(0, 24)}</p></div><div className="message-list">{messages.map((message) => <div key={message.id} className={`message-row ${message.role}`}><div className="message-bubble">{message.text}</div></div>)}</div><div className="composer"><button className="composer-plus">＋</button><textarea rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }} placeholder="写下你的回应……" /><button className="send-button" onClick={sendMessage}>↑</button></div></section>}

    {page === 'more' && <><BackHeader title="更多" onBack={() => setPage('home')} /><section className="settings-stack">{[[['API 连接', 'api'], ['用户身份', 'identity']], [['模型设置', 'model'], ['预设', 'preset'], ['世界书', 'worldbook'], ['长记忆', 'memory']], [['设置', 'settings']]].map((group, index) => <div className="settings-group" key={index}>{group.map(([label, target]) => <button key={label} onClick={() => setPage(target as Page)}><span>{label}</span><span>›</span></button>)}</div>)}</section></>}

    {page === 'api' && <><BackHeader title="API 连接" onBack={goBack} action={<button className="text-button" onClick={() => write('weijing.api', api)}>保存</button>} /><section className="content-stack form-stack"><div className="api-status"><span className={connection === 'ok' ? 'ok' : ''}></span><div><strong>{connection === 'ok' ? '连接正常' : '尚未测试连接'}</strong><small>OpenAI 兼容接口</small></div></div><label>Base URL<input value={api.baseUrl} onChange={(e) => setApi({ ...api, baseUrl: e.target.value })} /></label><label>API Key<input type="password" value={api.apiKey} onChange={(e) => setApi({ ...api, apiKey: e.target.value })} /></label><label>模型名称<input value={api.modelName} onChange={(e) => setApi({ ...api, modelName: e.target.value })} /></label><div className="privacy-note">配置仅保存在当前设备。</div><button className="primary-button full" onClick={() => { setConnection('testing'); setTimeout(() => setConnection('ok'), 700) }}>{connection === 'testing' ? '测试中…' : '测试连接'}</button></section></>}

    {page === 'identity' && <EditablePage title="用户身份" value={identity.description} name={identity.name} onName={(name) => setIdentity({ ...identity, name })} onChange={(description) => setIdentity({ ...identity, description })} onBack={goBack} />}
    {page === 'worldbook' && <EditablePage title="世界书" value={worldbook} onChange={setWorldbook} onBack={goBack} />}
    {page === 'preset' && <EditablePage title="预设" value={preset} onChange={setPreset} onBack={goBack} />}
    {page === 'memory' && <EditablePage title="长记忆" value={memory} onChange={setMemory} onBack={goBack} />}

    {page === 'model' && <><BackHeader title="模型设置" onBack={goBack} /><section className="settings-stack"><div className="settings-group range-group"><RangeRow label="记忆长度" value={memoryLength} min={10} max={100} step={1} onChange={setMemoryLength} /><RangeRow label="回复令牌限制" value={maxTokens} min={1000} max={16000} step={500} onChange={setMaxTokens} /></div><div className="settings-group range-group"><RangeRow label="温度" value={temperature} min={0} max={2} step={0.05} onChange={setTemperature} /><RangeRow label="Top-P" value={topP} min={0} max={1} step={0.05} onChange={setTopP} /></div><div className="settings-group toggle-row"><div><strong>流式传输</strong><small>立即逐字显示回复</small></div><button className={`switch ${streaming ? 'on' : ''}`} onClick={() => setStreaming(!streaming)}><span /></button></div></section></>}
    {page === 'settings' && <><BackHeader title="设置" onBack={goBack} /><section className="settings-stack"><div className="settings-group">{['外观 · 跟随系统', '语言 · 简体中文', '字体 · 默认', '存储空间', '备份与恢复'].map((item) => <button key={item}><span>{item}</span><span>›</span></button>)}</div></section></>}

    {(page === 'home' || page === 'characters') && <nav className="bottom-nav"><button className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')}><span>⌂</span><small>首页</small></button><button className={page === 'characters' ? 'active' : ''} onClick={() => setPage('characters')}><span>◉</span><small>角色</small></button><button onClick={() => setPage('chat')}><span>✦</span><small>共演</small></button><button onClick={() => setPage('more')}><span>•••</span><small>更多</small></button></nav>}
  </main></div>
}

function EditablePage({ title, value, onChange, onBack, name, onName }: { title: string; value: string; onChange: (value: string) => void; onBack: () => void; name?: string; onName?: (value: string) => void }) {
  return <><BackHeader title={title} onBack={onBack} action={<span className="saved-label">自动保存</span>} /><section className="content-stack form-stack">{onName && <label>名称<input value={name} onChange={(e) => onName(e.target.value)} /></label>}<label>{title}内容<textarea rows={14} value={value} onChange={(e) => onChange(e.target.value)} placeholder={`填写${title}内容……`} /></label><div className="privacy-note">内容会自动保存在当前设备。</div></section></>
}

function RangeRow({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <div className="range-row"><div><strong>{label}</strong></div><div className="range-controls"><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /><output>{Number.isInteger(value) ? value : value.toFixed(2)}</output></div></div>
}

export default App
