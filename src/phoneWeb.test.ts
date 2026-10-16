import { describe, expect, it } from 'vitest'
import { buildWebNote, needsWebSearch } from './phoneWeb'

describe('phoneWeb', () => {
  it('detects search intent', () => {
    expect(needsWebSearch('今天潮州天气怎么样')).toBe(true)
    expect(needsWebSearch('你们帮我查下这部剧什么时候上映')).toBe(true)
    expect(needsWebSearch('哈哈哈哈')).toBe(false)
  })
  it('builds note', () => {
    const note = buildWebNote('某剧上映', '10月20日上映', [{ title: 'A', url: 'u', content: '内容' }])
    expect(note).toContain('【联网结果】')
    expect(note).toContain('10月20日上映')
    expect(buildWebNote('x', '', [])).toContain('没有搜到')
  })
})

describe('v129 web search accuracy', () => {
  it('turns chatty asks into a query and borrows context for vague ones', async () => {
    const { buildSearchQuery } = await import('./phoneWeb')
    expect(buildSearchQuery('你们帮我搜一下马斯克今天发布的新车')).toContain('马斯克今天发布的新车')
    expect(buildSearchQuery('你们去搜下新闻', ['今天马斯克发布了新车'])).toContain('马斯克')
  })
  it('still tells the model the date and not to call the user a liar when nothing is found', () => {
    const note = buildWebNote('马斯克 新车', '', [])
    expect(note).toContain('没有搜到')
    expect(note).toContain('不要说她骗人')
  })
})

describe('v130 retry search keeps the topic', () => {
  it('reuses her last topical ask instead of searching her complaint', async () => {
    const { buildSearchQuery } = await import('./phoneWeb')
    const earlier = ['今天马斯克发布了新车，你们搜下新闻', '就是让你们去接近这个世界，你们倒好', '怎么搜出来的东西那么不确定？？']
    const query = buildSearchQuery('顺个鬼！现在重新搜索看看', earlier)
    expect(query).toContain('马斯克')
    expect(query).not.toContain('顺个鬼')
  })
})
