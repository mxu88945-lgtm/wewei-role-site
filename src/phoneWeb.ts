/** 小手机联网：用 Tavily 搜一次，把结果作为“群里有人刚查到的资料”给成员。key 只存在她自己的浏览器里。 */
export const TAVILY_KEY_STORAGE = 'weijing.tavilyKey'

const SEARCH_CUES = /查|搜|联网|上网|新闻|热搜|最新|最近|今天|明天|昨天|今年|天气|预报|多少钱|价格|股价|汇率|是谁|哪年|哪一年|什么时候|几号|上映|开播|比分|赛程|发生了什么|怎么回事|出了什么/

export function needsWebSearch(text: string) {
  const value = text.trim()
  if (value.length < 3) return false
  return SEARCH_CUES.test(value)
}

export type WebResult = { title: string; url: string; content: string }

export function buildWebNote(query: string, answer: string, results: WebResult[]) {
  if (!answer && !results.length) return ''
  const lines = results.slice(0, 4).map((item, index) => `${index + 1}. ${item.title.slice(0, 60)}：${item.content.replace(/\s+/g, ' ').slice(0, 220)}`)
  return [`【联网结果】刚才就“${query.slice(0, 60)}”上网查到（${new Date().toLocaleString('zh-CN', { hour12: false })}）：`, answer && `概要：${answer.replace(/\s+/g, ' ').slice(0, 300)}`, ...lines, '需要时按自己人设自然地引用这些真实信息，可以说“我刚查了下”；查到的没有的不要编。'].filter(Boolean).join('\n')
}

export async function tavilySearch(key: string, query: string, signal?: AbortSignal) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: query.slice(0, 380), max_results: 4, include_answer: true, search_depth: 'basic' }),
    signal,
  })
  if (!response.ok) throw new Error(response.status === 401 ? '联网 key 无效' : `联网搜索失败 ${response.status}`)
  const data = await response.json() as { answer?: string; results?: WebResult[] }
  return buildWebNote(query, data.answer || '', data.results || [])
}
