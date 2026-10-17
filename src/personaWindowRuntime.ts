import type { ApiConfig, ChatApiMessage } from './chatApi'
import { completeChat } from './chatApi'
import type { Character } from './characterCard'
import type { ChatImage } from './chatImages'
import { isApiChannelComplete } from './apiChannels'
import { buildChatPrompt } from './promptBuilder'
import { applyMacros } from './regexEngine'
import { personaReplyText, stripPersonaFormatInstructions } from './personaWindowPresentation'
import { AUTO_COMPRESSION_FAILURE_COOLDOWN_MS, planAutoContextCompression } from './contextCompression'
import {
  nextPersonaMessageId,
  parsePersonaMemoryCandidates,
  pendingPersonaMemoryMessages,
  personaCharacter,
  personaCompressedUntil,
  personaMemoriesForPrompt,
  personaMemoryExtractionPrompt,
  shouldExtractPersonaMemory,
  updatePersona,
  updatePersonaThread,
  activeThread,
  applyPersonaMemoryExtraction,
  PERSONA_MEMORY_BATCH,
  PERSONA_WINDOW_PRESET,
  PERSONA_FINAL_GUARD,
  type PersonaMessage,
  type PersonaThread,
  type PersonaWindow,
} from './personaWindow'
import { getPersonaState, setPersonaState } from './personaWindowStore'

/**
 * Generation, memory and compression for the 人格窗口. Module-level on purpose:
 * a reply keeps streaming into the store after she leaves the page.
 */
export type PersonaRuntimeDeps = {
  character: Character
  user: { name: string; description: string }
  api: ApiConfig
  memoryApi: ApiConfig
  temperature: number
  topP: number
  maxTokens: number
  streaming: boolean
  memoryLength: number
  /** Built lazily, read-only, only when the persona's 前世记忆 switch is on. */
  pastLife: () => string
  /** The same global worldbook the main story chat uses. */
  globalWorldbook?: string
  /** Story-project world / story cast background for this character (人设补充). */
  setting?: () => string
}

/**
 * generating / errors are keyed by window (thread) id, memoryBusy / notices by persona id
 * (memory belongs to the persona and is shared by all its windows).
 */
type RuntimeSnapshot = { generating: Record<string, boolean>; memoryBusy: Record<string, boolean>; errors: Record<string, string>; notices: Record<string, string> }
let runtime: RuntimeSnapshot = { generating: {}, memoryBusy: {}, errors: {}, notices: {} }
const runtimeListeners = new Set<() => void>()
const controllers = new Map<string, AbortController>()
const compressionRunning = new Set<string>()
const compressionFailures = new Map<string, number>()

function patchRuntime(patch: (current: RuntimeSnapshot) => RuntimeSnapshot) {
  runtime = patch(runtime)
  runtimeListeners.forEach((listener) => listener())
}
const setFlag = (field: 'generating' | 'memoryBusy', id: string, on: boolean) => patchRuntime((current) => {
  const next = { ...current[field] }
  if (on) next[id] = true
  else delete next[id]
  return { ...current, [field]: next }
})
export const setPersonaError = (id: string, message: string) => patchRuntime((current) => {
  const errors = { ...current.errors }
  if (message) errors[id] = message
  else delete errors[id]
  return { ...current, errors }
})
const setNotice = (id: string, message: string) => patchRuntime((current) => ({ ...current, notices: { ...current.notices, [id]: message } }))

export const subscribePersonaRuntime = (listener: () => void) => { runtimeListeners.add(listener); return () => { runtimeListeners.delete(listener) } }
export const getPersonaRuntime = () => runtime

const findPersona = (id: string) => getPersonaState().personas.find((item) => item.id === id)

export const PERSONA_MEMORY_INJECT = '以下是{{char}}在这扇独立窗口里与{{user}}相处留下的长期记忆，只属于这里：\n{{memories}}'

export function buildPersonaRequest(persona: PersonaWindow, history: PersonaMessage[], deps: PersonaRuntimeDeps, thread: Pick<PersonaThread, 'messages' | 'contextSummary' | 'compressedThroughId'> = activeThread(persona)): ChatApiMessage[] {
  const character = personaCharacter(deps.character)
  const compressedUntil = personaCompressedUntil(thread)
  const setting = deps.setting?.().trim() || ''
  const pastLife = persona.pastLifeEnabled !== false ? deps.pastLife().trim() : ''
  const messages = buildChatPrompt({
    mode: 'story',
    character,
    user: deps.user,
    messages: history.map((item) => ({ role: item.role, text: item.role === 'assistant' ? personaReplyText(item.text) : item.text, images: item.images })),
    preset: PERSONA_WINDOW_PRESET,
    globalWorldbook: stripPersonaFormatInstructions(deps.globalWorldbook || ''),
    // Inside the main system prompt, right after the card: who he is, then his own past.
    // This window's own memory follows it (after-main-prompt), so it wins on conflicts.
    storyProjectContext: [setting, pastLife].map(stripPersonaFormatInstructions).filter(Boolean).join('\n\n') || undefined,
    memory: { entries: personaMemoriesForPrompt(persona).map((item) => ({ ...item, content: personaReplyText(item.content) })), injectPosition: 'after-main-prompt', injectPrompt: PERSONA_MEMORY_INJECT },
    memoryLength: deps.memoryLength,
    contextSummary: compressedUntil > 0 ? personaReplyText(thread.contextSummary || '') : undefined,
    compressedUntil: compressedUntil > 0 ? compressedUntil : undefined,
  })
  messages.push({ role: 'system', content: applyMacros(PERSONA_FINAL_GUARD, character, deps.user.name) })
  if (!history.some((item) => item.role === 'user')) {
    messages.push({ role: 'user', content: applyMacros('（{{user}}推开了这扇只属于{{char}}的窗。）', character, deps.user.name) })
  }
  return consolidatePersonaMessages(messages)
}

const systemText = (message: ChatApiMessage) => typeof message.content === 'string' ? message.content : message.content.map((part) => part.type === 'text' ? part.text : '').join('\n')

/**
 * Many OpenAI-compatible relays (one-api/new-api → Claude/Gemini, some Gemini bridges) keep only the
 * FIRST system message as the real system prompt and drop or demote the rest. buildChatPrompt emits the
 * card's before_char lore first, so the 人设 / 预设 / 前世记忆 in the second system message never arrived.
 * Send exactly one leading system message with everything, and one reminder right before her last turn.
 */
export function consolidatePersonaMessages(messages: ChatApiMessage[]): ChatApiMessage[] {
  const firstTurn = messages.findIndex((item) => item.role !== 'system')
  const leadEnd = firstTurn < 0 ? messages.length : firstTurn
  const lead = messages.slice(0, leadEnd).map(systemText).filter((item) => item.trim())
  let rest = messages.slice(leadEnd)
  let tailStart = rest.length
  while (tailStart > 0 && rest[tailStart - 1].role === 'system') tailStart -= 1
  const tail = rest.slice(tailStart).map(systemText).filter((item) => item.trim())
  rest = rest.slice(0, tailStart)
  const result: ChatApiMessage[] = lead.length ? [{ role: 'system', content: lead.join('\n\n') }] : []
  const reminder: ChatApiMessage[] = tail.length ? [{ role: 'system', content: tail.join('\n\n') }] : []
  const last = rest[rest.length - 1]
  if (last?.role === 'user') result.push(...rest.slice(0, -1), ...reminder, last)
  else result.push(...rest, ...reminder)
  return result
}

/** Visible history for a request: no empty placeholders, no failed turns. */
const requestHistory = (messages: PersonaMessage[]) => messages.filter((item) => item.text.trim() || item.images?.length)

export async function generatePersonaReply(personaId: string, deps: PersonaRuntimeDeps, input: { text?: string; images?: ChatImage[]; regenerate?: boolean; threadId?: string } = {}) {
  const persona = findPersona(personaId)
  if (!persona) return
  const thread = activeThread(persona, input.threadId)
  if (!thread || runtime.generating[thread.id]) return
  const threadId = thread.id
  if (!isApiChannelComplete(deps.api)) { setPersonaError(threadId, '这个人格用的 API 还没配置完整：到 ••• → 模型 换一个渠道，或到 设置 → API 连接 填写。'); return }
  setPersonaError(threadId, '')
  let base = thread.messages
  if (input.regenerate) {
    const last = base[base.length - 1]
    if (last?.role === 'assistant') base = base.slice(0, -1)
  }
  const now = Date.now()
  const additions: PersonaMessage[] = []
  if ((input.text || '').trim() || input.images?.length) {
    additions.push({ id: nextPersonaMessageId(base), role: 'user', text: (input.text || '').trim(), createdAt: now, ...(input.images?.length ? { images: input.images } : {}) })
  }
  const withUser = [...base, ...additions]
  const replyId = nextPersonaMessageId(withUser)
  const placeholder: PersonaMessage = { id: replyId, role: 'assistant', text: '', createdAt: now }
  const history = requestHistory(withUser)
  const promptThread = { ...thread, messages: withUser }
  const touch = (state: Parameters<typeof updatePersona>[0], at: number) => updatePersona(state, personaId, (item) => ({ ...item, updatedAt: at }))
  setPersonaState((state) => touch(updatePersonaThread(state, personaId, threadId, (item) => ({ ...item, messages: [...withUser, placeholder], updatedAt: now })), now))
  const controller = new AbortController()
  controllers.set(threadId, controller)
  setFlag('generating', threadId, true)
  let output = ''
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  const writeReply = (text: string, extra: Partial<PersonaMessage> = {}, busy = true) => setPersonaState((state) => updatePersonaThread(state, personaId, threadId, (item) => ({
    ...item,
    messages: item.messages.map((message) => message.id === replyId ? { ...message, text, ...extra } : message),
  })), busy)
  const removeReply = () => setPersonaState((state) => updatePersonaThread(state, personaId, threadId, (item) => ({ ...item, messages: item.messages.filter((message) => message.id !== replyId) })))
  try {
    const result = await completeChat({
      api: deps.api,
      messages: buildPersonaRequest(persona, history, deps, promptThread),
      temperature: deps.temperature,
      topP: deps.topP,
      maxTokens: deps.maxTokens,
      streaming: deps.streaming,
      signal: controller.signal,
      onDelta: (delta) => {
        output += delta
        if (flushTimer !== null) return
        flushTimer = setTimeout(() => { flushTimer = null; writeReply(personaReplyText(output)) }, 80)
      },
    })
    if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null }
    const finalText = personaReplyText(output)
    if (!finalText) throw new Error('模型没有返回正文，换个说法再试一次。')
    writeReply(finalText, { finishReason: result.finishReason }, false)
    const done = Date.now()
    setPersonaState((state) => touch(updatePersonaThread(state, personaId, threadId, (item) => ({ ...item, updatedAt: done })), done))
    setTimeout(() => {
      void maybeExtractPersonaMemory(personaId, deps, threadId)
      void maybeCompressPersonaContext(personaId, deps, threadId)
    }, 1200)
  } catch (error) {
    if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null }
    const partial = personaReplyText(output)
    if (controller.signal.aborted) {
      if (partial) writeReply(partial, { finishReason: 'stop' }, false)
      else removeReply()
    } else {
      if (partial) writeReply(partial, { finishReason: 'error' }, false)
      else removeReply()
      setPersonaError(threadId, error instanceof Error ? error.message : '回复失败，请稍后再试。')
    }
  } finally {
    if (controllers.get(threadId) === controller) controllers.delete(threadId)
    setFlag('generating', threadId, false)
  }
}

export function stopPersonaReply(threadId: string) {
  controllers.get(threadId)?.abort()
}

type MemoryDeps = Pick<PersonaRuntimeDeps, 'character' | 'user' | 'memoryApi'>

async function extractThreadMemory(persona: PersonaWindow, thread: PersonaThread, deps: MemoryDeps) {
  const pending = pendingPersonaMemoryMessages(thread).slice(0, PERSONA_MEMORY_BATCH)
  if (pending.length < 2) return null
  const character = personaCharacter(deps.character)
  const transcript = pending.map((item) => `${item.role === 'user' ? deps.user.name : character.name}：${item.role === 'assistant' ? personaReplyText(item.text) : item.text}${item.images?.length ? `（附图 ${item.images.length} 张）` : ''}`).join('\n\n')
  // Dedupe against the persona's latest shared memory (another window may have just added some).
  const known = (findPersona(persona.id)?.memories || persona.memories).slice(-40).map((item) => `- ${item.title}：${item.content}`).join('\n') || '暂无'
  let raw = ''
  await completeChat({
    api: deps.memoryApi, temperature: .2, topP: 1, maxTokens: 3000, streaming: false, signal: new AbortController().signal,
    onDelta: (delta) => { raw += delta },
    messages: [
      { role: 'system', content: applyMacros(personaMemoryExtractionPrompt, character, deps.user.name) },
      { role: 'user', content: `角色：${character.name}\n用户：${deps.user.name}\n\n已有记忆（仅供查重）：\n${known}\n\n本次新增对话：\n${transcript}` },
    ],
  })
  const entries = parsePersonaMemoryCandidates(raw)
  if (entries === null) throw new Error('记忆整理结果无法读取')
  const throughId = pending[pending.length - 1].id
  setPersonaState((state) => applyPersonaMemoryExtraction(state, persona.id, entries, throughId, thread.id))
  return entries.length
}

/**
 * Summarize new turns into this persona's own (shared) memory. Each window keeps its own
 * cursor, so nothing is counted twice. Never touches any other persona or conversation.
 * Without a threadId (manual), every window with new turns is processed in turn.
 */
export async function extractPersonaMemory(personaId: string, deps: MemoryDeps, manual = false, threadId?: string) {
  const persona = findPersona(personaId)
  if (!persona || runtime.memoryBusy[personaId]) return
  const targets = (threadId ? persona.threads.filter((item) => item.id === threadId) : persona.threads)
    .filter((thread) => pendingPersonaMemoryMessages(thread).length >= 2)
  if (!targets.length) { if (manual) setNotice(personaId, '新增对话不足 2 条，暂时没有可整理的内容。'); return }
  if (!isApiChannelComplete(deps.memoryApi)) { if (manual) setNotice(personaId, '记忆 API 未配置完整（设置 → 长记忆，或这个人格的聊天渠道）。'); return }
  setFlag('memoryBusy', personaId, true)
  if (manual) setNotice(personaId, '正在整理记忆…')
  let added = 0
  try {
    for (const target of targets) {
      const latest = findPersona(personaId)?.threads.find((item) => item.id === target.id)
      if (!latest) continue
      added += (await extractThreadMemory(persona, latest, deps)) || 0
    }
    setNotice(personaId, added ? `已整理 ${added} 条新记忆（只属于这个人格，所有窗口共用）。` : '这一段没有需要长期记住的新内容。')
  } catch (error) {
    setNotice(personaId, `记忆整理失败：${error instanceof Error ? error.message : '请稍后再试'}`)
  } finally {
    setFlag('memoryBusy', personaId, false)
  }
}

export async function maybeExtractPersonaMemory(personaId: string, deps: PersonaRuntimeDeps, threadId?: string) {
  const persona = findPersona(personaId)
  if (!persona) return
  const thread = activeThread(persona, threadId)
  if (thread && shouldExtractPersonaMemory(persona, thread)) await extractPersonaMemory(personaId, deps, false, thread.id)
}

/** 后台上下文压缩（同长剧情规则：240 条触发，保留最近 max(96, 记忆长度) 条原文）。 */
export async function maybeCompressPersonaContext(personaId: string, deps: PersonaRuntimeDeps, threadId?: string) {
  const persona = findPersona(personaId)
  const thread = persona ? activeThread(persona, threadId) : undefined
  if (!persona || !thread || compressionRunning.has(thread.id) || !isApiChannelComplete(deps.api)) return
  const key = thread.id
  const lastFailure = compressionFailures.get(key)
  if (lastFailure && Date.now() - lastFailure < AUTO_COMPRESSION_FAILURE_COOLDOWN_MS) return
  const compressedUntil = personaCompressedUntil(thread)
  const plan = planAutoContextCompression(thread.messages, { compressedUntil, hasValidSummary: compressedUntil > 0, memoryLength: deps.memoryLength, isCompressible: (item) => Boolean(item.text.trim()) })
  if (!plan) return
  const startedThrough = thread.compressedThroughId
  const targetThroughId = thread.messages[plan.targetUntil - 1]?.id
  if (targetThroughId === undefined) return
  compressionRunning.add(key)
  const name = deps.character.name
  let summary = ''
  try {
    await completeChat({
      api: deps.api, temperature: .2, topP: 1, maxTokens: Math.min(3000, deps.maxTokens), streaming: false, signal: new AbortController().signal,
      onDelta: (delta) => { summary += delta },
      messages: [
        { role: 'system', content: '你是对话上下文压缩器。请输出一份完整、可替代旧原文的合并摘要，作为低优先级历史补充。只写已经发生或明确确认的事：两人聊过的事、约定、情绪转折、称呼与关系变化、对方的近况与喜好。新内容纠正旧摘要时以新内容为准。不得续写、不得虚构、不得解释任务。' },
        { role: 'user', content: `${compressedUntil > 0 && thread.contextSummary ? `已有摘要（请合并）：\n${thread.contextSummary}\n\n` : ''}本次新增待压缩对话：\n${plan.pendingMessages.map((item) => `${item.role === 'user' ? deps.user.name : name}：${item.role === 'assistant' ? personaReplyText(item.text) : item.text}`).join('\n\n')}` },
      ],
    })
    if (!summary.trim()) throw new Error('empty summary')
    setPersonaState((state) => updatePersonaThread(state, personaId, key, (item) => item.compressedThroughId === startedThrough && item.messages.some((message) => message.id === targetThroughId)
      ? { ...item, contextSummary: summary.trim(), compressedThroughId: targetThroughId }
      : item))
    compressionFailures.delete(key)
  } catch {
    compressionFailures.set(key, Date.now())
  } finally {
    compressionRunning.delete(key)
  }
}
