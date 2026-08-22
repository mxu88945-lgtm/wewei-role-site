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

describe('顾霆深累计阶段判定迁移', () => {
  const legacyGu: Partial<Character> = {
    id: 'gu-existing-chat',
    name: '顾霆深',
    creator: '周惟惟 × 伯恩',
    characterVersion: '1.3 · 惟境V3分享版｜不对称协议逻辑与角色自主修订',
    systemPrompt: '严格执行五阶段硬门槛。阶段一爱意值固定为0%。',
    postHistoryInstructions: '延续已有事实与当前关系阶段。',
    alternateGreetings: [],
    regexScripts: [],
    characterBook: {
      name: '顾霆深世界书',
      entries: [
        {
          id: 9, keys: [], secondary_keys: [], comment: '感情阶段与硬门槛',
          content: '阶段一。进入阶段二的硬条件共四项。阶段二。进入阶段三的硬条件共四项。',
          constant: true, selective: false, insertion_order: 9, enabled: true,
          position: 'after_char', use_regex: false, extensions: {},
        },
        {
          id: 13, keys: [], secondary_keys: [], comment: '每轮固定场景栏与状态栏',
          content: '- **关系阶段：** 只能在满足角色卡硬条件后升级；\n其他自定义内容保留。',
          constant: true, selective: false, insertion_order: 13, enabled: true,
          position: 'after_char', use_regex: false, extensions: {},
        },
      ],
    },
  }

  it('保留角色与会话 id，并为旧存档追加回溯校准', () => {
    const result = normalizeStoredCharacter(legacyGu)
    const progression = result.characterBook?.entries.find((entry) => entry.comment === '感情阶段与累计判定')

    expect(result.id).toBe('gu-existing-chat')
    expect(result.characterVersion).toContain('1.4')
    expect(result.systemPrompt).toContain('阶段累计与旧存档校准 v1.4')
    expect(result.postHistoryInstructions).toContain('回溯全部已有事实')
    expect(progression?.content).toContain('原四项条件任意满足两项即升级')
    expect(progression?.content).toContain('当前阶段不得低于阶段三·旧秩序裂缝')
    expect(result.characterBook?.entries[1].content).toContain('达到升级阈值后必须立即更新')
    expect(result.characterBook?.entries[1].content).toContain('其他自定义内容保留')
  })

  it('迁移可重复执行且不会重复追加校准规则', () => {
    const once = normalizeStoredCharacter(legacyGu)
    const twice = normalizeStoredCharacter(once)
    const serialized = JSON.stringify(twice)

    expect(serialized.match(/阶段累计与旧存档校准 v1\.4/g)?.length).toBe(3)
    expect(twice.id).toBe('gu-existing-chat')
  })

  it('不修改同名但没有该阶段世界书的其他角色', () => {
    const result = normalizeStoredCharacter({
      id: 'other-gu', name: '顾霆深', characterVersion: '用户自定义版',
      systemPrompt: '用户自己的规则。', alternateGreetings: [], regexScripts: [],
    })

    expect(result.characterVersion).toBe('用户自定义版')
    expect(result.systemPrompt).toBe('用户自己的规则。')
  })
})

describe('角色卡世界书字段兼容', () => {
  it('导入省略可选 V3 字段的 NPC 条目时仍能打开编辑器', () => {
    const importedBook = {
      name: '顾氏旧宅世界书',
      entries: [{
        id: 7,
        comment: '顾知微｜NPC',
        keys: [],
        content: '顾知微是现场的记录员。',
        constant: true,
        enabled: true,
        position: 'before_char',
        insertion_order: 20,
        extensions: { depth: 4 },
      }],
    } as unknown as Character['characterBook']

    const result = normalizeStoredCharacter({ name: '顾氏旧宅·原谱审查导演', characterBook: importedBook })
    const entry = result.characterBook?.entries[0]

    expect(entry?.secondary_keys).toEqual([])
    expect(entry?.selective).toBe(false)
    expect(entry?.use_regex).toBe(false)
    expect(entry?.extensions).toEqual(expect.objectContaining({ depth: 4, probability: 100, useProbability: false }))
  })
})

describe('角色卡正则展示兼容', () => {
  it('导入旧卡时也会修正浅色正文和错误运行位置', () => {
    const result = normalizeStoredCharacter({
      name: '周肆野',
      regexScripts: [{
        id: 'zhou-opening', scriptName: '开场气泡美化', findRegex: '/^([\\s\\S]+)$/',
        replaceString: '<div style="color:#d1d5db"><p style="color:#e2e8f0">$1</p></div>',
        placement: [3],
      } as unknown as Character['regexScripts'][number]],
    })

    expect(result.regexScripts[0].placement).toEqual([2])
    expect(result.regexScripts[0].replaceString).toContain('var(--chat-text-color, #000000)')
    expect(result.regexScripts[0].replaceString).not.toContain('#d1d5db')
  })
})

describe('星轨独立卡自主角色迁移', () => {
  const entry = (id: number, comment: string, content: string) => ({
    id, keys: [], secondary_keys: [], comment, content, constant: true, selective: false,
    insertion_order: id, enabled: true, position: 'before_char', use_regex: false, extensions: {},
  })

  it('让陆星屹真正收不到后台身份，并删除延迟秘密答案', () => {
    const result = normalizeStoredCharacter({
      id: 'xingyi', name: '陆星屹', creator: '惟镜独立卡', characterVersion: '1.0 · 2126青春多男主线',
      description: '本卡中，{{user}}默认是裴允茉。她是裴家小小姐，也是陆景衡心仪的人。',
      scenario: '他不知道真相。', systemPrompt: '他不知道寒砚。', postHistoryInstructions: '假装不知道。',
      tags: ['陆星屹'], alternateGreetings: [], regexScripts: [],
      characterBook: { name: '陆星屹世界书', entries: [
        entry(1, '最高优先级｜用户主权与信息差', '裴允茉是用户。'),
        entry(5, '延迟触发｜裴允茉身份与哥哥心意', '裴家小小姐，哥哥心仪的人。'),
        entry(6, '延迟触发｜寒砚秘密', '寒砚是AL-01。'),
      ] },
    })

    const serialized = JSON.stringify(result)
    expect(result.id).toBe('xingyi')
    expect(result.tags).toContain('后台身份隔离')
    expect(result.characterVersion).toContain('自主角色版')
    expect(result.tags).toContain('角色自主')
    expect(result.description).toContain('陌生女人')
    expect(result.systemPrompt).toContain('可以先行动')
    expect(result.systemPrompt).not.toContain('先写出陆星屹的动作意图并停下')
    expect(serialized).not.toContain('裴家小小姐')
    expect(serialized).not.toContain('哥哥心仪的人')
    expect(serialized).not.toContain('寒砚是AL-01')

    const edited = { ...result, description: `${result.description}\n用户自定义：他特别记仇。` }
    expect(normalizeStoredCharacter(edited).description).toContain('用户自定义：他特别记仇。')
  })

  it('移除哥哥、青梅与寒砚卡中本不该提前出现的答案条目', () => {
    const cases = [
      ['陆景衡', '延迟触发｜秘密仿生人'],
      ['秦晚棠', '延迟触发｜秘密科技线'],
      ['寒砚｜代号：AL-01', '延迟触发｜潜在竞争关系'],
    ] as const

    for (const [name, hiddenComment] of cases) {
      const result = normalizeStoredCharacter({
        name, creator: '惟镜独立卡', characterVersion: '1.0 · 2126青春多男主线',
        alternateGreetings: [], regexScripts: [],
        characterBook: { name: `${name}世界书`, entries: [entry(1, '公开设定', '公开事实。'), entry(2, hiddenComment, '后台答案。')] },
      })
      expect(result.characterVersion).toContain('自主角色版')
      expect(result.characterBook?.entries.map((item) => item.comment)).not.toContain(hiddenComment)
      expect(JSON.stringify(result.characterBook)).not.toContain('后台答案')
    }
  })

  it('把寒砚从客服式许可模型迁移成会主动行动并承担后果的角色', () => {
    const result = normalizeStoredCharacter({
      name: '寒砚｜代号：AL-01', creator: '惟镜独立卡', characterVersion: '1.0 · 2126仿生人线',
      greeting: '寒砚等待{{user}}授权。<gts_status>状态：休眠｜隐藏信息：陆星屹会成为竞争者｜待回应：授权</gts_status>',
      systemPrompt: '涉及亲密动作，先写动作意图并停下。若{{user}}拒绝，立即停止并退回安全距离。',
      postHistoryInstructions: '回复前确认{{user}}是否允许。',
      alternateGreetings: ['是否需要我靠近？<gts_status>状态：等待｜隐藏信息：后台答案｜待回应：允许</gts_status>'],
      regexScripts: [],
      characterBook: { name: '寒砚世界书', entries: [
        entry(1, '最高优先级｜用户主权', '必须先获得允许。'),
        entry(5, '延迟触发｜潜在竞争关系', '后台答案。'),
      ] },
    })

    expect(result.characterVersion).toContain('自主角色版')
    expect(result.greeting).toContain('扣住她的手腕')
    expect(result.systemPrompt).toContain('不使用“是否需要”“是否允许”“请授权”等客服式语言')
    expect(result.postHistoryInstructions).toContain('不在亲密动作前自动停成意图说明')
    expect(result.systemPrompt).not.toContain('先写动作意图并停下')
    expect(result.alternateGreetings.join('')).not.toContain('隐藏信息')
    expect(result.characterBook?.entries.map((item) => item.comment)).not.toContain('延迟触发｜潜在竞争关系')
  })

  it('清理旧开场状态栏里的隐藏答案与客服式退让示例', () => {
    const result = normalizeStoredCharacter({
      name: '陆景衡', creator: '惟镜独立卡', characterVersion: '1.0 · 2126青春多男主线',
      greeting: '重逢。<gts_status>状态：平静｜隐藏信息：弟弟不知道她的身份｜待回应：见面</gts_status>',
      mesExample: '也正因为你把我当成可以依靠的人，我才更不能把自己的想法塞给你。\n他将手边的水杯推近一点，随后收回手，给她留下足够的空间。\n“你需要我，我就在。你不需要的时候，我也会记得先敲门。”',
      alternateGreetings: [], regexScripts: [],
    })

    expect(result.greeting).not.toContain('隐藏信息')
    expect(result.greeting).not.toContain('弟弟不知道')
    expect(result.mesExample).not.toContain('先敲门')
    expect(result.mesExample).toContain('不会替你把我的位置永远定成哥哥')
  })
})
