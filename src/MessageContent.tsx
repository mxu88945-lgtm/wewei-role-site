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
  return /<!doctype\s+html|<html[\s>]|<(?:div|section|article|style|audio|details|table|p|span|plot)\b/i.test(value)
}

function renderInlineMarkdown(value: string) {
  return value
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
}

/**
 * Character cards commonly mix raw HTML, Markdown and plain-text line breaks.
 * Preserve existing HTML while converting only the text between tags.
 */
function normalizeMixedMarkup(value: string) {
  const source = unwrapCodeFence(value)
  const protectedBlocks: string[] = []
  const protectedSource = source.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, (block) => {
    const index = protectedBlocks.push(block) - 1
    return `\u0000PROTECTED_${index}\u0000`
  })

  const parts = protectedSource.split(/(<[^>]+>|\u0000PROTECTED_\d+\u0000)/g)
  return parts.map((part) => {
    const protectedMatch = part.match(/^\u0000PROTECTED_(\d+)\u0000$/)
    if (protectedMatch) return protectedBlocks[Number(protectedMatch[1])] || ''
    if (part.startsWith('<') && part.endsWith('>')) return part
    return renderInlineMarkdown(part)
      .replace(/\r\n?/g, '\n')
      .replace(/\n{2,}/g, '<br><br>')
      .replace(/\n/g, '<br>')
  }).join('')
}

function ShadowHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const safeHtml = useMemo(() => DOMPurify.sanitize(normalizeMixedMarkup(html), {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ['style', 'audio', 'source', 'details', 'summary', 'plot'],
    ADD_ATTR: ['style', 'controls', 'autoplay', 'loop', 'preload', 'playsinline', 'target'],
  }), [html])

  const shadowContent = useMemo(() => {
    const document = new DOMParser().parseFromString(safeHtml, 'text/html')
    const styles = Array.from(document.head.querySelectorAll('style')).map((style) => style.outerHTML).join('')
    return `${styles}<style>
      :host{display:block;width:100%;min-width:0;color:inherit;background:transparent}
      *{box-sizing:border-box;max-width:100%}
      .message-html-root{display:flow-root;width:100%;min-width:0;overflow-wrap:anywhere;white-space:normal;line-height:1.75}
      .message-html-root plot{display:block;margin:.7em 0;white-space:normal}
      .message-html-root p{margin:.72em 0;line-height:1.8}
      .message-html-root strong{font-weight:800}
      .message-html-root em{font-style:italic}
      .message-html-root hr{height:1px;border:0;background:rgba(91,72,101,.16);margin:1.1em 0}
      .message-html-root audio{display:block;width:100%;margin:.65em 0}
      .message-html-root details{display:block;width:100%;margin:.85em 0;border-radius:18px;overflow:hidden}
      .message-html-root summary{cursor:pointer;font-weight:750}
      .message-html-root pre,.message-html-root code{white-space:pre-wrap;overflow-wrap:anywhere}
    </style><div class="message-html-root">${document.body.innerHTML}</div>`
  }, [safeHtml])

  useLayoutEffect(() => {
    const host = ref.current
    if (!host) return
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' })
    const frame = window.requestAnimationFrame(() => { shadow.innerHTML = shadowContent })
    return () => window.cancelAnimationFrame(frame)
  }, [shadowContent])

  return <div ref={ref} className="message-shadow-content message-html-frame" />
}

export default function MessageContent({ text, role, character, userName }: { text: string; role: 'user' | 'assistant'; character: Character; userName: string }) {
  const rendered = useMemo(() => role === 'assistant'
    ? applyRegexScripts(text, character.regexScripts, character, userName, 2, 'display')
    : applyMacros(text, character, userName), [text, role, character, userName])

  if (looksLikeHtml(rendered)) return <ShadowHtml html={rendered} />
  return <div className="message-plain-text">{rendered}</div>
}
