import { useMemo, useState } from 'react'

type Page =
  | 'home'
  | 'characters'
  | 'create'
  | 'import-file'
  | 'import-url'
  | 'more'
  | 'model'
  | 'settings'

const actionCards = [
  { icon: '＋', title: '新建角色', subtitle: '从头开始，创建一个新角色', page: 'create' as Page },
  { icon: '▧', title: '从文件导入角色卡', subtitle: '支持 JSON 或 PNG 文件', page: 'import-file' as Page },
  { icon: '↗', title: '从 URL 导入角色卡', subtitle: '粘贴公开角色卡地址自动识别', page: 'import-url' as Page },
]

const settingGroups = [
  [
    ['API 连接', '尚未配置'],
    ['角色', ''],
    ['用户身份', '周惟惟'],
  ],
  [
    ['主题', '雾白'],
    ['语音与生图', ''],
  ],
  [
    ['模型设置', ''],
    ['预设', '默认'],
    ['世界书', ''],
    ['正则', ''],
    ['长记忆', ''],
  ],
  [['设置', '']],
]

function BackHeader({ title, onBack, action }: { title: string; onBack: () => void; action?: React.ReactNode }) {
  return (
    <header className="page-header">
      <button className="icon-button" onClick={onBack} aria-label="返回">‹</button>
      <h1>{title}</h1>
      <div className="header-action">{action}</div>
    </header>
  )
}

function App() {
  const [page, setPage] = useState<Page>('home')
  const [temperature, setTemperature] = useState(0.95)
  const [topP, setTopP] = useState(0.9)
  const [memoryLength, setMemoryLength] = useState(47)
  const [maxTokens, setMaxTokens] = useState(8000)
  const [streaming, setStreaming] = useState(true)
  const [url, setUrl] = useState('')

  const pageTitle = useMemo(() => {
    if (page === 'home') return '惟境'
    if (page === 'characters') return '角色'
    return ''
  }, [page])

  const goBack = () => setPage(page === 'model' || page === 'settings' ? 'more' : page.startsWith('import') || page === 'create' ? 'characters' : 'home')

  return (
    <div className="app-shell">
      <main className="phone-canvas">
        {(page === 'home' || page === 'characters') && (
          <>
            <header className="hero-header">
              <div>
                <p className="eyebrow">WeiWei Role</p>
                <h1>{pageTitle}</h1>
                <p className="hero-copy">把角色、世界与长期记忆，收进一个安静的共演空间。</p>
              </div>
              <button className="avatar-button" aria-label="个人中心">惟</button>
            </header>

            {page === 'home' ? (
              <section className="content-stack">
                <div className="feature-card">
                  <div>
                    <span className="feature-badge">新空间</span>
                    <h2>开始一段新的共演</h2>
                    <p>创建角色、导入角色卡，或从最近对话继续。</p>
                  </div>
                  <button className="primary-button" onClick={() => setPage('characters')}>进入角色库</button>
                </div>

                <section>
                  <div className="section-heading">
                    <h2>最近角色</h2>
                    <button onClick={() => setPage('characters')}>查看全部</button>
                  </div>
                  <div className="empty-card">
                    <div className="empty-orb">✦</div>
                    <h3>角色库还是空的</h3>
                    <p>先创建第一张角色卡吧。</p>
                  </div>
                </section>
              </section>
            ) : (
              <section className="content-stack">
                <div className="section-heading">
                  <div>
                    <h2>创建角色</h2>
                    <p>选择一种方式开始</p>
                  </div>
                </div>
                <div className="action-list">
                  {actionCards.map((item) => (
                    <button className="action-card" key={item.title} onClick={() => setPage(item.page)}>
                      <span className="action-icon">{item.icon}</span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.subtitle}</small>
                      </span>
                      <span className="chevron">›</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {page === 'create' && (
          <>
            <BackHeader title="新建角色" onBack={goBack} action={<button className="text-button">保存</button>} />
            <section className="content-stack form-stack">
              <button className="portrait-picker"><span>＋</span><small>添加头像</small></button>
              <label>角色名称<input placeholder="例如：霍烬" /></label>
              <label>一句话简介<input placeholder="用一句话描述角色" /></label>
              <label>角色设定<textarea rows={7} placeholder="身份、性格、说话方式、关系背景……" /></label>
              <label>开场白<textarea rows={5} placeholder="角色第一次出现时说的话" /></label>
              <button className="primary-button full">创建角色</button>
            </section>
          </>
        )}

        {page === 'import-file' && (
          <>
            <BackHeader title="从文件导入角色卡" onBack={goBack} />
            <section className="content-stack">
              <label className="drop-zone">
                <input type="file" accept=".json,.png,application/json,image/png" />
                <span className="drop-plus">＋</span>
                <strong>导入角色卡</strong>
                <small>支持 JSON、PNG 与常见 V2 / V3 角色卡</small>
              </label>
              <div className="support-card">
                <h3>兼容格式</h3>
                <div className="chips"><span>Tavern</span><span>SillyTavern</span><span>Chub</span><span>JanitorAI</span><span>公开 JSON</span><span>公开 PNG</span></div>
              </div>
            </section>
          </>
        )}

        {page === 'import-url' && (
          <>
            <BackHeader title="从 URL 导入角色" onBack={goBack} action={<button className="pill-button" disabled={!url}>导入</button>} />
            <section className="content-stack">
              <div className="url-box">
                <textarea value={url} onChange={(event) => setUrl(event.target.value)} rows={7} placeholder="在这里粘贴公开角色卡链接，仅支持一个链接" />
                <button onClick={() => navigator.clipboard?.readText().then(setUrl)}>粘贴剪贴板</button>
              </div>
              <div className="support-card">
                <h3>支持平台</h3>
                <div className="chips"><span>Only Cards</span><span>Chub</span><span>JanitorAI</span><span>Pygmalion</span><span>RisuRealm</span><span>公开链接</span></div>
              </div>
            </section>
          </>
        )}

        {page === 'more' && (
          <>
            <BackHeader title="更多" onBack={() => setPage('home')} />
            <section className="settings-stack">
              {settingGroups.map((group, groupIndex) => (
                <div className="settings-group" key={groupIndex}>
                  {group.map(([label, value]) => (
                    <button key={label} onClick={() => label === '模型设置' ? setPage('model') : label === '设置' ? setPage('settings') : undefined}>
                      <span>{label}</span><span className="setting-value">{value} <b>›</b></span>
                    </button>
                  ))}
                </div>
              ))}
            </section>
          </>
        )}

        {page === 'model' && (
          <>
            <BackHeader title="模型设置" onBack={goBack} action={<button className="soft-button">恢复默认</button>} />
            <section className="settings-stack">
              <div className="settings-group range-group">
                <RangeRow label="记忆长度" hint="发送最近消息给模型，作为短期记忆" value={memoryLength} min={10} max={100} step={1} onChange={setMemoryLength} />
                <RangeRow label="回复令牌限制" hint="模型单次回复的最大长度" value={maxTokens} min={1000} max={16000} step={500} onChange={setMaxTokens} />
              </div>
              <div className="settings-group range-group">
                <RangeRow label="温度" hint="更遵循剧本 ↔ 更天马行空" value={temperature} min={0} max={2} step={0.05} onChange={setTemperature} />
                <RangeRow label="Top-P" hint="性格单一 ↔ 性格多面" value={topP} min={0} max={1} step={0.05} onChange={setTopP} />
              </div>
              <div className="settings-group toggle-row">
                <div><strong>流式传输</strong><small>角色开始回应时立即逐字显示</small></div>
                <button className={`switch ${streaming ? 'on' : ''}`} onClick={() => setStreaming(!streaming)}><span /></button>
              </div>
            </section>
          </>
        )}

        {page === 'settings' && (
          <>
            <BackHeader title="设置" onBack={goBack} />
            <section className="settings-stack">
              <div className="settings-group">
                {['外观 · 跟随系统', '语言 · 简体中文', '字体 · 默认'].map((item) => <button key={item}><span>{item}</span><span>›</span></button>)}
              </div>
              <div className="settings-group">
                {['高级渲染', '聊天设置', '存储空间', '备份与恢复'].map((item) => <button key={item}><span>{item}</span><span>›</span></button>)}
              </div>
              <div className="settings-group">
                {['快速开始', '帮助中心', '关于惟境'].map((item) => <button key={item}><span>{item}</span><span>›</span></button>)}
              </div>
            </section>
          </>
        )}

        {(page === 'home' || page === 'characters') && (
          <nav className="bottom-nav">
            <button className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')}><span>⌂</span><small>首页</small></button>
            <button className={page === 'characters' ? 'active' : ''} onClick={() => setPage('characters')}><span>◉</span><small>角色</small></button>
            <button><span>✦</span><small>共演</small></button>
            <button onClick={() => setPage('more')}><span>•••</span><small>更多</small></button>
          </nav>
        )}
      </main>
    </div>
  )
}

function RangeRow({ label, hint, value, min, max, step, onChange }: { label: string; hint: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <div className="range-row">
      <div><strong>{label}</strong><small>{hint}</small></div>
      <div className="range-controls">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <output>{Number.isInteger(value) ? value : value.toFixed(2)}</output>
      </div>
    </div>
  )
}

export default App
