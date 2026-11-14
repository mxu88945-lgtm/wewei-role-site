import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { classifySpriteMood, SPRITE_MOODS, SPRITE_STAY_MS, spriteAppearOf, spriteFile, spritePosOf, spriteReplyTail, spriteSnapPos, type SpriteMood, type SpritePos, type SpriteSet } from './personaSprite'
import { setSpritePrefs, useSpriteState } from './personaSpriteStore'

const APP_ROOT = '/wewei-role-site/' // 与 vite.config base、sw.js APP_ROOT 一致

type SpriteMessage = { role: string; text: string; speakerId?: string }

/**
 * v239 人格窗口 Q 版立绘（同顾祁砚 v374）：站在输入框正上方的左/右边，盖在消息上、在输入框/菜单/弹层之下。
 * 外层全部 pointer-events:none，只有他身上的一小块和隐身后的小竖条接收点按。
 */
export default function PersonaSprite({ personaId, set, messages, generating, error, suppressed, readText, isGuest }: {
  personaId: string
  set: SpriteSet
  messages: readonly SpriteMessage[]
  generating: boolean
  error: string
  /** 消息菜单 / ＋菜单 / 看大图等打开时先藏起来，免得盖住。 */
  suppressed?: boolean
  readText: (message: SpriteMessage) => string
  isGuest: (message: SpriteMessage) => boolean
}) {
  const prefs = useSpriteState()[personaId]
  const appear = spriteAppearOf(prefs)
  const pos = spritePosOf(prefs)
  const srcOf = (mood: SpriteMood) => `${APP_ROOT}${spriteFile(set, mood)}`

  const stageRef = useRef<HTMLDivElement>(null)
  const imgRefs = [useRef<HTMLImageElement>(null), useRef<HTMLImageElement>(null)]
  const moodRef = useRef<SpriteMood | ''>('')
  const frontRef = useRef(0)
  const tokenRef = useRef(0)
  const pinnedRef = useRef(false)
  const awayTimer = useRef(0)
  const wasGenerating = useRef(generating)
  const [shown, setShown] = useState(() => appear === 'always' ? !prefs?.hidden : false)
  const [dragging, setDragging] = useState(false)

  const hop = () => {
    const stage = stageRef.current
    if (!stage || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    stage.classList.remove('hop'); void stage.offsetWidth; stage.classList.add('hop')
  }
  const setMood = (mood: SpriteMood, hopAnyway = false) => {
    const current = moodRef.current
    if (mood === current) { if (hopAnyway) hop(); return }
    const shouldHop = !!current || hopAnyway
    moodRef.current = mood
    const imgs = imgRefs.map((ref) => ref.current)
    const cur = imgs[frontRef.current], next = imgs[1 - frontRef.current]
    if (!cur || !next) return
    const token = ++tokenRef.current
    const show = () => {
      if (token !== tokenRef.current) return
      next.classList.add('on'); cur.classList.remove('on')
      frontRef.current = 1 - frontRef.current
      stageRef.current?.setAttribute('data-mood', mood)
      if (shouldHop) hop()
    }
    next.onload = null
    const src = srcOf(mood)
    if (next.getAttribute('src') === src && next.complete) { show(); return }
    next.onload = () => { next.onload = null; show() }
    next.src = src
  }
  const setShownNow = (on: boolean, withHop = false) => {
    window.clearTimeout(awayTimer.current)
    if (!on) pinnedRef.current = false
    setShown(on)
    if (on && withHop) hop()
  }

  // 预载这一套表情，换表情时不闪。
  useEffect(() => {
    for (const mood of SPRITE_MOODS) { const image = new Image(); image.decoding = 'async'; image.src = srcOf(mood) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.id])

  // 切换出现方式：常驻按她上次是否隐身，有情绪时出现先收起。
  const firstAppear = useRef(true)
  useEffect(() => {
    if (firstAppear.current) { firstAppear.current = false; return }
    if (appear === 'always') setShownNow(!prefs?.hidden)
    else setShownNow(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appear])

  // 表情只在他说完时更新（流式中途不跟着跳）；说完且没出错、不是平静 → 有情绪时出现模式下跳出来 8 秒。
  const tail = spriteReplyTail(messages, readText, isGuest)
  useLayoutEffect(() => {
    const finished = wasGenerating.current && !generating
    wasGenerating.current = generating
    if (generating) return
    const mood = classifySpriteMood(tail, moodRef.current)
    if (finished && !error && appear === 'mood' && !pinnedRef.current && mood !== 'cold') {
      setMood(mood)
      setShownNow(true, true)
      awayTimer.current = window.setTimeout(() => { if (!pinnedRef.current) setShownNow(false) }, SPRITE_STAY_MS)
      return
    }
    setMood(mood, finished && !error && shown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tail, generating])

  useEffect(() => () => window.clearTimeout(awayTimer.current), [])

  const box = (stage: HTMLElement) => {
    const page = (stage.offsetParent as HTMLElement | null) || stage.parentElement!
    const rect = page.getBoundingClientRect()
    const header = page.querySelector('.chat-header')
    const composer = page.querySelector('.persona-composer')
    const headerB = header ? Math.max(0, header.getBoundingClientRect().bottom - rect.top) : 0
    const baseBottom = composer ? Math.max(0, rect.bottom - composer.getBoundingClientRect().top) : 84
    return { rect, mainW: rect.width, mainH: rect.height, headerB, baseBottom, w: stage.offsetWidth, h: stage.offsetHeight }
  }

  const drag = useRef<{ id: number; x0: number; y0: number; t0: number; moving: boolean; left: number; bottom: number; press: number } | null>(null)
  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button > 0) return
    event.preventDefault(); event.stopPropagation()
    const stage = stageRef.current; if (!stage) return
    const r = stage.getBoundingClientRect(), m = box(stage).rect
    drag.current = { id: event.pointerId, x0: event.clientX, y0: event.clientY, t0: Date.now(), moving: false, left: r.left - m.left, bottom: m.bottom - r.bottom,
      press: window.setTimeout(() => { if (drag.current) { drag.current.moving = true; setDragging(true) } }, 250) }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* ignore */ }
  }
  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || event.pointerId !== d.id) return
    event.preventDefault(); event.stopPropagation()
    const dx = event.clientX - d.x0, dy = event.clientY - d.y0
    if (!d.moving && Math.hypot(dx, dy) > 6) { d.moving = true; setDragging(true) }
    if (d.moving && stageRef.current) stageRef.current.style.transform = `translate(${dx}px, ${dy}px)`
  }
  const onEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const stage = stageRef.current
    if (!d || event.pointerId !== d.id || !stage) return
    event.preventDefault(); event.stopPropagation()
    window.clearTimeout(d.press)
    drag.current = null
    setDragging(false)
    const dx = event.clientX - d.x0, dy = event.clientY - d.y0
    if (!d.moving) {
      stage.style.transform = ''
      if (event.type === 'pointerup' && Date.now() - d.t0 < 600) { // 点一下 → 隐身（常驻模式记住）
        setShownNow(false)
        if (appear === 'always') setSpritePrefs(personaId, (current) => ({ ...current, hidden: true }))
      }
      return
    }
    const b = box(stage)
    const before = stage.getBoundingClientRect()
    // 底边 = baseBottom + y，所以松手处直接反推出新的 y
    const next: SpritePos = spriteSnapPos({ x: d.left + dx, y: (d.bottom - dy) - b.baseBottom }, b)
    // 先把新位置写进 DOM，再做 FLIP 滑到边上
    stage.dataset.side = next.side
    stage.style.setProperty('--sprite-y', `${next.y}px`)
    stage.style.transform = ''
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const after = stage.getBoundingClientRect()
      stage.classList.add('dragging')
      stage.style.transform = `translate(${before.left - after.left}px, ${before.top - after.top}px)`
      void stage.offsetWidth
      stage.classList.remove('dragging'); stage.classList.add('snapping')
      stage.style.transform = ''
      window.setTimeout(() => stage.classList.remove('snapping'), 260)
    }
    setSpritePrefs(personaId, (current) => ({ ...current, pos: next }))
    if (appear === 'mood' && shown) { pinnedRef.current = true; window.clearTimeout(awayTimer.current) } // 挪过他：让他留着
  }
  const summon = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation()
    setShownNow(true, true)
    pinnedRef.current = true // 手动叫出来：点他之前一直在
    if (appear === 'always') setSpritePrefs(personaId, (current) => ({ ...current, hidden: false }))
  }

  const style = { '--sprite-y': `${pos.y}px` } as CSSProperties
  return <>
    <div ref={stageRef} className={`persona-sprite-stage${shown && !suppressed ? '' : ' away'}${dragging ? ' dragging' : ''}`} data-side={pos.side} style={style} aria-hidden="true" onAnimationEnd={() => stageRef.current?.classList.remove('hop')}>
      <img ref={imgRefs[0]} className="persona-sprite-img" alt="" draggable={false} decoding="async" />
      <img ref={imgRefs[1]} className="persona-sprite-img" alt="" draggable={false} decoding="async" />
      <div className="persona-sprite-hit" title="拖动 · 点一下隐身" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd} onClick={(event) => event.stopPropagation()} />
    </div>
    {!shown && !suppressed && <div className="persona-sprite-tab" role="button" aria-label="叫他出来" title="叫他出来" data-side={pos.side} style={style} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation() }} onPointerUp={summon} onClick={(event) => event.stopPropagation()} />}
  </>
}
