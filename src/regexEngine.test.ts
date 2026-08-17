import { describe, expect, it } from 'vitest'
import type { Character, RegexScript } from './characterCard'
import { applyRegexScripts, stripPresentationalHtmlForPrompt } from './regexEngine'

const character = { name: '旁白' } as Character

function script(overrides: Partial<RegexScript>): RegexScript {
  return {
    id: 'test',
    scriptName: '测试',
    findRegex: '/^([\\s\\S]+)$/g',
    replaceString: '<div class="story-card">$1</div>',
    trimStrings: [],
    placement: [2],
    disabled: false,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
    ...overrides,
  }
}

describe('character-card regex boundaries', () => {
  it('keeps display-only HTML out of model history', () => {
    const result = applyRegexScripts('会议开始。', [script({})], character, '惟惟', 2, 'prompt')
    expect(result).toBe('会议开始。')
  })

  it('still applies an explicit prompt-only rule', () => {
    const promptRule = script({ findRegex: '秘密', replaceString: '约定', promptOnly: true })
    expect(applyRegexScripts('这个秘密', [promptRule], character, '惟惟', 2, 'prompt')).toBe('这个约定')
  })

  it('wraps a clean reply once but does not wrap existing presentational HTML again', () => {
    const wrapper = script({})
    expect(applyRegexScripts('会议开始。', [wrapper], character, '惟惟', 2, 'display')).toBe('<div class="story-card">会议开始。</div>')

    const existing = '<div class="old-story-card">会议开始。</div>'
    expect(applyRegexScripts(existing, [wrapper], character, '惟惟', 2, 'display')).toBe(existing)
  })

  it('uses the native chat bubble instead of the two built-in full-message wrappers', () => {
    const maleLeadWrapper = script({ id: 'pei-chengyan-story-card' })
    const directorWrapper = script({ id: 'pei-director-story-card' })

    expect(applyRegexScripts('裴成砚发言。', [maleLeadWrapper], character, '惟惟', 2, 'display')).toBe('裴成砚发言。')
    expect(applyRegexScripts('旁白推进。', [directorWrapper], character, '惟惟', 2, 'display')).toBe('旁白推进。')
  })

  it('renders incomplete status blocks as a compact fallback card', () => {
    const source = '正文。\n<gts_status>状态：本轮回应结束｜待回应：等待惟惟回应</gts_status>'
    const rendered = applyRegexScripts(source, [], character, '惟惟', 2, 'display')

    expect(rendered).toContain('class="weijing-status-card"')
    expect(rendered).toContain('状态更新')
    expect(rendered).toContain('状态：本轮回应结束｜待回应：等待惟惟回应')
    expect(rendered).not.toContain('<gts_status>')
    expect(applyRegexScripts(source, [], character, '惟惟', 2, 'prompt')).toBe(source)
  })

  it('renders custom status tags as a compact fallback card too', () => {
    const source = '正文。\n<czw_status>心理：正在核对文件\n动作：把文件夹推向惟惟</czw_status>'
    const rendered = applyRegexScripts(source, [], character, '惟惟', 2, 'display')

    expect(rendered).toContain('class="weijing-status-card"')
    expect(rendered).not.toContain('<czw_status>')
    expect(rendered).toContain('正在核对文件')
  })

  it('keeps a card-specific status panel when its exact format matches', () => {
    const exactStatus = script({
      findRegex: '/<gts_status>完整状态<\\/gts_status>/g',
      replaceString: '<section class="custom-status">完整状态</section>',
    })

    const rendered = applyRegexScripts('<gts_status>完整状态</gts_status>', [exactStatus], character, '惟惟', 2, 'display')
    expect(rendered).toBe('<section class="custom-status">完整状态</section>')
  })

  it('removes old card shells while preserving their visible text for history', () => {
    const nested = '<style>.card{padding:1rem}</style><div class="card">【旁白】<div>时间：12:35</div><p>会议开始。</p></div>'
    const result = stripPresentationalHtmlForPrompt(nested)
    expect(result).toContain('【旁白】')
    expect(result).toContain('时间：12:35')
    expect(result).toContain('会议开始。')
    expect(result).not.toContain('<div')
    expect(result).not.toContain('<style')
  })
})
