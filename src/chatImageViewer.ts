/** v229：全屏看图（左右滑、双指缩放）的纯计算部分，组件在 ChatImageViewer.tsx。 */

export const VIEWER_MIN_SCALE = 1
export const VIEWER_MAX_SCALE = 4
/** 横向拖动超过画面宽度的这个比例就翻页。 */
export const VIEWER_SWIPE_RATIO = 0.18
/** 快速轻扫：速度超过这个值（px/ms）也翻页。 */
export const VIEWER_FLICK_SPEED = 0.45

export function clampViewerIndex(index: number, count: number) {
  if (count <= 0) return 0
  return Math.min(count - 1, Math.max(0, Math.round(index)))
}

export function clampViewerScale(scale: number) {
  if (!Number.isFinite(scale)) return VIEWER_MIN_SCALE
  return Math.min(VIEWER_MAX_SCALE, Math.max(VIEWER_MIN_SCALE, scale))
}

/** 松手时决定停在哪一张：拖够距离或轻扫够快就翻页，首尾不越界。 */
export function swipeTargetIndex(index: number, count: number, dragX: number, width: number, elapsedMs: number) {
  const speed = Math.abs(dragX) / Math.max(1, elapsedMs)
  const far = Math.abs(dragX) > Math.max(40, width * VIEWER_SWIPE_RATIO)
  const flick = Math.abs(dragX) > 24 && speed > VIEWER_FLICK_SPEED
  if (!far && !flick) return clampViewerIndex(index, count)
  return clampViewerIndex(index + (dragX < 0 ? 1 : -1), count)
}

/** 首尾再往外拉时加阻尼，提示没有更多。 */
export function resistedDrag(index: number, count: number, dragX: number) {
  const atStart = index <= 0 && dragX > 0
  const atEnd = index >= count - 1 && dragX < 0
  return atStart || atEnd ? dragX * 0.3 : dragX
}

/** 放大后平移不让图片拖出画面太远。 */
export function clampPan(offset: number, scale: number, size: number) {
  const limit = Math.max(0, (size * scale - size) / 2)
  return Math.min(limit, Math.max(-limit, offset))
}

export function viewerFileName(index: number, mime: string) {
  const ext = /png/i.test(mime) ? 'png' : /webp/i.test(mime) ? 'webp' : /gif/i.test(mime) ? 'gif' : 'jpg'
  return `weijing-image-${index + 1}.${ext}`
}
