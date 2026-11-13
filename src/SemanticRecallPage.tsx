import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ApiChannel } from './apiChannels'
import {
  DEFAULT_EMBED_MODEL,
  getSemanticState,
  rebuildSemanticIndex,
  refreshSemanticCounts,
  scheduleSemanticIndex,
  semanticChannel,
  subscribeSemantic,
  testSemanticEmbedding,
  updateSemanticConfig,
} from './semanticRuntime'
import './reply-helper-settings.css'
import { ChannelOptions } from './ChannelOptions'

type SemanticRecallPageProps = {
  channels: ApiChannel[]
  onBack: () => void
}

function hhmm(ms: number): string {
  const date = new Date(ms)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export default function SemanticRecallPage({ channels, onBack }: SemanticRecallPageProps) {
  const { config, progress } = useSyncExternalStore(subscribeSemantic, getSemanticState, getSemanticState)
  const channel = semanticChannel(config, channels)
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState('')
  const [rebuilding, setRebuilding] = useState(false)

  useEffect(() => {
    if (config.enabled) void refreshSemanticCounts(true)
  }, [config.enabled, config.model, config.channelId])

  const toggle = () => {
    const enabled = !config.enabled
    updateSemanticConfig({ enabled, ...(enabled && !config.channelId && channel ? { channelId: channel.id } : {}) })
    if (enabled) scheduleSemanticIndex(1000)
  }

  const runTest = async () => {
    if (!channel) { setTestMessage('先选一个渠道'); return }
    setTesting(true)
    setTestMessage('')
    try {
      const dim = await testSemanticEmbedding(channel, config.model || DEFAULT_EMBED_MODEL)
      setTestMessage(`✓ 可以用，向量 ${dim} 维`)
    } catch (error) {
      setTestMessage(`✗ ${error instanceof Error ? error.message : '测试失败'}`)
    } finally {
      setTesting(false)
    }
  }

  const rebuild = async () => {
    setRebuilding(true)
    try { await rebuildSemanticIndex() } finally { setRebuilding(false) }
  }

  const status = !config.enabled ? '未开启' : progress.running ? '建索引中…' : progress.total && progress.indexed >= progress.total ? '已建完' : '后台自动补'

  return <section className="reply-helper-page">
    <header className="page-header reply-helper-page-header">
      <button className="icon-button" onClick={onBack}>‹</button>
      <h1>语义召回</h1>
      <div className="header-action"><span className="saved-label">自动保存</span></div>
    </header>

    <div className="reply-helper-page-scroll">
      <section className="reply-helper-card">
        <div className="reply-helper-card-title">
          <div><small>换了说法也能想起旧事</small><h3>语义召回</h3></div>
          <button type="button" className={`switch ${config.enabled ? 'on' : ''}`} aria-label={config.enabled ? '关闭语义召回' : '开启语义召回'} onClick={toggle}><span /></button>
        </div>
        <label>向量渠道（复用渠道里的 Key）
          <select value={channel?.id || ''} onChange={(event) => updateSemanticConfig({ channelId: event.target.value })}>
            <option value="">选择渠道…</option>
            <ChannelOptions channels={channels} renderLabel={(item) => `${item.name || item.baseUrl}${item.protocol === 'anthropic' ? '（不支持向量）' : ''}`} />
          </select>
        </label>
        {!channel && <p className="reply-helper-model-message">先在 API 渠道里新增一个硅基流动渠道：https://api.siliconflow.cn/v1</p>}
        <label>向量模型
          <div className="reply-helper-model-field">
            <input value={config.model} onChange={(event) => updateSemanticConfig({ model: event.target.value })} onBlur={() => { if (!config.model.trim()) updateSemanticConfig({ model: DEFAULT_EMBED_MODEL }) }} placeholder={DEFAULT_EMBED_MODEL} autoCapitalize="none" autoCorrect="off" />
            <button type="button" onClick={() => void runTest()} disabled={testing || !channel}>{testing ? '测试中…' : '测试'}</button>
          </div>
        </label>
        {testMessage && <p className="reply-helper-model-message">{testMessage}</p>}
      </section>

      {config.enabled && <section className="reply-helper-card">
        <div className="reply-helper-card-title"><div><small>{status}</small><h3>已建 {progress.indexed}/{progress.total} 段</h3></div>
          <button type="button" className="soft-button" onClick={() => void rebuild()} disabled={rebuilding || progress.running || !channel}>{rebuilding ? '清空中…' : '重建'}</button>
        </div>
        {progress.error && <p className="reply-helper-model-message">上次失败：{progress.error}{progress.backoffUntil ? `（${hhmm(progress.backoffUntil)} 后自动再试）` : ''}</p>}
      </section>}

      <p className="reply-helper-model-message">每段剧情只想起它自己的旧原话，不会串到别的对话。向量只存在本设备；关掉就和原来完全一样。</p>
    </div>
  </section>
}
