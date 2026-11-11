/**
 * v207：主题 → 消息怎么排。和主聊天（App.tsx 渲染消息处）同一套规则，人格窗口直接复用，
 * 这样 theme-*.css 里写给主聊天的消息样式（archive-row / paper / 气泡）在人格窗口里也能命中。
 * - 档案类主题（秋日批注、青橙唱片、白笺通讯、雾白来信、雾蓝长笺、暗夜流光）：archive-row + 档案头，正文平铺。
 * - 雾蓝纸笺 / 莓红剪贴簿：正文走 paper 渲染。
 * - 其他主题：跟随「显示与回复」里的气泡 / 平铺。
 */
import type { ArchiveTheme } from './ArchiveHeading'

export const ARCHIVE_THEMES = ['academy', 'vinyl', 'mobile', 'letter', 'mistnote', 'nightglow'] as const
export type ChatMessageTheme = boolean | 'scrapbook' | ArchiveTheme

export type MessageThemeLayout = { archive: ArchiveTheme | null; paper: ChatMessageTheme; layout: 'bubble' | 'flat'; rowClass: string }

export function messageThemeLayout(mode: string, chatLayout: 'bubble' | 'flat', role: 'user' | 'assistant' = 'assistant'): MessageThemeLayout {
  const archive = (ARCHIVE_THEMES as readonly string[]).includes(mode) ? mode as ArchiveTheme : null
  const paper: ChatMessageTheme = archive || (mode === 'scrapbook' ? 'scrapbook' : mode === 'paper')
  const layout = archive ? 'flat' : chatLayout
  // 行上的 message-layout-* 跟主聊天一样用她的设置（档案主题的正文才强制平铺）。
  return { archive, paper, layout, rowClass: `message-row ${role} message-layout-${chatLayout}${archive ? ` archive-row archive-${archive}` : ''}` }
}
