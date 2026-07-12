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
    .replace(/```[ \t]*\n?([\s\S]*?)```/g, '<div class="message-code-block">$1</div>')
    .replace(/`([^`\n]+)`/g, '<span class="message-inline-code">$1</span>')
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
export function normalizeMixedMarkup(value: string) {
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
      .replace(/\n{2,}/g, '<span class="message-paragraph-break"></span>')
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
    document.body.querySelectorAll('plot').forEach((plot) => {
      if (!plot.textContent?.trim() && !plot.querySelector('audio,img,details')) plot.remove()
    })
    document.body.querySelectorAll('br + br, .message-paragraph-break + .message-paragraph-break').forEach((node) => node.remove())
    const styles = Array.from(document.head.querySelectorAll('style')).map((style) => style.outerHTML).join('')
    return `${styles}<style>
      :host{display:block;width:100%;min-width:0;color:inherit;background:transparent}
      *{box-sizing:border-box;max-width:100%}
      .message-html-root{display:flow-root;width:100%;min-width:0;overflow-wrap:anywhere;white-space:normal;line-height:1.62}
      .message-html-root plot{display:block;margin:.35em 0;white-space:normal}
      .message-html-root plot:empty{display:none}
      .message-html-root p{margin:.55em 0;line-height:1.62}
      .message-html-root br{line-height:1.15}
      .message-html-root br+br{display:none}
      .message-html-root .message-paragraph-break{display:block;height:.45em}
      .message-html-root .message-code-block{
        display:block;margin:.55em 0;padding:10px 13px;border-radius:12px;
        background:rgba(79,72,83,.18);line-height:1.55;white-space:pre-wrap
      }
      .message-html-root plot>.message-code-block:first-child:last-child{margin:.35em 0}
      .message-html-root .message-inline-code{
        display:inline;padding:.05em .28em;border-radius:.3em;
        color:inherit;background:rgba(79,72,83,.14);font-family:inherit
      }
      .message-html-root strong{font-weight:800}
      .message-html-root em{font-style:italic}
      .message-html-root hr{height:1px;border:0;background:rgba(91,72,101,.16);margin:.8em 0}
      .message-html-root audio{display:block;width:100%;margin:.55em 0 .7em}
      .message-html-root details{
        display:block;width:100%;margin:.8em 0;padding:0;border:0;
        border-radius:0;overflow:visible;background:transparent;box-shadow:none
      }
      .message-html-root summary{
        cursor:pointer;margin:0 0 8px;padding:11px 13px;border-radius:12px;
        color:#4f4853;background:rgba(226,221,230,.92);font-weight:800;line-height:1.35
      }
      .message-html-root details:not([open]) summary{margin-bottom:0}
      .message-html-root summary+.message-paragraph-break{display:none}
      .message-html-root details br{line-height:1.05}
      .message-html-root details>.message-code-block{margin:0;background:rgba(79,72,83,.18)}
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
