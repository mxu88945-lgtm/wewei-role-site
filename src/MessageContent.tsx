import { useLayoutEffect, useMemo, useRef } from 'react'
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

function ShadowHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const safeHtml = useMemo(() => DOMPurify.sanitize(unwrapCodeFence(html), {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ['style', 'audio', 'source', 'details', 'summary'],
    ADD_ATTR: ['style', 'controls', 'autoplay', 'loop', 'preload', 'playsinline', 'target'],
  }), [html])

  const shadowContent = useMemo(() => {
    const document = new DOMParser().parseFromString(safeHtml, 'text/html')
    const styles = Array.from(document.head.querySelectorAll('style')).map((style) => style.outerHTML).join('')
    return `${styles}<style>:host{display:block;width:100%;color:inherit;background:transparent}.message-html-root{display:flow-root;width:100%;min-width:0;overflow-wrap:anywhere}</style><div class="message-html-root">${document.body.innerHTML}</div>`
  }, [safeHtml])

  useLayoutEffect(() => {
    const host = ref.current
    if (!host) return
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' })
    const frame = window.requestAnimationFrame(() => { shadow.innerHTML = shadowContent })
    return () => window.cancelAnimationFrame(frame)
  }, [shadowContent])

  return <div ref={ref} className="message-shadow-content" />
}

export default function MessageContent({ text, role, character, userName }: { text: string; role: 'user' | 'assistant'; character: Character; userName: string }) {
  const rendered = useMemo(() => role === 'assistant'
    ? applyRegexScripts(text, character.regexScripts, character, userName, 2, 'display')
    : applyMacros(text, character, userName), [text, role, character, userName])

  if (looksLikeHtml(rendered)) return <ShadowHtml html={rendered} />
  return <div className="message-plain-text">{rendered}</div>
}
