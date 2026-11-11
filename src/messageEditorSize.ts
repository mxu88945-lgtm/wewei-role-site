/**
 * v204：消息「编辑改写 / 编辑后重新发送」窗口要大（「重新编写的窗口，小的可怜」）。
 * iOS 键盘弹出时 vh/dvh 不跟着变，所以按 visualViewport 的高度算，写成内联 height。
 * - 键盘开着：几乎占满键盘上方的可见区域（CSS 的 max-height 再扣掉顶部安全区和底边 10px）。
 * - 键盘收着：约屏幕的 72%。
 */
export function messageEditorSheetHeight(visibleHeight: number, layoutHeight: number): { height: number; keyboard: boolean } {
  const vv = Math.max(0, Math.round(visibleHeight || 0))
  const full = Math.max(vv, Math.round(layoutHeight || 0))
  const keyboard = full > 0 && vv < full * 0.8
  if (keyboard) return { height: Math.max(220, vv - 24), keyboard }
  return { height: Math.max(320, Math.round(full * 0.72)), keyboard }
}
