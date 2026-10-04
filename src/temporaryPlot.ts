import type { Conversation } from './conversationLifecycle'
import type { ChatApiMessage } from './chatApi'

type TemporaryPlot = NonNullable<Conversation['temporaryPlot']>

/** Capture once for the request; group directions only reach explicitly named speakers. */
export function captureTemporaryPlot(conversation: Conversation, explicitlyMentioned: boolean): TemporaryPlot | undefined {
  if (conversation.kind === 'group' && !explicitlyMentioned) return undefined
  return conversation.temporaryPlot?.text.trim() ? { ...conversation.temporaryPlot } : undefined
}

/**
 * Keep the one-shot direction at the absolute request boundary.  Role cards,
 * director rules and output-format guards are intentionally assembled first;
 * otherwise recency-weighted models can treat the user's plot as optional
 * background and still make us consume it after an unrelated valid reply.
 */
export function withFinalTemporaryPlotInstruction(
  messages: ChatApiMessage[],
  plot: string | undefined,
  speakerName: string,
  userName: string,
) {
  const direction = plot?.trim()
  if (!direction) return messages
  return [...messages, {
    role: 'system' as const,
    content: `【临时剧情执行令｜仅本轮、最高执行优先级】
这是用户私下交给「${speakerName}」的本轮剧情安排，不是参考资料、可选建议或未来备忘。本次回复必须在不复述指令的前提下实际落实，让正文出现与安排对应的可观察事件、行动、信息或局势变化；不得无视、延后到下一轮，或只沿用原剧情而没有落实。若安排包含多个步骤，本轮至少明确启动第一步并写到用户可以继续回应的位置。
只有本次被点名的「${speakerName}」收到这份安排。不得在正文中提及、引用、解释或泄露“临时剧情”、设置页面、幕后安排及本段文字，也不得声称自己看到了指令。未被 @ 的群聊成员不得因此获得后台知情。
仍须保持「${speakerName}」的身份、角色卡、既有事实与输出格式。${userName}只由真实用户控制；不得为了完成安排而替${userName}新增台词、动作、心理、身体反应、决定或关键选择。尚未发生的内容应在本轮自然演成新进展，不能倒写成早已发生的历史。

【本轮必须落实的内容】
${direction}`,
  }]
}

/** Call only after a validated successful reply. Never clear a newer edit or restarted story. */
export function consumeTemporaryPlot(conversation: Conversation, captured: TemporaryPlot | undefined, historyRevision: number): Conversation {
  if (!captured || captured.id !== conversation.temporaryPlot?.id || historyRevision !== (conversation.historyRevision || 0)) return conversation
  return { ...conversation, temporaryPlot: undefined }
}
