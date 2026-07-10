import { useMemo, useState } from 'react'

type Page = 'home' | 'characters' | 'create' | 'import-file' | 'import-url' | 'character-detail' | 'chat' | 'more' | 'api' | 'model' | 'settings'

type Message = { id: number; role: 'user' | 'assistant'; text: string }

const demoCharacter = {
  name: '霍烬',
  tagline: '沉稳克制的守护者',
  description: 'A 国旧世家出身，寡言、冷静，习惯把所有风浪挡在身后。不会替你决定，但会一直站在你能看见的地方。',
  greeting: '夜里风大。过来，站我这边。',
  tags: ['慢热', '沉稳', '守护', '剧情向'],
}

const actionCards = [
  { icon: '＋', title: '新建角色', subtitle: '从头开始，创建一个新角色', page: 'create' as Page },
  { icon: '▧', title: '从文件导入角色卡', subtitle: '支持 JSON 或 PNG 文件', page: 'import-file' as Page },
  { icon: '↗', title: '从 URL 导入角色卡', subtitle: '粘贴公开角色卡地址自动识别', page: 'import-url' as Page },
]

const settingGroups = [
  [['API 连接', 'OpenAI 兼容'], ['角色', '1'], ['用户身份', '周惟惟']],
  [['主题', '雾白'], ['语音与生图', '']],
  [['模型设置', ''], ['预设', '默认'], ['世界书', ''], ['正则', ''], ['长记忆', '']],
  [['设置', '']],
]

function BackHeader({ title, onBack, action }: { title: string; onBack: () => void; action?: React.ReactNode }) {
  return <header className="page-header"><button className="icon-button" onClick={onBack} aria-label="返回">‹</button><h1>{title}</h1><div className="header-action">{action}</div></header>
}

function CharacterCard({ onOpen }: { onOpen: () => void }) {
  return <button className="character-card" onClick={onOpen}>
    <div className="character-art"><span>烬</span><i>✦</i></div>
    <div className="character-copy"><div className="character-title"><strong>{demoCharacter.name}</strong><span>最近共演</span></div><p>{demoCharacter.tagline}</p><small>“{demoCharacter.greeting}”</small></div>
    <span className="chevron">›</span>
  </button>
}

function App() {
  const [page, setPage] = useState<Page>('home')
  const [temperature, setTemperature] = useState(0.95)
  const [topP, setTopP] = useState(0.9)
  const [memoryLength, setMemoryLength] = useState(47)
  const [maxTokens, setMaxTokens] = useState(8000)
  const [streaming, setStreaming] = useState(true)
  const [url, setUrl] = useState('')
  const [draft, setDraft] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [modelName, setModelName] = useState('gpt-4.1-mini')
  const [connectionState, setConnectionState] = useState<'idle' | 'testing' | 'ok'>('idle')
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: 'assistant', text: demoCharacter.greeting },
    { id: 2, role: 'user', text: '你怎么知道我会来？' },
    { id: 3, role: 'assistant', text: '不知道。只是门一直给你留着。' },
  ])

  const pageTitle = useMemo(() => page === 'home' ? '惟境' : page === 'characters' ? '角色' : '', [page])
  const goBack = () => setPage(page === 'model' || page === 'settings' || page === 'api' ? 'more' : page === 'chat' ? 'character-detail' : page === 'character-detail' || page.startsWith('import') || page === 'create' ? 'characters' : 'home')

  const sendMessage = () => {
    const text = draft.trim()
    if (!text) return
    setMessages((current) => [...current, { id: Date.now(), role: 'user', text }])
    setDraft('')
    window.setTimeout(() => setMessages((current) => [...current, { id: Date.now() + 1, role: 'assistant', text: '我听着。慢慢说，不急。' }]), 450)
  }

  const testConnection = () => {
    setConnectionState('testing')
    window.setTimeout(() => setConnectionState('ok'), 800)
  }

  return <div className="app-shell"><main className={`phone-canvas ${page === 'chat' ? 'chat-canvas' : ''}`}>
    {(page === 'home' || page === 'characters') && <>
      <header className="hero-header"><div><p className="eyebrow">WeiWei Role</p><h1>{pageTitle}</h1><p className="hero-copy">把角色、世界与长期记忆，收进一个安静的共演空间。</p></div><button className="avatar-button">惟</button></header>
      {page === 'home' ? <section className="content-stack">
        <div className="feature-card"><div><span className="feature-badge">新空间</span><h2>开始一段新的共演</h2><p>创建角色、导入角色卡，或从最近对话继续。</p></div><button className="primary-button" onClick={() => setPage('chat')}>继续与霍烬共演</button></div>
        <section><div className="section-heading"><h2>最近角色</h2><button onClick={() => setPage('characters')}>查看全部</button></div><CharacterCard onOpen={() => setPage('character-detail')} /></section>
      </section> : <section className="content-stack">
        <div className="section-heading"><div><h2>角色库</h2><p>选择角色继续，或创建新的角色卡</p></div></div>
        <CharacterCard onOpen={() => setPage('character-detail')} />
        <div className="action-list">{actionCards.map((item) => <button className="action-card" key={item.title} onClick={() => setPage(item.page)}><span className="action-icon">{item.icon}</span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span><span className="chevron">›</span></button>)}</div>
      </section>}
    </>}

    {page === 'character-detail' && <><BackHeader title={demoCharacter.name} onBack={goBack} action={<button className="text-button">编辑</button>} /><section className="detail-stack">
      <div className="character-hero"><div className="hero-portrait"><span>烬</span><i>✦</i></div><div><p className="eyebrow">CHARACTER</p><h2>{demoCharacter.name}</h2><p>{demoCharacter.tagline}</p></div></div>
      <div className="detail-card"><h3>角色简介</h3><p>{demoCharacter.description}</p><div className="chips left">{demoCharacter.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
      <div className="detail-card"><h3>开场白</h3><blockquote>{demoCharacter.greeting}</blockquote></div>
      <div className="detail-actions"><button className="primary-button full" onClick={() => setPage('chat')}>开始共演</button><button className="secondary-button">新建对话</button></div>
    </section></>}

    {page === 'chat' && <section className="chat-page">
      <header className="chat-header"><button className="icon-button" onClick={goBack}>‹</button><button className="chat-identity" onClick={() => setPage('character-detail')}><span>烬</span><div><strong>{demoCharacter.name}</strong><small>沉浸共演中 · 点击查看角色</small></div></button><button className="more-button">•••</button></header>
      <div className="scene-banner"><span>✦</span><p>雨夜 · 霍宅长廊</p></div>
      <div className="message-list">{messages.map((message) => <div key={message.id} className={`message-row ${message.role}`}><div className="message-bubble">{message.text}</div>{message.role === 'assistant' && <div className="message-tools"><button>续写</button><button>重生成</button><button>编辑</button></div>}</div>)}</div>
      <div className="composer"><button className="composer-plus">＋</button><textarea rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage() } }} placeholder="写下你的回应……" /><button className="send-button" onClick={sendMessage}>↑</button></div>
    </section>}

    {page === 'api' && <><BackHeader title="API 连接" onBack={goBack} action={<button className="text-button">保存</button>} /><section className="content-stack form-stack">
      <div className="api-status"><span className={connectionState === 'ok' ? 'ok' : ''}></span><div><strong>{connectionState === 'ok' ? '连接正常' : '尚未测试连接'}</strong><small>OpenAI 兼容接口</small></div></div>
      <label>Base URL<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
      <label>API Key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-••••••••" /></label>
      <label>模型名称<input value={modelName} onChange={(event) => setModelName(event.target.value)} /></label>
      <div className="privacy-note">密钥仅保存在当前设备。本版本暂未上传任何配置。</div>
      <button className="primary-button full" onClick={testConnection}>{connectionState === 'testing' ? '测试中…' : connectionState === 'ok' ? '重新测试' : '测试连接'}</button>
    </section></>}

    {page === 'create' && <><BackHeader title="新建角色" onBack={goBack} action={<button className="text-button">保存</button>} /><section className="content-stack form-stack"><button className="portrait-picker"><span>＋</span><small>添加头像</small></button><label>角色名称<input placeholder="例如：霍烬" /></label><label>一句话简介<input placeholder="用一句话描述角色" /></label><label>角色设定<textarea rows={7} placeholder="身份、性格、说话方式、关系背景……" /></label><label>开场白<textarea rows={5} placeholder="角色第一次出现时说的话" /></label><button className="primary-button full">创建角色</button></section></>}

    {page === 'import-file' && <><BackHeader title="从文件导入角色卡" onBack={goBack} /><section className="content-stack"><label className="drop-zone"><input type="file" accept=".json,.png,application/json,image/png" /><span className="drop-plus">＋</span><strong>导入角色卡</strong><small>支持 JSON、PNG 与常见 V2 / V3 角色卡</small></label><div className="support-card"><h3>兼容格式</h3><div className="chips"><span>Tavern</span><span>SillyTavern</span><span>Chub</span><span>JanitorAI</span><span>公开 JSON</span><span>公开 PNG</span></div></div></section></>}

    {page === 'import-url' && <><BackHeader title="从 URL 导入角色" onBack={goBack} action={<button className="pill-button" disabled={!url}>导入</button>} /><section className="content-stack"><div className="url-box"><textarea value={url} onChange={(event) => setUrl(event.target.value)} rows={7} placeholder="在这里粘贴公开角色卡链接，仅支持一个链接" /><button onClick={() => navigator.clipboard?.readText().then(setUrl)}>粘贴剪贴板</button></div><div className="support-card"><h3>支持平台</h3><div className="chips"><span>Only Cards</span><span>Chub</span><span>JanitorAI</span><span>Pygmalion</span><span>RisuRealm</span><span>公开链接</span></div></div></section></>}

    {page === 'more' && <><BackHeader title="更多" onBack={() => setPage('home')} /><section className="settings-stack">{settingGroups.map((group, groupIndex) => <div className="settings-group" key={groupIndex}>{group.map(([label, value]) => <button key={label} onClick={() => label === 'API 连接' ? setPage('api') : label === '角色' ? setPage('characters') : label === '模型设置' ? setPage('model') : label === '设置' ? setPage('settings') : undefined}><span>{label}</span><span className="setting-value">{value} <b>›</b></span></button>)}</div>)}</section></>}

    {page === 'model' && <><BackHeader title="模型设置" onBack={goBack} action={<button className="soft-button">恢复默认</button>} /><section className="settings-stack"><div className="settings-group range-group"><RangeRow label="记忆长度" hint="发送最近消息给模型，作为短期记忆" value={memoryLength} min={10} max={100} step={1} onChange={setMemoryLength} /><RangeRow label="回复令牌限制" hint="模型单次回复的最大长度" value={maxTokens} min={1000} max={16000} step={500} onChange={setMaxTokens} /></div><div className="settings-group range-group"><RangeRow label="温度" hint="更遵循剧本 ↔ 更天马行空" value={temperature} min={0} max={2} step={0.05} onChange={setTemperature} /><RangeRow label="Top-P" hint="性格单一 ↔ 性格多面" value={topP} min={0} max={1} step={0.05} onChange={setTopP} /></div><div className="settings-group toggle-row"><div><strong>流式传输</strong><small>角色开始回应时立即逐字显示</small></div><button className={`switch ${streaming ? 'on' : ''}`} onClick={() => setStreaming(!streaming)}><span /></button></div></section></>}

    {page === 'settings' && <><BackHeader title="设置" onBack={goBack} /><section className="settings-stack"><div className="settings-group">{['外观 · 跟随系统', '语言 · 简体中文', '字体 · 默认'].map((item) => <button key={item}><span>{item}</span><span>›</span></button>)}</div><div className="settings-group">{['高级渲染', '聊天设置', '存储空间', '备份与恢复'].map((item) => <button key={item}><span>{item}</span><span>›</span></button>)}</div><div className="settings-group">{['快速开始', '帮助中心', '关于惟境'].map((item) => <button key={item}><span>{item}</span><span>›</span></button>)}</div></section></>}

    {(page === 'home' || page === 'characters') && <nav className="bottom-nav"><button className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')}><span>⌂</span><small>首页</small></button><button className={page === 'characters' ? 'active' : ''} onClick={() => setPage('characters')}><span>◉</span><small>角色</small></button><button onClick={() => setPage('chat')}><span>✦</span><small>共演</small></button><button onClick={() => setPage('more')}><span>•••</span><small>更多</small></button></nav>}
  </main></div>
}

function RangeRow({ label, hint, value, min, max, step, onChange }: { label: string; hint: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <div className="range-row"><div><strong>{label}</strong><small>{hint}</small></div><div className="range-controls"><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><output>{Number.isInteger(value) ? value : value.toFixed(2)}</output></div></div>
}

export default App
