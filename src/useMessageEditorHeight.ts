import { useEffect, useState } from 'react'
import { messageEditorSheetHeight } from './messageEditorSize'

/** v247：主聊天和人格窗口共用的大编辑框高度——按 visualViewport 算，键盘开合时跟着变（见 messageEditorSize.ts）。 */
export function useMessageEditorHeight(open: boolean) {
  const [height, setHeight] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    let frame = 0
    const measure = () => {
      frame = 0
      const next = messageEditorSheetHeight(vv?.height ?? window.innerHeight, Math.max(window.innerHeight, document.documentElement.clientHeight, window.screen?.height || 0)).height
      setHeight((current) => current === next ? current : next)
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure) }
    measure()
    ;(window as Window & { __weijingApplyAppHeight?: () => void }).__weijingApplyAppHeight?.()
    vv?.addEventListener('resize', schedule)
    vv?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      vv?.removeEventListener('resize', schedule)
      vv?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [open])
  return height
}
