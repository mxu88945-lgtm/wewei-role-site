/** 小手机联网：用 Tavily 搜一次，把结果作为“群里有人刚查到的资料”给成员。key 只存在她自己的浏览器里。 */
export const TAVILY_KEY_STORAGE = 'weijing.tavilyKey'

const SEARCH_CUES = /查|搜|联网|上网|新闻|热搜|最新|最近|今天|明天|昨天|今年|天气|预报|多少钱|价格|股价|汇率|是谁|哪年|哪一年|什么时候|几号|上映|开播|比分|赛程|发生了什么|怎么回事|出了什么/

export function needsWebSearch(text: string) {
  const value = text.trim()
  if (value.length < 3) return false
  return SEARCH_CUES.test(value)
}

export type WebResult = { title: string; url: string; content: string; published_date?: string }

const FILLER = /你们|你|帮我|帮忙|给我|麻烦|能不能|可不可以|可以|去|再|快|赶紧|上网|联网|搜索一下|搜一下|搜下|搜搜|搜一搜|搜|查一下|查下|查查|查一查|查|一下|看看|看下|吧|吗|呢|呀|啊|嘛|哦|～|~|！|!|？|\?|。|，|,/g
const NEWS_CUES = /新闻|热搜|发布|发布会|最新|最近|今天|昨天|刚刚|刚才|出了什么|发生了什么|怎么回事/

/** 把聊天口吻变成搜索词；她只说“搜下新闻”这类空话时，借前几句她说过的话补上主题。 */
export function buildSearchQuery(latest: string, earlierUserTexts: string[] = []) {
  const clean = (text: string) => text.replace(FILLER, ' ').replace(/\s+/g, ' ').trim()
  let query = clean(latest)
  const generic = query.replace(/新闻|最新|今天|最近|消息/g, '').trim()
  if (generic.length < 3) {
    const context = earlierUserTexts.slice(-3).map(clean).filter((item) => item.length >= 2).join(' ')
    if (context) query = `${context} ${query}`.trim()
  }
  return query.slice(0, 200) || latest.slice(0, 200)
}

export function buildWebNote(query: string, answer: string, results: WebResult[], now = new Date()) {
  const stamp = now.toLocaleString('zh-CN', { hour12: false })
  const trust = '你的训练资料有截止日期，比现实晚；现实里今天已经是上面的日期。用户说的近期新闻、新产品、新事件，你没听过不代表是假的，不要说她骗人或编的；查到就引用，没查到就老实说“我这边没搜到细节”，再请她讲讲或发链接。'
  if (!answer && !results.length) return `【联网结果】刚才就“${query.slice(0, 60)}”上网查了（${stamp}），没有搜到相关结果。\n${trust}`
  const lines = results.slice(0, 5).map((item, index) => `${index + 1}. ${item.title.slice(0, 60)}${item.published_date ? `（${item.published_date.slice(0, 10)}）` : ''}：${item.content.replace(/\s+/g, ' ').slice(0, 220)}`)
  return [`【联网结果】刚才就“${query.slice(0, 60)}”上网查到（${stamp}）：`, answer && `概要：${answer.replace(/\s+/g, ' ').slice(0, 300)}`, ...lines, '需要时按自己人设自然地引用这些真实信息，可以说“我刚查了下”；结果里没有的细节不要编。', trust].filter(Boolean).join('\n')
}

export async function tavilySearch(key: string, query: string, signal?: AbortSignal) {
  const news = NEWS_CUES.test(query)
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    // 新闻类走 news 话题并限定近几天，否则通用索引常给旧网页，模型就以为“没这回事”。
    body: JSON.stringify({ query: query.slice(0, 380), max_results: 5, include_answer: true, search_depth: news ? 'advanced' : 'basic', ...(news ? { topic: 'news', days: 3 } : {}) }),
    signal,
  })
  if (!response.ok) throw new Error(response.status === 401 ? '联网 key 无效' : `联网搜索失败 ${response.status}`)
  const data = await response.json() as { answer?: string; results?: WebResult[] }
  return buildWebNote(query, data.answer || '', data.results || [])
}
