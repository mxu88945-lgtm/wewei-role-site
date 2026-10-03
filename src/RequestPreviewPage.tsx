import { useState } from 'react'
import type { ChatApiMessage } from './chatApi'
export type RequestPreview = { speaker: string; model: string; messages: ChatApiMessage[]; memoryCount: number; historyCount: number; hasTemporaryPlot: boolean; sentAt?: number }
function contentText(message: ChatApiMessage) {
  return typeof message.content === 'string' ? message.content : message.content.map((part) => part.type === 'text' ? part.text : '[图片]').join('\n')
}
export default function RequestPreviewPage({ previews, lastRequests, onBack }: { previews: RequestPreview[]; lastRequests: RequestPreview[]; onBack: () => void }) {
  const [viewLast, setViewLast] = useState(false)
  const requests = viewLast ? lastRequests : previews
  return <section className="story-tools-page">
    <header className="story-tools-header"><button onClick={onBack} aria-label="返回聊天设置">‹</button><h2>模型发送内容</h2></header>
    <div className="story-tools-actions"><button onClick={() => setViewLast(false)} aria-pressed={!viewLast}>当前草稿预览</button><button onClick={() => setViewLast(true)} aria-pressed={viewLast}>最近实际请求</button></div>
    <p>这里只查看，不会发送、总结记忆或消耗临时剧情。预览按当前正文和输入框组装，单人输入框为空时预览续演请求；多人依次回复时，后续角色还会收到前面角色的新回复。最近实际请求仅在本次打开应用期间保留，实际发送以该记录为准。</p>
    {!requests.length && <p>{viewLast ? '当前对话还没有实际请求记录。' : '群聊请先在输入框 @ 要回复的角色，再打开预览。'}</p>}
    {requests.map((request, index) => <article className="story-tools-card" key={`${index}-${request.speaker}`}><strong>{request.speaker} · {request.model}</strong>{request.sentAt && <small>实际请求时间：{new Date(request.sentAt).toLocaleTimeString()}</small>}<p>最近正文最多 {request.historyCount} 条 · 选入长期记忆 {request.memoryCount} 份 · 临时剧情{request.hasTemporaryPlot ? '已带入' : '未带入'}</p><p>共 {request.messages.length} 段请求内容 · {request.messages.reduce((sum, message) => sum + contentText(message).length, 0).toLocaleString()} 字符（不是 token 数）</p>{request.messages.map((message, i) => <details key={i}><summary>{i + 1}. {message.role === 'system' ? '幕后设定 / 记忆' : message.role === 'user' ? '用户消息' : '角色回复'}</summary><pre>{contentText(message)}</pre></details>)}</article>)}
  </section>
}
