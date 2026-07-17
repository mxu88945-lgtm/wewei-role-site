import { useEffect, useMemo, useState } from 'react'
import type { ApiChannel } from './apiChannels'
import { fetchApiModels, type ApiModel } from './chatApi'
import './reply-helper-settings.css'

type ReplyHelperSettingsPageProps = {
  channels: ApiChannel[]
  channelId: string
  modelName: string
  onChannelChange: (id: string) => void
  onModelChange: (modelName: string) => void
  onBack: () => void
}

export default function ReplyHelperSettingsPage({ channels, channelId, modelName, onChannelChange, onModelChange, onBack }: ReplyHelperSettingsPageProps) {
  const selectedChannel = channels.find((item) => item.id === channelId) || channels[0]
  const [models, setModels] = useState<ApiModel[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setModels([])
    setMessage('')
  }, [selectedChannel?.id])

  const selectedModel = modelName || selectedChannel?.modelName || ''
  const sortedModels = useMemo(() => [...models].sort((a, b) => a.id.localeCompare(b.id)), [models])

  const loadModels = async () => {
    if (!selectedChannel) return
    setLoading(true)
    setMessage('正在读取这个渠道的模型…')
    try {
      const nextModels = await fetchApiModels(selectedChannel)
      setModels(nextModels)
      setMessage(nextModels.length ? `已获取 ${nextModels.length} 个模型` : '接口没有返回模型，仍可手动填写。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '获取模型失败，请检查渠道配置。')
    } finally {
      setLoading(false)
    }
  }

  return <section className="reply-helper-page">
    <header className="page-header reply-helper-page-header">
      <button className="icon-button" onClick={onBack}>‹</button>
      <h1>AI 帮答设置</h1>
      <div className="header-action"><span className="saved-label">自动保存</span></div>
    </header>

    <div className="reply-helper-page-scroll">
      <section className="reply-helper-hero">
        <span className="reply-helper-hero-icon">✦</span>
        <div><small>你的临时写作搭档</small><h2>只起草，不替你发送</h2><p>它会读取当前对话上下文，把建议写入输入框；你可以继续修改，确认后再亲自发送。</p></div>
      </section>

      <section className="reply-helper-card">
        <div className="reply-helper-card-title"><div><small>专用功能绑定</small><h3>回复渠道与模型</h3></div><span>AI 帮答</span></div>
        <label>回复渠道
          <select value={selectedChannel?.id || ''} onChange={(event) => {
            const next = channels.find((item) => item.id === event.target.value)
            onChannelChange(event.target.value)
            onModelChange(next?.modelName || '')
          }}>
            {channels.map((channel) => <option value={channel.id} key={channel.id}>{channel.name || '未命名渠道'}</option>)}
          </select>
        </label>
        <label>回复模型
          <div className="reply-helper-model-field">
            <input value={selectedModel} onChange={(event) => onModelChange(event.target.value)} placeholder="填写模型名称，或从列表选择" autoCapitalize="none" autoCorrect="off" />
            <button type="button" onClick={() => void loadModels()} disabled={loading || !selectedChannel}>{loading ? '获取中…' : '获取模型'}</button>
          </div>
        </label>
        {message && <p className="reply-helper-model-message">{message}</p>}
        {sortedModels.length > 0 && <label>可用模型
          <select value={selectedModel} onChange={(event) => onModelChange(event.target.value)}>
            {!sortedModels.some((item) => item.id === selectedModel) && <option value={selectedModel}>{selectedModel || '请选择模型'}</option>}
            {sortedModels.map((model) => <option value={model.id} key={model.id}>{model.id}</option>)}
          </select>
        </label>}
      </section>

      <section className="reply-helper-card reply-helper-boundary-card">
        <div className="reply-helper-card-title"><div><small>使用边界</small><h3>它能看到什么</h3></div></div>
        <ul>
          <li><span>01</span><p><strong>当前身份与最近上下文</strong>用于写出衔接自然、符合你身份的回复。</p></li>
          <li><span>02</span><p><strong>已公开的项目进度</strong>只读取公开事件、线索与角色应知信息，不泄露隐藏真相。</p></li>
          <li><span>03</span><p><strong>草稿不会自动发送</strong>不会替其他角色演戏，也不会改写原聊天记录。</p></li>
        </ul>
      </section>
    </div>
  </section>
}
