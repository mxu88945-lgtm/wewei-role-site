import { useDeferredValue, useMemo, useState } from 'react'
import type { Conversation, Message } from './conversationLifecycle'
import { searchChatMessages } from './chatSearch'

export default function ChatSearchPage({ conversation, onBack, onJump, onBookmark, authorName }: { conversation: Conversation; onBack: () => void; onJump: (id: number) => void; onBookmark: (id: number, note: string | null) => void; authorName: (message: Message) => string }) {
  const [query, setQuery] = useState('')
  const [onlyBookmarks, setOnlyBookmarks] = useState(false)
  const [limit, setLimit] = useState(50)
  const deferredQuery = useDeferredValue(query)
  const results = useMemo(() => searchChatMessages(conversation.messages, deferredQuery, conversation.bookmarks, onlyBookmarks), [conversation.messages, conversation.bookmarks, deferredQuery, onlyBookmarks])
  return <section className="story-tools-page">
    <header className="story-tools-header"><button onClick={onBack} aria-label="返回聊天设置">‹</button><h2>剧情搜索与书签</h2></header>
    <label>搜索正文或书签备注<input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(50) }} placeholder="人物、台词、线索……" /></label>
    <label className="story-tools-check"><input type="checkbox" checked={onlyBookmarks} onChange={(event) => { setOnlyBookmarks(event.target.checked); setLimit(50) }} />只看书签</label>
    <p>{results.length} 条结果 · 仅当前对话</p>
    {results.slice(0, limit).map(({ message, bookmark, excerpt }) => <article className="story-tools-card" key={message.id}>
      <strong>{authorName(message)}{bookmark ? ' · ★' : ''}</strong>
      <p className="story-tools-excerpt">{excerpt}</p>
      {bookmark && <label>书签备注<input value={bookmark.note} onChange={(event) => onBookmark(message.id, event.target.value)} placeholder="给这段剧情写个备注" /></label>}
      <div className="story-tools-actions"><button onClick={() => onJump(message.id)}>跳到正文</button><button onClick={() => onBookmark(message.id, bookmark ? null : '')}>{bookmark ? '取消书签' : '加入书签'}</button></div>
    </article>)}
    {!results.length && <p>没有找到对应剧情。</p>}
    {results.length > limit && <button className="secondary-button" onClick={() => setLimit((value) => value + 50)}>再显示 50 条</button>}
  </section>
}
