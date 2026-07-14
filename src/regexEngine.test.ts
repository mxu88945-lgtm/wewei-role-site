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
