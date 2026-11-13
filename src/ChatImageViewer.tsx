/**
 * v229：全屏看图。一条消息里的几张图左右滑切换，顶部「1 / 2」，双指缩放（双击放大/还原），
 * 右上角关闭、保存/分享，点空白处关闭。不用 backdrop-filter。
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { clampPan, clampViewerIndex, clampViewerScale, resistedDrag, swipeTargetIndex, viewerFileName } from './chatImageViewer'

export type ViewerImage = { id: string; dataUrl: string; width?: number; height?: number }

type Point = { x: number; y: number }
type Gesture = {
  mode: 'none' | 'swipe' | 'pan' | 'pinch'
  startX: number; startY: number; startAt: number; moved: number; onImage: boolean
  baseScale: number; baseTx: number; baseTy: number; startDist: number; startMid: Point
}

const emptyGesture = (): Gesture => ({ mode: 'none', startX: 0, startY: 0, startAt: 0, moved: 0, onImage: false, baseScale: 1, baseTx: 0, baseTy: 0, startDist: 0, startMid: { x: 0, y: 0 } })
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

async function saveOrShare(image: ViewerImage, index: number) {
  const blob = await fetch(image.dataUrl).then((response) => response.blob())
  const name = viewerFileName(index, blob.type)
  const file = typeof File === 'function' ? new File([blob], name, { type: blob.type || 'image/jpeg' }) : null
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (file && nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file] }); return } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export default function ChatImageViewer({ images, startIndex = 0, onClose }: { images: ViewerImage[]; startIndex?: number; onClose: () => void }) {
  const count = images.length
  const [index, setIndex] = useState(() => clampViewerIndex(startIndex, count))
  const [dragX, setDragX] = useState(0)
  const [zoom, setZoom] = useState({ scale: 1, tx: 0, ty: 0 })
  const [animate, setAnimate] = useState(false)
  const [saving, setSaving] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture>(emptyGesture())
  const lastTap = useRef(0)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const current = Math.min(index, Math.max(0, count - 1))

  const go = useCallback((next: number) => {
    setAnimate(true)
    setIndex(clampViewerIndex(next, count))
    setDragX(0)
    setZoom({ scale: 1, tx: 0, ty: 0 })
  }, [count])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowLeft') go(current - 1)
      else if (event.key === 'ArrowRight') go(current + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, go, onClose])

  if (!count) return null

  const size = () => { const rect = stageRef.current?.getBoundingClientRect(); return { w: rect?.width || window.innerWidth, h: rect?.height || window.innerHeight } }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    setAnimate(false)
    const z = zoomRef.current
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = { ...gesture.current, mode: 'pinch', startDist: distance(a, b) || 1, startMid: midpoint(a, b), baseScale: z.scale, baseTx: z.tx, baseTy: z.ty, moved: 99 }
      setDragX(0)
      return
    }
    if (pointers.current.size === 1) {
      gesture.current = { ...emptyGesture(), mode: z.scale > 1.01 ? 'pan' : 'swipe', startX: event.clientX, startY: event.clientY, startAt: Date.now(), onImage: (event.target as HTMLElement).tagName === 'IMG', baseScale: z.scale, baseTx: z.tx, baseTy: z.ty }
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const g = gesture.current
    const { w, h } = size()
    if (g.mode === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const scale = clampViewerScale(g.baseScale * distance(a, b) / g.startDist)
      const mid = midpoint(a, b)
      setZoom({ scale, tx: clampPan(g.baseTx + mid.x - g.startMid.x, scale, w), ty: clampPan(g.baseTy + mid.y - g.startMid.y, scale, h) })
      return
    }
    const dx = event.clientX - g.startX
    const dy = event.clientY - g.startY
    g.moved = Math.max(g.moved, Math.hypot(dx, dy))
    if (g.mode === 'pan') setZoom((z) => ({ ...z, tx: clampPan(g.baseTx + dx, z.scale, w), ty: clampPan(g.baseTy + dy, z.scale, h) }))
    else if (g.mode === 'swipe' && count > 1 && Math.abs(dx) > Math.abs(dy)) setDragX(resistedDrag(current, count, dx))
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.delete(event.pointerId)
    const g = gesture.current
    if (g.mode === 'pinch') {
      if (pointers.current.size === 1) {
        // 一指抬起，剩下那指接着平移。
        const [rest] = [...pointers.current.values()]
        const z = zoomRef.current
        gesture.current = { ...emptyGesture(), mode: z.scale > 1.01 ? 'pan' : 'swipe', startX: rest.x, startY: rest.y, startAt: Date.now(), moved: 99, baseScale: z.scale, baseTx: z.tx, baseTy: z.ty }
      } else if (!pointers.current.size) {
        gesture.current = emptyGesture()
        if (zoomRef.current.scale < 1.05) { setAnimate(true); setZoom({ scale: 1, tx: 0, ty: 0 }) }
      }
      return
    }
    if (pointers.current.size) return
    gesture.current = emptyGesture()
    if (g.mode === 'swipe' && dragX !== 0) {
      const next = swipeTargetIndex(current, count, dragX, size().w, Date.now() - g.startAt)
      if (next !== current) go(next)
      else { setAnimate(true); setDragX(0) }
      return
    }
    if (g.moved < 10 && event.type === 'pointerup') {
      if (!g.onImage) { onClose(); return }
      const now = Date.now()
      if (now - lastTap.current < 300) {
        lastTap.current = 0
        setAnimate(true)
        setZoom((z) => z.scale > 1.01 ? { scale: 1, tx: 0, ty: 0 } : { scale: 2.2, tx: 0, ty: 0 })
      } else lastTap.current = now
    }
  }

  const save = () => {
    if (saving) return
    setSaving(true)
    void saveOrShare(images[current], current).catch(() => window.alert('保存失败，可以长按图片保存。')).finally(() => setSaving(false))
  }

  return createPortal(<div className="image-gallery-viewer" role="dialog" aria-modal="true" aria-label="查看图片">
    <div ref={stageRef} className="image-gallery-stage" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div className={`image-gallery-track${animate ? ' animate' : ''}`} style={{ transform: `translate3d(calc(${-current * 100}% + ${dragX}px), 0, 0)` }}>
        {images.map((image, i) => <div className="image-gallery-slide" key={image.id || i}>
          {Math.abs(i - current) <= 1 ? <img src={image.dataUrl} alt="" draggable={false} decoding="async" style={i === current ? { transform: `translate3d(${zoom.tx}px, ${zoom.ty}px, 0) scale(${zoom.scale})` } : undefined} className={animate ? 'animate' : ''} /> : null}
        </div>)}
      </div>
    </div>
    {count > 1 && <div className="image-gallery-counter" aria-live="polite">{current + 1} / {count}</div>}
    <button type="button" className="image-gallery-btn image-gallery-close" aria-label="关闭图片" onClick={onClose}>×</button>
    <button type="button" className="image-gallery-btn image-gallery-save" aria-label="保存或分享图片" onClick={save} disabled={saving}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 19h14" /></svg>
      <span>{saving ? '处理中…' : '保存/分享'}</span>
    </button>
  </div>, document.body)
}
