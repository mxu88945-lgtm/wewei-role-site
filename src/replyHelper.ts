import type { ChatApiMessage } from './chatApi'

export type ReplyHelperContext = {
  userName: string
  userDescription: string
  conversationTitle: string
  currentDraft?: string
  contextSummary?: string
  recentMessages: Array<{ author: string; text: string }>
  project?: {
    title: string
    worldBackground: string
    currentTime: string
    currentLocation: string
    relationshipStage: string
    presentCharacters: string[]
    publicEvidence: Array<{ title: string; detail: string }>
  }
}

export function buildReplyHelperMessages(context: ReplyHelperContext): ChatApiMessage[] {
  const project = context.project
  const scene = project ? `
【当前剧本安全切片】
项目：${project.title || '未命名剧本'}
公开背景：${project.worldBackground || '无额外公开背景'}
当前时间：${project.currentTime || '以最近对话为准'}
当前地点：${project.currentLocation || '以最近对话为准'}
当前在场：${project.presentCharacters.join('、') || '以最近对话为准'}
当前关系阶段：${project.relationshipStage || '沿用对话中已经形成的阶段'}
用户当前可使用的公开证据：${project.publicEvidence.length ? project.publicEvidence.map((item) => `${item.title}：${item.detail}`).join('；') : '仅使用对话中已经明确获知的信息'}` : ''

  return [
    {
      role: 'system',
      content: `你是“AI 帮答”，只替用户起草一条可编辑的下一句回复，不是剧情角色、旁白或导演。

【用户身份】
姓名：${context.userName || '用户'}
设定：${context.userDescription || '言行、心理与关键选择由用户本人决定。'}

硬性规则：
1. 只写${context.userName || '用户'}这一方可以发送的草稿；可以包含她本人的台词与轻量动作，但不得替其他角色、旁白或 NPC 新增台词、动作、心理、决定或反应。
2. 严格承接最后一条消息和当前场景，不重演旧场景，不跳时间地点，不续写对方收到草稿后的结果。
3. 只使用对话中用户已经亲历、看见、收到或被明确告知的信息；不得读取隐藏证据、导演计划、其他角色内心或未知事实，不得凭空补线索。
4. 不擅自替用户确认恋爱、原谅、复合、离开、赴约、相信某人、公开证据或作出其他重大决定。除非用户当前输入已经明确表达该决定，否则停在可继续选择的位置。
5. 保留人物拉扯与用户人设，避免客服腔、总结腔、解释规则和替用户变得过度温顺。不要写“你可以这样回复”等引导语。
6. 只输出一版可直接放入输入框的中文草稿，不加标题、代码块或前后说明。${scene}`,
    },
    {
      role: 'user',
      content: `【对话】${context.conversationTitle}
${context.contextSummary ? `【此前上下文摘要】\n${context.contextSummary}\n\n` : ''}【最近对话】
${context.recentMessages.map((message) => `${message.author}：${message.text}`).join('\n\n') || '暂无可参考消息'}
${context.currentDraft?.trim() ? `\n【用户已经写下的方向】\n${context.currentDraft.trim()}\n请保留这个意图并润色补全，不要擅自改成相反决定。` : '\n用户此刻没有思路，请根据最后一条消息起草一版留有选择余地的自然回应。'}`,
    },
  ]
}

export function cleanReplyHelperDraft(value: string) {
  return value
    .trim()
    .replace(/^```(?:text|markdown|md)?\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/^(?:AI\s*帮答|回复草稿|建议回复|可以这样回复)\s*[：:]\s*/i, '')
    .trim()
}
