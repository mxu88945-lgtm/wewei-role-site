import { useEffect, useRef, useState, type RefObject } from 'react'
import PetCritter, { type PetVariant } from './PetCritter'

type PetPosition = { x: number; y: number }
const BUBBLES = ['💕', '✨', '👀', '在呢～', '来啦～', '贴贴', '啾！', '摸摸我']
const HEARTS = ['💕', '✨', '❤️', '💗', '🌸']
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const randomItem = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]

export default function Pet({ enabled, variant, position, onPositionChange, containerRef, messageCount }: { enabled: boolean; variant: PetVariant; position: PetPosition; onPositionChange: (position: PetPosition) => void; containerRef: RefObject<HTMLElement>; messageCount: number }) {
  const [localPosition, setLocalPosition] = useState(position)
  const positionRef = useRef(position)
  const [walking, setWalking] = useState(false)
  const [facing, setFacing] = useState(1)
  const [moveDuration, setMoveDuration] = useState(0)
  const [hop, setHop] = useState(false)
  const [bubble, setBubble] = useState<string | null>(null)
  const [hearts, setHearts] = useState<{ id: number; emoji: string; offset: number }[]>([])
  const [viewportVersion, setViewportVersion] = useState(0)
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0 })
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousMessageCount = useRef<number | null>(null)

  const commit = (next: PetPosition) => {
    positionRef.current = next
    setLocalPosition(next)
  }

  const showBubble = (text: string) => {
    setBubble(text)
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current)
    bubbleTimer.current = setTimeout(() => setBubble(null), 2400)
  }

  useEffect(() => {
    positionRef.current = position
    setLocalPosition(position)
  }, [position])
  useEffect(() => {
    const resize = () => setViewportVersion((value) => value + 1)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => () => { if (bubbleTimer.current) clearTimeout(bubbleTimer.current) }, [])
  useEffect(() => {
    if (previousMessageCount.current !== null && messageCount > previousMessageCount.current) showBubble(randomItem(BUBBLES))
    previousMessageCount.current = messageCount
  }, [messageCount])
  useEffect(() => {
    if (!enabled) return
    let active = true
    let wanderTimer: ReturnType<typeof setTimeout>
    let stopTimer: ReturnType<typeof setTimeout>
    const wander = () => {
      wanderTimer = setTimeout(() => {
        if (!active || drag.current.active) return wander()
        const next = { x: clamp(.08 + Math.random() * .84, .05, .95), y: clamp(.16 + Math.random() * .62, .14, .78) }
        const distance = Math.hypot(next.x - positionRef.current.x, next.y - positionRef.current.y)
        const duration = clamp(distance * 7, 1.5, 5.5)
        setFacing(next.x >= positionRef.current.x ? 1 : -1)
        setMoveDuration(duration)
        setWalking(true)
        commit(next)
        onPositionChange(next)
        stopTimer = setTimeout(() => active && setWalking(false), duration * 1000)
        wander()
      }, 5200 + Math.random() * 6500)
    }
    wander()
    return () => { active = false; clearTimeout(wanderTimer); clearTimeout(stopTimer) }
  }, [enabled, onPositionChange])

  if (!enabled) return null
  const bounds = containerRef.current?.getBoundingClientRect()
  const width = bounds?.width || Math.min(window.innerWidth, 520)
  const leftEdge = bounds?.left ?? (window.innerWidth - width) / 2
  const height = bounds?.height || window.innerHeight
  const topEdge = bounds?.top || 0
  void viewportVersion

  const react = () => {
    setHop(false)
    requestAnimationFrame(() => setHop(true))
    setTimeout(() => setHop(false), 620)
    const burst = Array.from({ length: 3 }, (_, index) => ({ id: Date.now() + index, emoji: randomItem(HEARTS), offset: (index - 1) * 16 + Math.random() * 8 - 4 }))
    setHearts((current) => [...current, ...burst])
    setTimeout(() => setHearts((current) => current.filter((heart) => !burst.some((item) => item.id === heart.id))), 950)
    showBubble(randomItem(BUBBLES))
  }
  const onPointerDown = (event: React.PointerEvent) => {
    drag.current = { active: true, moved: false, startX: event.clientX, startY: event.clientY }
    setMoveDuration(0)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current.active) return
    if (Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY) > 6) drag.current.moved = true
    if (!drag.current.moved) return
    setWalking(false)
    const next = { x: clamp((event.clientX - leftEdge) / width, .05, .95), y: clamp((event.clientY - topEdge) / height, .07, .9) }
    commit(next)
  }
  const onPointerUp = () => {
    if (!drag.current.active) return
    const moved = drag.current.moved
    drag.current.active = false
    if (moved) onPositionChange(positionRef.current)
    else react()
  }

  return <div className="weijing-pet" style={{ left: leftEdge + localPosition.x * width, top: topEdge + localPosition.y * height, transition: moveDuration ? `left ${moveDuration}s linear, top ${moveDuration}s linear` : undefined }}>
    {bubble && <div className="pet-bubble">{bubble}</div>}
    {hearts.map((heart) => <span className="pet-heart" key={heart.id} style={{ marginLeft: heart.offset }}>{heart.emoji}</span>)}
    <button className="weijing-pet-button" type="button" aria-label="惟境桌宠，按住可拖动" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} style={{ transform: `scaleX(${facing})` }}><PetCritter variant={variant} walking={walking} className={hop ? 'pet-hop' : 'pet-idle'} /></button>
  </div>
}
