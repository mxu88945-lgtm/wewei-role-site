import { useEffect, useState } from 'react'

/** iOS 键盘弹出时 fixed 弹层不跟着缩。键盘开着时返回可见区域 {top,height}，否则 null。 */
export function useVisibleViewportBox(enabled = true) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null)
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!enabled || !vv) { setBox(null); return }
    let frame = 0
    const measure = () => {
      frame = 0
      const full = Math.max(window.innerHeight, document.documentElement.clientHeight)
      const keyboard = vv.height < full * 0.8
      const next = keyboard ? { top: Math.round(vv.offsetTop), height: Math.round(vv.height) } : null
      setBox((cur) => (cur?.top === next?.top && cur?.height === next?.height) ? cur : next)
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure) }
    measure()
    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    return () => { if (frame) window.cancelAnimationFrame(frame); vv.removeEventListener('resize', schedule); vv.removeEventListener('scroll', schedule) }
  }, [enabled])
  return box
}
