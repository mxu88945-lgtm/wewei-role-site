/**
 * v253：长剧情评测共用的请求拼装（原在 storyPromptBench.test 里；拆出来，别的评测 import 时不会把那边的用例再跑一遍）。只给测试 import。
 */
import type { ChatApiMessage } from './chatApi'
import type { Character } from './characterCard'
import type { LongMemoryEntry } from './memoryEngine'
import { buildChatPrompt, coreMemoryChunks } from './promptBuilder'
import { chunkScoringUnits } from './personaPastLifeRecall'
import { fakeCosine } from './fakeEmbedder.fixture'
import { foldPromptForRelay } from './promptTail'
import { estimateTokens } from './promptBudget'
import { filmCardInstruction, FILM_CARD_REMINDER } from './filmBlock'
import { getStatusProtocol } from './statusProtocol'
import { HISTORY_TOKEN_BUDGET } from './historyWindow'
import { longReplyHistory } from './historyWindowBench.fixture'
import { FIXTURE_NOW } from './personaPromptFixture'
import { storyBackstageNote, storyCharacter, storyContextSummary, storyCoreMemory, storyGlobalWorldbook, storyMemories, storyPreset, storyProjectContext, storyUser } from './storyPromptBench.fixture'

const textOf = (message: ChatApiMessage) => typeof message.content === 'string' ? message.content : message.content.map((part) => part.type === 'text' ? part.text : '').join('')

export function storyRequest(replyChars: number, options: { budget?: number; exchanges?: number; semantic?: boolean; latest?: string; coreMemory?: Character['characterMemory']; memories?: LongMemoryEntry[]; contextSummary?: string; dedupe?: boolean } = {}) {
  const history = longReplyHistory(options.exchanges ?? 60, replyChars, FIXTURE_NOW, options.latest).map((message) => ({ id: message.id, createdAt: message.createdAt, role: message.role, text: message.role === 'assistant' ? `<scene>时间：冬夜｜地点：书院</scene>\n${message.text}\n<status>\n好感度：70\n心理：……\n身体：无碍\n关系进展：暗生情愫\n</status>` : message.text }))
  const character = { ...storyCharacter, characterMemory: options.coreMemory ?? storyCoreMemory(FIXTURE_NOW) }
  const status = getStatusProtocol(character)
  const raw = buildChatPrompt({
    mode: 'story', character, user: storyUser, messages: history, preset: storyPreset, globalWorldbook: storyGlobalWorldbook,
    storyProjectContext, sceneContinuityAnchor: '【最新场景锚点】冬夜戌时，藏书楼，她刚推门进来。',
    memory: { entries: options.memories ?? storyMemories(FIXTURE_NOW), injectPosition: 'before-chat-history', injectPrompt: '{{memories}}' },
    memoryLength: 47, historyTokenBudget: options.budget ?? HISTORY_TOKEN_BUDGET, cacheLayout: true,
    contextSummary: options.contextSummary ?? storyContextSummary, compressedUntil: 20, dedupeMemory: options.dedupe,
    evictedRecall: { turn: history.filter((message) => message.role === 'user').length, ...(options.semantic ? (() => {
      const query = history[history.length - 1].text
      return {
        semantic: new Map(history.map((message) => [message.id, fakeCosine(query, message.text.slice(0, 600))])),
        coreSemantic: new Map(coreMemoryChunks(character, options.dedupe === false ? undefined : options.contextSummary ?? storyContextSummary).map((chunk) => [chunk.key, Math.max(...chunkScoringUnits(chunk).map((unit) => fakeCosine(query, unit.text)))])),
      }
    })() : {}) },
  })
  raw.push({ role: 'system', content: storyBackstageNote })
  raw.push({ role: 'system', content: `【最终输出结构校验】完成正文后必须检查：回复末尾有且只有一个闭合的 <${status.tag}>...</${status.tag}>。状态栏必须按卡片顺序逐项保留字段：${status.fields.join('、')}。` })
  const firstTurn = raw.findIndex((message) => message.role !== 'system')
  raw.splice(firstTurn, 0, { role: 'system', content: filmCardInstruction(character.name, storyUser.name, true, ['晴天', '稻香', '七里香', '夜曲', '告白气球']) })
  raw.push({ role: 'system', content: FILM_CARD_REMINDER })
  return { raw, wire: foldPromptForRelay(raw) }
}

/** 按块标题（【…】）把 system 内容拆开记 token；对话轮次单独记。 */
export function blockBreakdown(raw: ChatApiMessage[]) {
  const firstTurn = raw.findIndex((message) => message.role !== 'system')
  let lastTurn = -1
  raw.forEach((message, index) => { if (message.role !== 'system') lastTurn = index })
  const rows = new Map<string, number>()
  const add = (key: string, tokens: number) => rows.set(key, (rows.get(key) || 0) + tokens)
  raw.forEach((message, index) => {
    const text = textOf(message)
    if (message.role !== 'system') { add(index === lastTurn ? '她最新一句' : '最近原文（历史）', estimateTokens(text)); return }
    const where = index < firstTurn ? '稳定' : '尾巴'
    for (const part of text.split(/\n\n(?=【)/)) {
      const head = /^【([^】｜\n]{1,16})/.exec(part)?.[1] || '（无标题）'
      add(`${where}·${head}`, estimateTokens(part))
    }
  })
  return [...rows.entries()].sort((a, b) => b[1] - a[1])
}

