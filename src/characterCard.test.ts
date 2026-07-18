import { describe, expect, it } from 'vitest'
import { normalizeStoredCharacter, type Character } from './characterCard'

const baseCharacter: Partial<Character> = {
  id: 'pei-test',
  name: '裴成砚',
  creator: '周惟惟 × wk老公',
  characterVersion: '1.1 · 纯男主导演分工版',
  description: '过去她坦率追逐，他却把自己的动摇解释成厌烦与失序；而他真正的失控，将从发现她不再需要他开始。',
  personality: '慢热多疑、隐性病娇、掌控欲强。越被影响越先收紧边界，并把关注、维护、占有和不安解释成项目责任、家族立场或安全需要。',
  scenario: '杨颖开始察觉他的异常关注。',
  mesExample: '{{char}}：我不喜欢他靠你太近。',
  postHistoryInstructions: '先自检。',
  alternateGreetings: [],
  regexScripts: [],
  characterBook: {
    name: '裴成砚｜阶段锁与双线真相世界书',
    entries: [{
      id: 4, keys: [], secondary_keys: [], comment: '情感阶段锁', content: '阶段一允许烦躁。阶段二动摇与占有。', constant: true, selective: false,
      insertion_order: 15, enabled: true, position: 'before_char', use_regex: false, extensions: { position: 4, depth: 4, probability: 100, useProbability: true },
    }],
  },
}

describe('裴成砚连续情感进程迁移', () => {
  it('升级已有本地角色并保留角色 id', () => {
    const result = normalizeStoredCharacter(baseCharacter)
    const progress = result.characterBook?.entries.find((entry) => entry.comment.includes('情感进程参考'))

    expect(result.id).toBe('pei-test')
    expect(result.characterVersion).toContain('1.5')
    expect(result.personality).not.toContain('把关注、维护、占有和不安解释成')
    expect(result.mesExample).not.toContain('我不喜欢他靠你太近')
    expect(result.postHistoryInstructions).toContain('裴成砚情感进程校准 v4')
    expect(result.postHistoryInstructions).toContain('若已进入阶段二，不得重置为阶段一')
    expect(progress?.content).toContain('连续渐进，不锁阶段')
    expect(progress?.content).toContain('阶段二｜异样关注与认知动摇（当前可延续）')
    expect(progress?.content).toContain('不再输出阶段锚点数字')
    expect(progress?.position).toBe('after_char')
    expect(progress?.extensions.position).toBe(1)
    const npcIndex = result.characterBook?.entries.find((entry) => entry.comment.includes('角色分工与关系索引'))
    expect(npcIndex?.content).toContain('江叙川')
    expect(npcIndex?.content).toContain('杨颖')
    expect(npcIndex?.content).toContain('陆景澄由独立男二角色卡扮演')
    expect(npcIndex?.content).toContain('不以阶段编号作为许可门槛')
    expect(npcIndex?.constant).toBe(true)
    expect(npcIndex?.position).toBe('before_char')

    const normalizedAgain = normalizeStoredCharacter(result)
    expect(normalizedAgain.postHistoryInstructions.match(/裴成砚情感进程校准 v4/g)).toHaveLength(1)
    expect(normalizedAgain.characterBook?.entries.filter((entry) => entry.comment.includes('角色分工与关系索引'))).toHaveLength(1)
    expect(normalizedAgain.characterBook?.entries.find((entry) => entry.comment.includes('情感进程参考'))?.content).toBe(progress?.content)
  })

  it('迁移完成后尊重用户对进程世界书的修改', () => {
    const migrated = normalizeStoredCharacter(baseCharacter)
    const edited = {
      ...migrated,
      characterBook: {
        ...migrated.characterBook!,
        entries: migrated.characterBook!.entries.map((entry) => entry.comment.includes('情感进程参考 v4')
          ? { ...entry, content: `${entry.content}\n用户自定义补充：阶段二减少重复内耗。` }
          : entry),
      },
    }

    const normalizedAgain = normalizeStoredCharacter(edited)
    expect(normalizedAgain.characterBook?.entries.find((entry) => entry.comment.includes('情感进程参考 v4'))?.content)
      .toContain('用户自定义补充：阶段二减少重复内耗。')
  })

  it('会把旧的 v4 阶段锁迁移为连续进程并移除开场计数', () => {
    const legacyV4 = {
      ...baseCharacter,
      greeting: '开场。<status>线索追踪：旧项目尚未重启调查｜阶段锚点：0/3，尚无有效锚点</status>',
      characterBook: {
        ...baseCharacter.characterBook!,
        entries: [{
          ...baseCharacter.characterBook!.entries[0],
          comment: '最高优先级｜极慢热阶段状态机 v4',
          content: '阶段一默认锁定，占有欲需等门槛。禁止输出“缺少③”。',
        }],
      },
    }

    const result = normalizeStoredCharacter(legacyV4)
    expect(result.characterBook?.entries.find((entry) => entry.comment.includes('情感进程参考 v4'))?.content)
      .toContain('不是模型必须停留的权限门槛')
    expect(result.greeting).not.toContain('阶段锚点：0/3')
  })

  it('不会迁移其他角色', () => {
    const result = normalizeStoredCharacter({ ...baseCharacter, name: '其他角色', creator: '其他作者' })
    expect(result.characterVersion).toBe('1.1 · 纯男主导演分工版')
    expect(result.postHistoryInstructions).toBe('先自检。')
  })
})
