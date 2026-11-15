/**
 * v252 守护：长剧情「本会话角色核心记忆」不再整份每轮重发——较新/进行中的整条，较早的只列要点（结论还在），
 * 细节按需召回（最多 2 段约 1200 字，只进尾巴）。10 件较早的事能问回来；10 句普通的话不多带。
 */
import { describe, expect, it } from 'vitest'
import type { Character, CharacterMemoryEntry } from './characterCard'
import { characterMemoryPrompt, planCharacterMemory, CORE_MEMORY_FULL_BUDGET } from './characterMemory'
import { buildChatPrompt, CORE_RECALL_HEADER } from './promptBuilder'
import { foldPromptForRelay } from './promptTail'
import { fixtureCharacter, fixtureUser } from './personaPromptFixture'
import { ORDINARY } from './historyWindowBench.fixture'
import { chunkScoringUnits } from './personaPastLifeRecall'
import { coreMemoryChunks } from './promptBuilder'
import { fakeCosine } from './fakeEmbedder.fixture'

const OLD_FACTS: [string, string, string, string][] = [
  ['青铜钥匙', '她在藏书楼暗格里找到一把青铜钥匙，交给了他保管。', '那把青铜钥匙你放哪了', '暗格'],
  ['柳先生的身世', '柳先生其实是前朝乐师之女，这件事只有他知道。', '柳先生到底是什么来历', '前朝乐师'],
  ['沈霁的遗物', '他把副将沈霁留下的半截断剑埋在了后山桃树下。', '沈霁那把断剑后来怎么样了', '桃树'],
  ['冬至灯会', '冬至那晚两人在城里看了灯会，他给她买了一盏鲤鱼灯。', '冬至灯会那晚你还记得吗', '鲤鱼灯'],
  ['胖婶的秘方', '胖婶把桂花糖藕的秘方偷偷教给了她。', '胖婶教我的桂花糖藕要怎么做来着', '秘方'],
  ['林栖的婚事', '林栖和城东绸缎庄的二小姐定了亲。', '林栖定亲的是哪家姑娘', '绸缎庄'],
  ['北境来信', '北境旧部来信请他回去主持军务，他拒绝了。', '之前北境来信让你回去，你怎么回的', '拒绝'],
  ['玄凤阿九', '她养的玄凤阿九学会了喊他的名字。', '阿九现在还会喊你名字吗', '阿九'],
  ['太子来访', '太子微服来书院，想拉拢他，被他婉拒。', '太子上次来书院找你干什么', '婉拒'],
  ['山门石狮', '她在山门左边石狮子底下刻了两人名字的缩写。', '山门石狮子上刻的字还在吗', '缩写'],
]

const NOW = new Date(2026, 10, 13, 21, 30).getTime()
const entry = (index: number, title: string, content: string, status: CharacterMemoryEntry['status'] = 'confirmed'): CharacterMemoryEntry => ({ id: `c${index}`, title, content, category: 'fact', status, enabled: true, createdAt: NOW - (100 - index) * 3600_000, updatedAt: NOW })

/** 10 件较早的事 + 后面一批较新的长条目（把较早的挤出整条区，只剩要点）。 */
function character(): Character {
  const filler = Array.from({ length: 24 }, (_, index) => entry(20 + index, `近况${index}`, `最近的一件小事（第 ${index} 件）：两人在书院里一起温书、喝茶、听雨，说了很多零碎的话，彼此都更熟悉了一些。`.repeat(2)))
  return { ...fixtureCharacter, characterMemory: [...OLD_FACTS.map(([title, content], index) => entry(index, title, content)), entry(15, '琴谱失窃', '柳先生的琴谱在西厢失窃，正在查。', 'ongoing'), ...filler] }
}

function tailFor(text: string, semantic = false) {
  const c = character()
  const messages = [{ id: 1, role: 'user' as const, text: '今天书院好安静。' }, { id: 2, role: 'assistant' as const, text: '他合上书，抬眼看她。' }, { id: 3, role: 'user' as const, text }]
  const coreSemantic = semantic ? new Map(coreMemoryChunks(c).map((chunk) => [chunk.key, Math.max(...chunkScoringUnits(chunk).map((unit) => fakeCosine(text, unit.text)))])) : undefined
  const wire = foldPromptForRelay(buildChatPrompt({ mode: 'story', character: c, user: fixtureUser, messages, preset: '', globalWorldbook: '', memory: { entries: [], injectPosition: 'before-chat-history', injectPrompt: '{{memories}}' }, memoryLength: 47, cacheLayout: true, evictedRecall: { turn: 2, coreSemantic } }))
  const last = String(wire[wire.length - 1].content)
  const at = last.indexOf(CORE_RECALL_HEADER)
  return { stable: String(wire[0].content), tail: at < 0 ? '' : last.slice(at).split('\n\n【')[0] }
}

describe('v252 核心记忆：要点常驻 + 按需召回', () => {
  it('进行中的永远整条；较早的只列要点，不丢条目', () => {
    const c = character()
    const plan = planCharacterMemory(c)
    expect(plan.full.some((item) => item.status === 'ongoing')).toBe(true)
    expect(plan.indexed.length).toBeGreaterThanOrEqual(8)
    const prompt = characterMemoryPrompt(c, { fullBudget: CORE_MEMORY_FULL_BUDGET })
    for (const [title] of OLD_FACTS) expect(prompt).toContain(title)
    expect(prompt).toContain('柳先生的琴谱在西厢失窃，正在查。')
    // 旧口径（小手机/导演）不变
    expect(characterMemoryPrompt(c)).toContain(OLD_FACTS[0][1])
  })

  it('10 件较早的事能问回原文（纯线索 / 混合）；10 句普通的话都不多带', () => {
    for (const semantic of [false, true]) {
      const indexed = new Set(planCharacterMemory(character()).indexed.map((item) => item.title))
      const asked = OLD_FACTS.filter(([title]) => indexed.has(title))
      const missed = asked.filter(([, , ask, marker]) => !tailFor(ask, semantic).tail.includes(marker))
      const hits = asked.length - missed.length
      if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.MEASURE) missed.forEach(([, , ask]) => console.log('  漏召', ask))
      const falses = ORDINARY.filter((line) => tailFor(line, semantic).tail).length
      if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.MEASURE) ORDINARY.forEach((line) => { const t = tailFor(line, semantic).tail; if (t) console.log('  误召', line, t.slice(60, 260).replace(/\n/g,' ')) })
      if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.MEASURE) console.log(`核心记忆召回（${semantic ? '混合' : '纯线索'}）：命中 ${hits}/${asked.length} 误召 ${falses}/10`)
      expect(hits).toBeGreaterThanOrEqual(asked.length - 1)
      expect(falses).toBe(0)
      for (const [, , ask] of OLD_FACTS) expect(tailFor(ask, semantic).tail.length).toBeLessThanOrEqual(1200)
    }
  })
})
