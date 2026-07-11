import { useEffect, useMemo, useState } from 'react'
import { fetchApiModels, type ApiModel } from './chatApi'
import type { ApiChannel } from './apiChannels'

type ConnectionState = 'idle' | 'testing' | 'ok' | 'error'
type ModelState = 'idle' | 'loading' | 'ready' | 'error'

type ApiSettingsPageProps = {
  api: ApiChannel
  channels: ApiChannel[]
  connection: ConnectionState
  connectionMessage: string
  onApiChange: (next: ApiChannel) => void
  onSelectChannel: (id: string) => void
  onAddChannel: (seed?: Partial<ApiChannel>) => void
  onDeleteChannel: (id: string) => void
  onConnectionReset: () => void
  onBack: () => void
  onTest: () => void
}

export default function ApiSettingsPage({
  api,
  channels,
  connection,
  connectionMessage,
  onApiChange,
  onSelectChannel,
  onAddChannel,
  onDeleteChannel,
  onConnectionReset,
  onBack,
  onTest,
}: ApiSettingsPageProps) {
  const [listOpen, setListOpen] = useState(true)
  const [expandedIds, setExpandedIds] = useState<string[]>([api.id])
  const [modelsByChannel, setModelsByChannel] = useState<Record<string, ApiModel[]>>({})
  const [modelStates, setModelStates] = useState<Record<string, ModelState>>({})
  const [modelMessages, setModelMessages] = useState<Record<string, string>>({})
  const [pickerChannelId, setPickerChannelId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [newChannel, setNewChannel] = useState({ name: '', baseUrl: 'https://api.openai.com/v1', apiKey: '' })

  useEffect(() => {
    setExpandedIds((current) => current.includes(api.id) ? current : [...current, api.id])
  }, [api.id])

  const pickerChannel = channels.find((channel) => channel.id === pickerChannelId)
  const pickerModels = pickerChannelId ? modelsByChannel[pickerChannelId] ?? [] : []
  const filteredModels = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return pickerModels
    return pickerModels.filter((model) => model.id.toLowerCase().includes(keyword) || model.ownedBy?.toLowerCase().includes(keyword))
  }, [pickerModels, query])

  const updateChannel = (channel: ApiChannel, patch: Partial<ApiChannel>) => {
    onApiChange({ ...channel, ...patch })
    if (channel.id === api.id) onConnectionReset()
  }

  const selectChannel = (id: string) => {
    onSelectChannel(id)
    setExpandedIds((current) => current.includes(id) ? current : [...current, id])
  }

  const toggleChannel = (id: string) => {
    setExpandedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const loadModels = async (channel: ApiChannel) => {
    setModelStates((current) => ({ ...current, [channel.id]: 'loading' }))
    setModelMessages((current) => ({ ...current, [channel.id]: '正在请求模型列表…' }))
    try {
      const nextModels = await fetchApiModels(channel)
      setModelsByChannel((current) => ({ ...current, [channel.id]: nextModels }))
      if (!nextModels.length) {
        setModelStates((current) => ({ ...current, [channel.id]: 'error' }))
        setModelMessages((current) => ({ ...current, [channel.id]: '接口连接成功，但没有返回可用模型。仍可手动填写。' }))
        return
      }
      setModelStates((current) => ({ ...current, [channel.id]: 'ready' }))
      setModelMessages((current) => ({ ...current, [channel.id]: `已获取 ${nextModels.length} 个模型` }))
      setPickerChannelId(channel.id)
      setQuery('')
    } catch (error) {
      setModelStates((current) => ({ ...current, [channel.id]: 'error' }))
      setModelMessages((current) => ({ ...current, [channel.id]: error instanceof Error ? error.message : '获取模型失败' }))
    }
  }

  const selectModel = (model: ApiModel) => {
    if (!pickerChannel) return
    updateChannel(pickerChannel, { modelName: model.id })
    setPickerChannelId(null)
    setQuery('')
    setModelMessages((current) => ({ ...current, [pickerChannel.id]: `已选择 ${model.id}` }))
  }

  const createChannel = () => {
    const name = newChannel.name.trim()
    if (!name) return
    onAddChannel({ name, baseUrl: newChannel.baseUrl.trim() || 'https://api.openai.com/v1', apiKey: newChannel.apiKey })
    setNewChannel({ name: '', baseUrl: 'https://api.openai.com/v1', apiKey: '' })
    setAddOpen(false)
  }

  return <section className="api-page">
    <header className="page-header api-page-header">
      <button className="icon-button" onClick={onBack}>‹</button>
      <h1>API 渠道</h1>
      <div className="header-action"><span className="saved-label">自动保存</span></div>
    </header>

    <div className="api-page-scroll content-stack form-stack">
      <section className="api-channels-panel">
        <button type="button" className="api-channels-summary" onClick={() => setListOpen((open) => !open)} aria-expanded={listOpen}>
          <span><strong>已有渠道 <i>({channels.length})</i></strong><small>当前 · {api.name || '未命名渠道'} · {api.modelName || '未选择模型'}</small></span>
          <b>{listOpen ? '收起⌃' : '展开⌄'}</b>
        </button>

        {listOpen && <div className="api-channel-list">
          {channels.map((channel) => {
            const active = channel.id === api.id
            const expanded = expandedIds.includes(channel.id)
            const modelState = modelStates[channel.id] ?? 'idle'
            const modelMessage = modelMessages[channel.id] ?? ''
            return <article className={`api-channel-item${active ? ' active' : ''}`} key={channel.id}>
              <div className="api-channel-item-header">
                <button type="button" className="api-channel-select" onClick={() => selectChannel(channel.id)} aria-label={`使用${channel.name || '未命名渠道'}`}>
                  <span className="api-radio">{active && <i />}</span>
                  <span className="api-channel-meta"><strong>{channel.name || '未命名渠道'}</strong><small>OpenAI 兼容 · 直连</small></span>
                </button>
                {channels.length > 1 && <button type="button" className="api-channel-remove" onClick={() => onDeleteChannel(channel.id)}>删除</button>}
                <button type="button" className="api-channel-toggle" onClick={() => toggleChannel(channel.id)} aria-expanded={expanded} aria-label={expanded ? '收起渠道' : '展开渠道'}>{expanded ? '⌃' : '⌄'}</button>
              </div>

              <div className="api-channel-current-model"><span>当前模型</span><strong>{channel.modelName || '尚未选择'}</strong></div>

              {expanded && <div className="api-channel-body form-stack">
                <label>渠道商备注名
                  <input value={channel.name} onChange={(event) => updateChannel(channel, { name: event.target.value })} placeholder="例如：OpenRouter、小克、肘子" />
                </label>
                <label>Base URL
                  <input value={channel.baseUrl} onChange={(event) => updateChannel(channel, { baseUrl: event.target.value })} autoCapitalize="none" autoCorrect="off" placeholder="https://example.com/v1" />
                </label>
                <label>API Key
                  <input type="password" value={channel.apiKey} onChange={(event) => updateChannel(channel, { apiKey: event.target.value })} autoCapitalize="none" autoCorrect="off" placeholder="sk-…" />
                </label>
                <label>模型名称
                  <div className="api-model-field">
                    <input value={channel.modelName} onChange={(event) => updateChannel(channel, { modelName: event.target.value })} autoCapitalize="none" autoCorrect="off" placeholder="可手填，或获取模型" />
                    <button type="button" onClick={() => loadModels(channel)} disabled={modelState === 'loading'}>{modelState === 'loading' ? '获取中…' : '获取模型'}</button>
                  </div>
                  {modelMessage && <small className={modelState === 'error' ? 'api-model-message error' : 'api-model-message'}>{modelMessage}</small>}
                </label>
                <label>输出令牌参数
                  <select value={channel.maxTokenField} onChange={(event) => updateChannel(channel, { maxTokenField: event.target.value as ApiChannel['maxTokenField'] })}>
                    <option value="auto">自动识别（推荐）</option>
                    <option value="max_tokens">max_tokens · 常见兼容接口</option>
                    <option value="max_completion_tokens">max_completion_tokens · 新版推理模型</option>
                  </select>
                </label>
              </div>}
            </article>
          })}

          <button type="button" className="api-channel-add" onClick={() => setAddOpen(true)}>＋ 添加一个新渠道</button>
        </div>}
      </section>

      <div className={`api-status ${connection === 'error' ? 'error' : ''}`}>
        <span className={connection === 'ok' ? 'ok' : connection === 'error' ? 'error' : ''}></span>
        <div><strong>{connection === 'testing' ? '正在测试连接' : connection === 'ok' ? '连接正常' : connection === 'error' ? '连接失败' : '尚未测试连接'}</strong><small>{connectionMessage}</small></div>
      </div>

      <div className="privacy-note">所有渠道都会自动保存在当前设备，切换后新消息立即使用所选渠道。API Key 不会上传到仓库。</div>
    </div>

    <footer className="api-page-footer">
      <button className="primary-button full" onClick={onTest} disabled={connection === 'testing'}>{connection === 'testing' ? '正在连接…' : `测试「${api.name || '当前渠道'}」`}</button>
    </footer>

    {pickerChannel && <div className="api-model-picker-layer" role="presentation">
      <button className="api-model-picker-backdrop" aria-label="关闭模型列表" onClick={() => setPickerChannelId(null)} />
      <section className="api-model-picker" role="dialog" aria-modal="true" aria-label="选择模型">
        <header><div><small>{pickerChannel.name || '未命名渠道'}</small><strong>选择聊天模型</strong></div><button onClick={() => setPickerChannelId(null)}>×</button></header>
        <input className="api-model-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型名称" autoFocus />
        <div className="api-model-list">
          {filteredModels.length ? filteredModels.map((model) => <button className={model.id === pickerChannel.modelName ? 'active' : ''} key={model.id} onClick={() => selectModel(model)}>
            <span><strong>{model.id}</strong>{model.ownedBy && <small>{model.ownedBy}</small>}</span><i>{model.id === pickerChannel.modelName ? '✓' : '›'}</i>
          </button>) : <div className="api-model-empty">没有匹配的模型</div>}
        </div>
      </section>
    </div>}

    {addOpen && <div className="api-add-channel-layer">
      <button className="api-model-picker-backdrop" aria-label="关闭新增渠道" onClick={() => setAddOpen(false)} />
      <section className="api-add-channel-sheet" role="dialog" aria-modal="true" aria-label="新增 API 渠道">
        <header><div><small>多渠道 API</small><strong>新增渠道</strong></div><button onClick={() => setAddOpen(false)}>×</button></header>
        <label>渠道商备注名<input value={newChannel.name} onChange={(event) => setNewChannel({ ...newChannel, name: event.target.value })} placeholder="例如：OpenRouter、小克、SiliconFlow" autoFocus /></label>
        <label>Base URL<input value={newChannel.baseUrl} onChange={(event) => setNewChannel({ ...newChannel, baseUrl: event.target.value })} autoCapitalize="none" autoCorrect="off" /></label>
        <label>API Key<input type="password" value={newChannel.apiKey} onChange={(event) => setNewChannel({ ...newChannel, apiKey: event.target.value })} autoCapitalize="none" autoCorrect="off" placeholder="可稍后填写" /></label>
        <button className="primary-button full" onClick={createChannel} disabled={!newChannel.name.trim()}>创建并进入渠道</button>
      </section>
    </div>}
  </section>
}
