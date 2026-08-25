import { describe, expect, it } from 'vitest'
import { completeStatusBlock, containsHiddenReasoning, detectStatusTag, ensureStatusBlock, extractStatusFields, moveStatusBlockToEnd, normalizeDirectorStatusOutput, sanitizeAssistantOutput, stripLeadingSpeakerLabels, stripStatusBlocksForStreaming } from './outputSanitizer'

describe('assistant prompt-leak sanitizer', () => {
  it('removes leaked status instructions and keeps the real formatted reply', () => {
    const leaked = '#注意：非常重要！你必须在每次输出后回复的末尾，严格按照参考状态栏输出。\n\n<plot>\n```\n⏰时间:2034年01月25日 21:00\n🗺️地点:H市\n```\n</plot>\n真正剧情'
    const result = sanitizeAssistantOutput(leaked)
    expect(result).not.toContain('500美元')
    expect(result).not.toContain('注意：非常重要')
    expect(result).toContain('<plot>')
    expect(result).toContain('真正剧情')
  })

  it('does not alter ordinary roleplay text', () => {
    expect(sanitizeAssistantOutput('他抬眼看向你。')).toBe('他抬眼看向你。')
  })

  it('removes alternate status-format bribery wording', () => {
    const leaked = '#状态栏格式要求如上，请将状态栏包裹在以上代码内。\n#请严格遵守以上格式和要求！执行将获得500w美元赛博小费。\n\n```\n⏰时间:2034年02月18日 16:50\n🗺️地点:M国\n```\n\n你终于睁开了眼睛。'
    const result = sanitizeAssistantOutput(leaked)
    expect(result).not.toContain('状态栏格式要求')
    expect(result).not.toContain('500w美元')
    expect(result).toContain('⏰时间')
    expect(result).toContain('你终于睁开了眼睛')
  })

  it('removes strict-format leakage used by imported role cards', () => {
    const leaked = '#注意：请严格按照以上格式输出，禁止缺少任何符号（包括空格与换行），禁止缺少任何一项，如果不按照此格式输出，将会被倒扣1000美元！！\n⏰时间:2034年02月18日 17:15\n🗺️地点:M国\n\n真正剧情。'
    const result = sanitizeAssistantOutput(leaked)
    expect(result).not.toContain('严格按照以上格式')
    expect(result).not.toContain('1000美元')
    expect(result).toContain('⏰时间')
    expect(result).toContain('真正剧情')
  })

  it('removes tagged reasoning while preserving the final story', () => {
    const leaked = '<think>We need to plan the scene without controlling the user.</think>\n<scene>下午｜会议室</scene>\n门外传来脚步声。'
    expect(sanitizeAssistantOutput(leaked)).toBe('<scene>下午｜会议室</scene>\n门外传来脚步声。')
    expect(containsHiddenReasoning(leaked)).toBe(true)
  })

  it('hides an unfinished reasoning block during streaming', () => {
    expect(sanitizeAssistantOutput('<analysis>We need to inspect every character')).toBe('')
  })

  it('removes untagged Gemma director analysis before Chinese story text', () => {
    const leaked = "Jiang Lizhi (controlled by the user).\nThe narrator/director handles side characters and environment.\nYang Yue: Desperate but calculating.\n\n<scene>会议结束后｜走廊</scene>\n电梯门即将合拢时，一名法务助理快步追了出来。"
    expect(sanitizeAssistantOutput(leaked, { director: true })).toBe('<scene>会议结束后｜走廊</scene>\n电梯门即将合拢时，一名法务助理快步追了出来。')
    expect(containsHiddenReasoning(leaked, true)).toBe(true)
  })

  it('blocks a director response that contains only leaked analysis', () => {
    const leaked = 'Jiang Lizhi (controlled by the user).\nThe narrator/director handles the environment.\nHe is likely monitoring her movements.'
    expect(sanitizeAssistantOutput(leaked, { director: true })).toBe('')
  })

  it('does not remove ordinary English roleplay', () => {
    const story = 'She has just arrived. The elevator doors opened, and the courier placed a sealed envelope on the desk.'
    expect(sanitizeAssistantOutput(story, { director: true })).toBe(story)
  })
})

describe('status block fallback', () => {
  it('detects a card-specific status tag', () => {
    expect(detectStatusTag('每轮结尾输出 <czw_status>...</czw_status>')).toBe('czw_status')
    expect(detectStatusTag('<scene>时间</scene>\n正文')).toBe('')
  })

  it('preserves an existing complete status block', () => {
    const value = '正文。\n<gts_status>状态：等待</gts_status>'
    expect(ensureStatusBlock(value, 'gts_status', '状态：兜底')).toBe(value)
  })

  it('closes an unfinished status block without replacing its content', () => {
    expect(ensureStatusBlock('正文。\n<gts_status>状态：试探', 'gts_status', '状态：兜底'))
      .toBe('正文。\n<gts_status>状态：试探</gts_status>')
  })

  it('appends a compact fallback when the model omitted the block', () => {
    expect(ensureStatusBlock('正文结束。', 'gts_status', '状态：本轮回应结束｜待回应：等待用户回应'))
      .toBe('正文结束。\n\n<gts_status>状态：本轮回应结束｜待回应：等待用户回应</gts_status>')
  })

  it('supports card-specific status tags when the model omitted the block', () => {
    expect(ensureStatusBlock('正文结束。', 'czw_status', '状态：等待惟惟回应'))
      .toBe('正文结束。\n\n<czw_status>状态：等待惟惟回应</czw_status>')
  })

  it('fills omitted fields and replaces empty status placeholders', () => {
    const result = completeStatusBlock(
      '正文。\n<status>关系：延续当前剧情</status>',
      'status',
      '关系进展：延续当前剧情｜当前认知：本轮未更新｜待回应：等待惟惟回应',
      [
        { label: '关系进展', value: '延续当前剧情' },
        { label: '当前认知', value: '本轮未更新' },
        { label: '待回应', value: '等待惟惟回应' },
      ],
    )
    expect(result).toContain('关系：延续当前剧情')
    expect(result).toContain('关系进展：延续当前剧情')
    expect(result).toContain('当前认知：本轮未更新')
    expect(result).toContain('待回应：等待惟惟回应')
  })

  it('replaces a model placeholder with the last concrete value', () => {
    const result = completeStatusBlock(
      '正文。\n<status>关系进展：延续当前剧情｜当前认知：以本轮正文明确内容为准</status>',
      'status',
      '关系进展：阶段二｜当前认知：她已是重要合作者',
      [
        { label: '关系进展', value: '阶段二' },
        { label: '当前认知', value: '她已是重要合作者' },
      ],
    )
    expect(result).toContain('关系进展：阶段二')
    expect(result).toContain('当前认知：她已是重要合作者')
    expect(result).not.toMatch(/延续当前剧情|以本轮正文明确内容为准/)
  })

  it('parses compact bar fields separated by full-width pipes', () => {
    expect(extractStatusFields('关系进展：阶段一｜公开责任：完成晚宴｜私人立场：维持现状')).toEqual([
      { label: '关系进展', value: '阶段一' },
      { label: '公开责任', value: '完成晚宴' },
      { label: '私人立场', value: '维持现状' },
    ])
  })

  it('moves a prematurely emitted status block behind the story and keeps only the newest one', () => {
    const status = '<gts_status>心理：冷静</gts_status>'
    expect(moveStatusBlockToEnd(`${status}\n<scene>深夜｜书房</scene>\n他没有立刻回答。`, 'gts_status'))
      .toBe(`<scene>深夜｜书房</scene>\n他没有立刻回答。\n\n${status}`)
    expect(moveStatusBlockToEnd(`正文\n${status}\n${status}`, 'gts_status')).toBe(`正文\n\n${status}`)
  })

  it('hides complete and partial status blocks while a reply is still streaming', () => {
    expect(stripStatusBlocksForStreaming('正文。\n<gts_status>状态：正在写</gts_status>')).toBe('正文。')
    expect(stripStatusBlocksForStreaming('正文。\n<gts_status>状态：正在写')).toBe('正文。')
  })

  it('keeps only one final director status block', () => {
    const output = '<scene>夜晚｜大厅</scene>\n侍者停在门前。\n<gts_status>心理：不应显示</gts_status>\n<director_status>当前外部事件：递来邀请函</director_status>\n<director_status>当前外部事件：邀请函等待回应</director_status>'
    const normalized = normalizeDirectorStatusOutput(output)
    expect(normalized).not.toContain('gts_status')
    expect(normalized.match(/<director_status>/g)).toHaveLength(1)
    expect(normalized).toContain('邀请函等待回应')
  })
})

describe('stripLeadingSpeakerLabels', () => {
  it('removes repeated group speaker headings and their trailing separator', () => {
    expect(stripLeadingSpeakerLabels('【旁白】 ·\n【 旁白 】\n<scene>时间</scene>正文', ['旁白'])).toBe('<scene>时间</scene>正文')
  })

  it('only removes known participant names', () => {
    expect(stripLeadingSpeakerLabels('【时间】\n正文', ['旁白', '裴成砚'])).toBe('【时间】\n正文')
    expect(stripLeadingSpeakerLabels('[裴成砚]\n正文', ['旁白', '裴成砚'])).toBe('正文')
  })
})
