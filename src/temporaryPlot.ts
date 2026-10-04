import type { Conversation } from './conversationLifecycle'
import type { ChatApiMessage } from './chatApi'

type TemporaryPlot = NonNullable<Conversation['temporaryPlot']>

/** Capture once for the request; group directions only reach explicitly named speakers. */
export function captureTemporaryPlot(conversation: Conversation, explicitlyMentioned: boolean, speakerId?: string): TemporaryPlot | undefined {
  if (conversation.kind === 'group' && !explicitlyMentioned) return undefined
  if (conversation.temporaryPlot?.recipientIds !== undefined && (!speakerId || !conversation.temporaryPlot.recipientIds.includes(speakerId))) return undefined
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
  mode: TemporaryPlot['mode'] = 'once',
  director = false,
) {
  const direction = plot?.trim()
  if (!direction) return messages
  return [...messages, {
    role: 'system' as const,
    content: `【临时剧情执行令｜${mode === 'once' ? '仅本轮' : '持续幕后方向'}、最高执行优先级】
这是用户私下交给「${speakerName}」的${mode === 'once' ? '本轮剧情安排' : '持续剧情方向'}，不是参考资料、可选建议或未来备忘。本次回复必须在不复述指令的前提下实际落实，让正文出现与安排对应的可观察事件、行动、信息或局势变化；不得无视、延后到下一轮，或只沿用原剧情而没有落实。${mode === 'once' ? '若安排包含多个步骤，本轮至少明确启动第一步并写到用户可以继续回应的位置。' : '每次沿最新进展推进一个自然步骤，已发生的来电、登场、发现或完成事件不得重复触发；持续风格和节奏要求继续维持，已完成的事件只保留结果，不重新演一遍。'}
只有本次被点名的「${speakerName}」收到这份安排。不得在正文中提及、引用、解释或泄露“临时剧情”、设置页面、幕后安排及本段文字，也不得声称自己看到了指令。未被 @ 的群聊成员不得因此获得后台知情。
仍须保持「${speakerName}」的身份、角色卡、既有事实与输出格式。${userName}只由真实用户控制；不得为了完成安排而替${userName}新增台词、动作、心理、身体反应、决定或关键选择。尚未发生的内容应在本轮自然演成新进展，不能倒写成早已发生的历史。
${director ? '你本轮是旁白导演：必须把安排转成权限内的环境、外部事件或无独立卡 NPC 行动。配角发起来电、门外来访、消息送达均可推进；停在铃声、来电显示或送达节点，不替独立角色接听、答应、回应或决定。安排中的通话内容可作为 NPC 的来意，但尚未接听不能直接写成主角已知。旧剧情中的拒绝婚约或切断某条专线，不等于禁止本轮一切新来电；在已有事实允许的渠道推进，不能把旧的阻断状态当作已经落实新安排。若确无合法渠道，不得编造已经发生或擅自恢复已毁设施。' : ''}

【本轮必须落实的内容】
${direction}`,
  }]
}

/** Repair guards must not displace the active private direction at the end. */
export function withAssistantRetryInstruction(messages: ChatApiMessage[], content: string, hasTemporaryPlot: boolean) {
  const at = hasTemporaryPlot ? Math.max(0, messages.length - 1) : messages.length
  return [...messages.slice(0, at), { role: 'system' as const, content }, ...messages.slice(at)]
}

/** Call only after a validated successful reply. Never clear a newer edit or restarted story. */
export function consumeTemporaryPlot(conversation: Conversation, captured: TemporaryPlot | undefined, historyRevision: number): Conversation {
  if (!captured || captured.id !== conversation.temporaryPlot?.id || historyRevision !== (conversation.historyRevision || 0)) return conversation
  if (captured.mode === 'persistent') return conversation
  if (captured.mode === 'counted') {
    // A group send may produce several replies from the same captured draft.
    // Count it once, not once per actor; a later successful send captures anew.
    if (captured.remainingUses !== conversation.temporaryPlot.remainingUses) return conversation
    const remainingUses = Math.max(0, (captured.remainingUses || 1) - 1)
    return { ...conversation, temporaryPlot: remainingUses ? { ...conversation.temporaryPlot, remainingUses } : undefined }
  }
  return { ...conversation, temporaryPlot: undefined }
}
