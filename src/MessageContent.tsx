import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import type { Character } from './characterCard'
import { applyMacros, applyRegexScripts } from './regexEngine'

function unwrapCodeFence(value: string) {
  return value
    .replace(/^```(?:html|xml)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function looksLikeHtml(value: string) {
  return /<!doctype\s+html|<html[\s>]|<(?:div|section|article|style|audio|details|table|p|span)\b/i.test(value)
}

function renderedContentHeight(document: Document) {
  const body = document.body
  if (!body) return 220
  let top = 0
  let bottom = 0
  const nodes = Array.from(body.querySelectorAll<HTMLElement>('*')).filter((node) => !['STYLE', 'SCRIPT', 'LINK', 'META', 'SOURCE'].includes(node.tagName))
  for (const node of nodes) {
    const rect = node.getBoundingClientRect()
    if (!Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) continue
    top = Math.min(top, rect.top)
    bottom = Math.max(bottom, rect.bottom)
  }
  try {
    const range = document.createRange()
    range.selectNodeContents(body)
    for (const rect of Array.from(range.getClientRects())) {
      top = Math.min(top, rect.top)
      bottom = Math.max(bottom, rect.bottom)
    }
  } catch {
    // Element bounds above still provide a stable measurement.
  }
  return Math.min(Math.max(Math.ceil(bottom - top), 120), 8000)
}

function HtmlFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(220)
  const heightRef = useRef(220)
  const scrollSnapshot = useRef<{ list: HTMLElement; top: number } | null>(null)
  const safeHtml = useMemo(() => DOMPurify.sanitize(unwrapCodeFence(html), {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ['style', 'audio', 'source', 'details', 'summary'],
    ADD_ATTR: ['style', 'controls', 'autoplay', 'loop', 'preload', 'playsinline', 'target'],
  }), [html])

  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    const sync = () => {
      const document = frame.contentDocument
      if (!document) return
      const next = renderedContentHeight(document)
      if (Math.abs(next - heightRef.current) < 2) return
      const list = frame.closest<HTMLElement>('.message-list')
      if (list) scrollSnapshot.current = { list, top: list.scrollTop }
      heightRef.current = next
      setHeight(next)
    }
    frame.addEventListener('load', sync)
    const timer = window.setInterval(sync, 700)
    return () => { frame.removeEventListener('load', sync); window.clearInterval(timer) }
  }, [safeHtml])

  useLayoutEffect(() => {
    const snapshot = scrollSnapshot.current
    if (!snapshot) return
    snapshot.list.scrollTop = snapshot.top
    window.requestAnimationFrame(() => { snapshot.list.scrollTop = snapshot.top })
    scrollSnapshot.current = null
  }, [height])

  return <iframe ref={ref} className="message-html-frame" title="角色卡美化内容" sandbox="allow-same-origin allow-popups" referrerPolicy="no-referrer" srcDoc={safeHtml} style={{ height }} />
}

export default function MessageContent({ text, role, character, userName }: { text: string; role: 'user' | 'assistant'; character: Character; userName: string }) {
  const rendered = useMemo(() => role === 'assistant'
    ? applyRegexScripts(text, character.regexScripts, character, userName, 2, 'display')
    : applyMacros(text, character, userName), [text, role, character, userName])

  if (looksLikeHtml(rendered)) return <HtmlFrame html={rendered} />
  return <div className="message-plain-text">{rendered}</div>
}
