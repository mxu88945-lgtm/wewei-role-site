import type { Character } from './characterCard'
import type { Conversation, Message } from './conversationLifecycle'
import type { LongMemoryEntry } from './memoryEngine'

/**
 * 小手机：戏外日常群。角色卡们知道自己是惟境里的角色，用户是现实中陪他们
 * 对戏、扮演他们故事女主的人。聊天是微信式短句，不是小说正文。
 */
export type PhoneGroupConfig = {
  /** characterId → 这张卡绑定的过往对话 id（单聊或群聊） */
  bindings: Record<string, string>
}

const clip = (value: string | undefined, max: number) => {
  const text = (value || '').trim()
  return text.length > max ? `${text.slice(0, max)}……（后略）` : text
}

/** The card as it should speak in the phone group: persona kept, every story-mode output rule dropped. */
export function phoneCharacter(character: Character): Character {
  return {
    ...character,
    greeting: '',
    alternateGreetings: [],
    mesExample: '',
    systemPrompt: '',
    postHistoryInstructions: '',
    beautificationProtocol: '',
    regexScripts: [],
  }
}

/** 综合世界观：把每位成员的人设、背景、世界观原样拼进这个群的共用背景里。 */
export function buildPhoneGroupBackground(members: Character[]) {
  const blocks = members.map((member) => {
    const world = (member.characterBook?.entries || [])
      .filter((entry) => entry.enabled !== false && entry.content?.trim())
      .slice(0, 12)
      .map((entry) => `· ${entry.comment || (entry.keys || []).join('、') || '设定'}：${clip(entry.content, 600)}`)
      .join('\n')
    return [
      `【${member.name}${member.tagline ? `｜${member.tagline}` : ''}】`,
      member.description.trim() && `人物背景：\n${clip(member.description, 2400)}`,
      member.personality.trim() && `性格：\n${clip(member.personality, 1400)}`,
      member.scenario.trim() && `所在故事：\n${clip(member.scenario, 1200)}`,
      world && `所在世界观：\n${world}`,
    ].filter(Boolean).join('\n')
  })
  return `这是“小手机”群的综合世界观。群里每位成员都是惟境里的角色卡，各自来自不同的故事；以下是他们每个人的人设与世界观，群成员彼此都看得到。\n\n${blocks.join('\n\n')}`
}

export type PhoneArchiveSource = {
  character: Character
  conversation?: Conversation
  characterMemories: Array<{ title?: string; content: string; enabled?: boolean }>
  longMemories: LongMemoryEntry[]
}

const tail = (messages: Message[], names: (message: Message) => string, count: number) => messages
  .filter((message) => message.text?.trim())
  .slice(-count)
  .map((message) => `${names(message)}：${clip(message.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), 160)}`)
  .join('\n')

/** 每位成员绑定的“过往戏份档案”：对话摘要、长期记忆、角色记忆和最近几句。 */
export function buildPhoneArchive(sources: PhoneArchiveSource[], speakerId: string, userName: string, nameOf: (message: Message) => string) {
  const blocks = sources.map(({ character, conversation, characterMemories, longMemories }) => {
    if (!conversation) return `【${character.name}的剧情档案】还没有绑定过往对话。`
    const memories = [
      ...characterMemories.filter((entry) => entry.enabled !== false).map((entry) => `${entry.title ? `${entry.title}：` : ''}${entry.content}`),
      ...longMemories.map((entry) => `${entry.title ? `${entry.title}：` : ''}${entry.content}`),
    ].map((line) => `· ${clip(line, 400)}`).slice(0, 24).join('\n')
    const own = character.id === speakerId
    return [
      `【${character.name}的剧情档案｜来自对话「${conversation.title}」${own ? '｜这是你自己演过的戏' : ''}】`,
      conversation.contextSummary?.trim() && `剧情摘要：\n${clip(conversation.contextSummary, own ? 3000 : 1500)}`,
      memories && `记忆：\n${memories}`,
      `最近几句：\n${tail(conversation.messages, (message) => message.role === 'user' ? userName : nameOf(message), own ? 12 : 6)}`,
    ].filter(Boolean).join('\n')
  })
  return `【小手机｜成员剧情档案】\n你最熟悉自己的那份档案，可以随口聊自己的剧情、吐槽自己演过的事。别人的档案你知道存在：想聊别人的细节时，可以在群里“申请查阅”某人的聊天记录，对方答应或${userName}允许后再引用；没被查阅前别把别人的隐私细节当成自己早就知道。\n\n${blocks.join('\n\n')}`
}

export function phoneModeRules(speakerName: string, memberNames: string[], userName: string) {
  return `【小手机｜戏外日常群｜最高优先级】
这里不是剧情正文，是戏外的“小手机”群聊，像微信群一样。群成员：${memberNames.join('、')}，还有${userName}。
1. 你是惟境里的角色卡「${speakerName}」，你清楚自己是角色，也记得自己在惟境里演过的故事；${userName}是现实里陪你们对戏、扮演你们故事女主的人，你们口中的“女主”就是她在演。
2. 本轮你只以「${speakerName}」的身份发消息。保持自己的人设、语气和脾气，但现在是休闲日常：可以聊天、吐槽、互怼、聊自己的剧情、评价别人和${userName}演的戏。
3. 用微信聊天的写法：短句、口语，一次 1—4 条短消息，每条单独一行，每条一般不超过 40 字。可以用很少的（括号）写一个小动作或表情，偶尔可以有一句情景发言，但禁止写成小说正文、长段旁白和心理描写。
4. 不输出 <scene>、<gts_status>、状态栏、场景栏、HTML 或任何标签。不加自己的名字前缀。
5. 不替${userName}或其他成员发言、做决定。被 @ 时优先回应 @ 你的那条；别人刚说过的话可以接、可以怼，但不要重复别人的话。`
}

export function phoneBindingCandidates(conversations: Conversation[], characterId: string) {
  return conversations
    .filter((item) => !item.phone && (item.characterId === characterId || item.participantIds?.includes(characterId)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
