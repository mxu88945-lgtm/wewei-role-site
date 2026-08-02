export type ConversationTxtMessage = { author: string; text: string }

export type ParsedConversationTxt = {
  title: string
  participantNames: string[]
  userName: string
  messages: ConversationTxtMessage[]
}

const HEADER_BREAK = /\n\s*\n/
const MESSAGE_BREAK = /\n\s*\n-{10,}\n\s*\n/

export function parseConversationTxt(value: string): ParsedConversationTxt {
  const normalized = value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  const headerEnd = normalized.search(HEADER_BREAK)
  if (headerEnd < 0) throw new Error('没有找到惟境对话 TXT 的标题信息。')
  const header = normalized.slice(0, headerEnd).split('\n').map((line) => line.trim()).filter(Boolean)
  const body = normalized.slice(headerEnd).trim()
  const title = header[0] || ''
  const participantLine = header.find((line) => line.startsWith('角色：'))
  const userLine = header.find((line) => line.startsWith('用户：'))
  const participantNames = participantLine?.slice('角色：'.length).split(/[、，,]/).map((name) => name.trim()).filter(Boolean) || []
  const userName = userLine?.slice('用户：'.length).trim() || ''
  if (!title || !participantNames.length || !userName) throw new Error('TXT 缺少对话标题、角色或用户信息。')

  const messages = body.split(MESSAGE_BREAK).map((block) => {
    const newline = block.indexOf('\n')
    if (newline < 1) throw new Error('TXT 中有一条消息缺少作者或正文。')
    return { author: block.slice(0, newline).trim(), text: block.slice(newline + 1).trim() }
  }).filter((message) => message.author && message.text)
  if (!messages.length) throw new Error('TXT 中没有可导入的消息。')
  return { title, participantNames, userName, messages }
}
