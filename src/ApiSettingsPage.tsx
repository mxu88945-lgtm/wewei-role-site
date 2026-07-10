import { useMemo, useState } from 'react'
import { fetchApiModels, type ApiConfig, type ApiModel } from './chatApi'

type ConnectionState = 'idle' | 'testing' | 'ok' | 'error'

type ApiSettingsPageProps = {
  api: ApiConfig
  connection: ConnectionState
  connectionMessage: string
  onApiChange: (next: ApiConfig) => void
  onConnectionReset: () => void
  onBack: () => void
  onSave: () => void
  onTest: () => void
}

export default function ApiSettingsPage({
  api,
  connection,
  connectionMessage,
  onApiChange,
  onConnectionReset,
  onBack,
  onSave,
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

  const updateApi = (patch: Partial<ApiConfig>) => {
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
      <h1>API 连接</h1>
      <div className="header-action"><button className="text-button" onClick={onSave}>保存</button></div>
    </header>

    <div className="api-page-scroll content-stack form-stack">
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

      <div className="privacy-note">聊天 API 和记忆总结 API 相互独立，配置仅保存在当前设备。</div>
    </div>

    <footer className="api-page-footer">
      <button className="primary-button full" onClick={onTest} disabled={connection === 'testing'}>{connection === 'testing' ? '正在连接…' : '真实测试连接'}</button>
    </footer>

    {pickerOpen && <div className="api-model-picker-layer" role="presentation">
      <button className="api-model-picker-backdrop" aria-label="关闭模型列表" onClick={() => setPickerOpen(false)} />
      <section className="api-model-picker" role="dialog" aria-modal="true" aria-label="选择模型">
        <header>
          <div><small>模型列表</small><strong>选择聊天模型</strong></div>
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
