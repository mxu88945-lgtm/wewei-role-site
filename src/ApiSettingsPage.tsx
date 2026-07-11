import { useMemo, useState } from 'react'
import { fetchApiModels, type ApiModel } from './chatApi'
import type { ApiChannel } from './apiChannels'

type ConnectionState = 'idle' | 'testing' | 'ok' | 'error'

type ApiSettingsPageProps = {
  api: ApiChannel
  channels: ApiChannel[]
  connection: ConnectionState
  connectionMessage: string
  onApiChange: (next: ApiChannel) => void
  onSelectChannel: (id: string) => void
  onAddChannel: () => void
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
  const [models, setModels] = useState<ApiModel[]>([])
  const [modelState, setModelState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [modelMessage, setModelMessage] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filteredModels = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return models
    return models.filter((model) => model.id.toLowerCase().includes(keyword) || model.ownedBy?.toLowerCase().includes(keyword))
  }, [models, query])

  const updateApi = (patch: Partial<ApiChannel>) => {
    onApiChange({ ...api, ...patch })
    onConnectionReset()
  }

  const loadModels = async () => {
    setModelState('loading')
    setModelMessage('正在请求模型列表…')
    try {
      const nextModels = await fetchApiModels(api)
      setModels(nextModels)
      if (!nextModels.length) {
        setModelState('error')
        setModelMessage('接口连接成功，但没有返回可用模型。仍可手动填写模型名称。')
        return
      }
      setModelState('ready')
      setModelMessage(`已获取 ${nextModels.length} 个模型`)
      setPickerOpen(true)
    } catch (error) {
      setModelState('error')
      setModelMessage(error instanceof Error ? error.message : '获取模型失败')
    }
  }

  const selectModel = (model: ApiModel) => {
    updateApi({ modelName: model.id })
    setPickerOpen(false)
    setQuery('')
    setModelMessage(`已选择 ${model.id}`)
  }

  return <section className="api-page">
    <header className="page-header api-page-header">
      <button className="icon-button" onClick={onBack}>‹</button>
      <h1>API 渠道</h1>
      <div className="header-action"><span className="saved-label">自动保存</span></div>
    </header>

    <div className="api-page-scroll content-stack form-stack">
      <section className="api-channel-card">
        <div className="api-channel-heading"><div><strong>聊天渠道</strong><small>每个渠道独立保存地址、密钥和模型</small></div><button type="button" onClick={onAddChannel}>＋ 添加</button></div>
        <div className="api-channel-tabs">{channels.map((channel) => <button type="button" className={channel.id === api.id ? 'active' : ''} key={channel.id} onClick={() => onSelectChannel(channel.id)}>{channel.name || '未命名渠道'}</button>)}</div>
        <label>渠道名称<input value={api.name} onChange={(event) => updateApi({ name: event.target.value })} /></label>
        {channels.length > 1 && <button type="button" className="api-channel-delete" onClick={() => onDeleteChannel(api.id)}>删除当前渠道</button>}
      </section>

      <div className={`api-status ${connection === 'error' ? 'error' : ''}`}>
        <span className={connection === 'ok' ? 'ok' : connection === 'error' ? 'error' : ''}></span>
        <div>
          <strong>{connection === 'testing' ? '正在测试连接' : connection === 'ok' ? '连接正常' : connection === 'error' ? '连接失败' : '尚未测试连接'}</strong>
          <small>{connectionMessage}</small>
        </div>
      </div>

      <label>Base URL
        <input value={api.baseUrl} onChange={(event) => updateApi({ baseUrl: event.target.value })} autoCapitalize="none" autoCorrect="off" />
      </label>

      <label>API Key
        <input type="password" value={api.apiKey} onChange={(event) => updateApi({ apiKey: event.target.value })} autoCapitalize="none" autoCorrect="off" />
      </label>

      <label>模型名称
        <div className="api-model-field">
          <input value={api.modelName} onChange={(event) => updateApi({ modelName: event.target.value })} autoCapitalize="none" autoCorrect="off" placeholder="可手动填写，或获取模型" />
          <button type="button" onClick={loadModels} disabled={modelState === 'loading'}>{modelState === 'loading' ? '获取中…' : '获取模型'}</button>
        </div>
        {modelMessage && <small className={modelState === 'error' ? 'api-model-message error' : 'api-model-message'}>{modelMessage}</small>}
      </label>

      <label>输出令牌参数
        <select value={api.maxTokenField} onChange={(event) => updateApi({ maxTokenField: event.target.value as ApiChannel['maxTokenField'] })}>
          <option value="auto">自动识别（推荐）</option>
          <option value="max_tokens">max_tokens · 常见兼容接口</option>
          <option value="max_completion_tokens">max_completion_tokens · 新版推理模型</option>
        </select>
      </label>

      <div className="privacy-note">所有渠道均自动保存在当前设备。API Key 不会上传仓库；切换渠道后，新消息立即使用所选渠道。</div>
    </div>

    <footer className="api-page-footer">
      <button className="primary-button full" onClick={onTest} disabled={connection === 'testing'}>{connection === 'testing' ? '正在连接…' : `测试「${api.name || '当前渠道'}」`}</button>
    </footer>

    {pickerOpen && <div className="api-model-picker-layer" role="presentation">
      <button className="api-model-picker-backdrop" aria-label="关闭模型列表" onClick={() => setPickerOpen(false)} />
      <section className="api-model-picker" role="dialog" aria-modal="true" aria-label="选择模型">
        <header>
          <div><small>{api.name}</small><strong>选择聊天模型</strong></div>
          <button onClick={() => setPickerOpen(false)}>×</button>
        </header>
        <input className="api-model-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型名称" autoFocus />
        <div className="api-model-list">
          {filteredModels.length ? filteredModels.map((model) => <button className={model.id === api.modelName ? 'active' : ''} key={model.id} onClick={() => selectModel(model)}>
            <span><strong>{model.id}</strong>{model.ownedBy && <small>{model.ownedBy}</small>}</span><i>{model.id === api.modelName ? '✓' : '›'}</i>
          </button>) : <div className="api-model-empty">没有匹配的模型</div>}
        </div>
      </section>
    </div>}
  </section>
}
