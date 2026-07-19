import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import type { Character } from './characterCard'
import { applyMacros, applyRegexScripts } from './regexEngine'
import { containsHiddenReasoning, sanitizeAssistantOutput } from './outputSanitizer'

function unwrapCodeFence(value: string) {
  return value
    .replace(/^```(?:html|xml)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function looksLikeHtml(value: string) {
  return /<!doctype\s+html|<html[\s>]|<(?:div|section|article|style|audio|details|table|p|span|plot)\b/i.test(value)
}

export function isFullHtmlDocument(value: string) {
  return /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<style[\s>]|<script[\s>]/i.test(unwrapCodeFence(value))
}

function hasExecutableScript(value: string) {
  return /<script\b/i.test(unwrapCodeFence(value))
}

function renderInlineMarkdown(value: string) {
  return value
    .replace(/(“[^”\n]+”|「[^」\n]+」|『[^』\n]+』)/g, '<span class="message-quote">$1</span>')
    .replace(/```[ \t]*\n?([\s\S]*?)```/g, '<div class="message-code-block">$1</div>')
    .replace(/`([^`\n]+)`/g, '<span class="message-inline-code">$1</span>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
}

function styledPlainText(value: string) {
  const pattern = /(\*[^*\n]+\*|（[^）\n]+）|\([^\n)]+\)|“[^”\n]+”|「[^」\n]+」|『[^』\n]+』)/g
  const parts = value.split(pattern)
  return parts.map((part, index) => {
    if (/^\*[^*\n]+\*$/.test(part)) return <span className="message-narration" key={index}>{part.slice(1, -1)}</span>
    if (/^(?:（[^）\n]+）|\([^\n)]+\))$/.test(part)) return <span className="message-narration" key={index}>{part}</span>
    if (/^(?:“[^”\n]+”|「[^」\n]+」|『[^』\n]+』)$/.test(part)) return <span className="message-quote" key={index}>{part}</span>
    return part
  })
}

const SENTENCE_RE = /[^。！？!?…]+(?:[。！？!?]+[”」』】）)]*|…+[”」』】）)]*|$)/g

function segmentLongChineseParagraph(value: string) {
  if (value.length < 100) return [value]
  const sentences = value.match(SENTENCE_RE)?.map((sentence) => sentence.trim()).filter(Boolean) || [value]
  if (sentences.length < 2) return [value]

  const paragraphs: string[] = []
  let current = ''
  const flush = () => {
    if (current) paragraphs.push(current)
    current = ''
  }

  for (const sentence of sentences) {
    const standaloneDialogue = /^[“「『].*[”」』]$/.test(sentence)
    if (standaloneDialogue) {
      flush()
      paragraphs.push(sentence)
    } else if (current && current.length + sentence.length > 112) {
      flush()
      current = sentence
    } else {
      current += sentence
    }
  }
  flush()
  return paragraphs
}

/** Visual-only paragraphing for long plain-text roleplay; stored message text stays untouched. */
export function plainTextParagraphs(value: string) {
  const blocks = value.replace(/\r\n?/g, '\n').split(/\n+/).map((block) => block.trim()).filter(Boolean)
  if (!blocks.length) return ['']
  return blocks.flatMap(segmentLongChineseParagraph)
}

/** Keep the user's own message intact; only their explicit blank lines start a new paragraph. */
export function userTextParagraphs(value: string) {
  const blocks = value.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
  return blocks.length ? blocks : ['']
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
    return `\uE000PROTECTED_${index}\uE001`
  })

  const parts = protectedSource.split(/(<[^>]+>|\uE000PROTECTED_\d+\uE001)/g)
  return parts.map((part) => {
    const protectedMatch = part.match(/^\uE000PROTECTED_(\d+)\uE001$/)
    if (protectedMatch) return protectedBlocks[Number(protectedMatch[1])] || ''
    if (part.startsWith('<') && part.endsWith('>')) return part
    const autoParagraph = !part.includes('```') && part.trim().length >= 100
    const visualParagraphs = autoParagraph ? plainTextParagraphs(part) : [part]
    const renderedPart = visualParagraphs.map(renderInlineMarkdown).join('<span class="message-paragraph-break message-auto-paragraph-break"></span>')
    return renderedPart
      .replace(/\r\n?/g, '\n')
      .replace(/\n{2,}/g, '<span class="message-paragraph-break"></span>')
      .replace(/\n/g, '<br>')
  }).join('')
}

function SafeInlineHtml({ html }: { html: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(normalizeMixedMarkup(html), {
    ADD_TAGS: ['audio', 'source', 'details', 'summary'],
    ADD_ATTR: ['style', 'controls', 'loop', 'preload', 'playsinline', 'target', 'open'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
  }), [html])
  return <div className="message-safe-html" dangerouslySetInnerHTML={{ __html: clean }} />
}

function SandboxHtml({ html }: { html: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const tokenRef = useRef(`render-${crypto.randomUUID()}`)
  const fullDocument = useMemo(() => /<!doctype\s+html|<html[\s>]/i.test(unwrapCodeFence(html)), [html])
  const [height, setHeight] = useState(fullDocument ? 620 : 220)
  const source = useMemo(() => {
    const document = new DOMParser().parseFromString(unwrapCodeFence(html), 'text/html')
    const policy = document.createElement('meta')
    policy.httpEquiv = 'Content-Security-Policy'
    policy.content = "default-src 'none'; img-src data: https:; media-src data: https:; font-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"
    document.head.prepend(policy)
    const baseStyle = document.createElement('style')
    baseStyle.textContent = 'html,body{margin:0!important;padding:0!important;min-height:0!important;overflow-x:hidden;box-sizing:border-box}*,*:before,*:after{box-sizing:border-box;max-width:100%}'
    document.head.append(baseStyle)
    if (!fullDocument) {
      const reporter = document.createElement('script')
      reporter.textContent = `(()=>{const token=${JSON.stringify(tokenRef.current)};let last=0,queued=false;const report=()=>{queued=false;const next=Math.ceil(Math.max(document.body?.scrollHeight||0,document.documentElement?.scrollHeight||0));if(next!==last){last=next;parent.postMessage({type:'weijing-render-size',token,height:next},'*')}};const queue=()=>{if(!queued){queued=true;requestAnimationFrame(report)}};addEventListener('load',queue);new ResizeObserver(queue).observe(document.documentElement);setTimeout(queue,80);setTimeout(queue,500);setTimeout(queue,1500)})();`
      document.body.append(reporter)
    }
    return `<!doctype html>${document.documentElement.outerHTML}`
  }, [html, fullDocument])

  useLayoutEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.type !== 'weijing-render-size' || event.data?.token !== tokenRef.current) return
      const next = Math.max(56, Math.min(1200, Number(event.data.height) || 220))
      setHeight((current) => Math.abs(current - next) > 1 ? next : current)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [])

  return <iframe ref={frameRef} className={`message-script-frame ${fullDocument ? 'full-document' : 'inline-script'}`} title="角色卡互动内容" sandbox="allow-scripts" srcDoc={source} style={{ height }} />
}

function MessageContent({ text, role, character, userName, layout = 'bubble' }: { text: string; role: 'user' | 'assistant'; character: Character; userName: string; layout?: 'bubble' | 'flat' }) {
  const rendered = useMemo(() => {
    const director = character.tags.includes('共演导演') || character.tags.includes('旁白导演')
    const cleanText = role === 'assistant' ? sanitizeAssistantOutput(text, { director }) : text
    const visibleText = role === 'assistant' && !cleanText && containsHiddenReasoning(text, director)
      ? '（已拦截模型内部分析；未计入正式剧情。）'
      : cleanText
    return role === 'assistant'
      ? applyRegexScripts(visibleText, character.regexScripts, character, userName, 2, 'display')
      : applyMacros(visibleText, character, userName)
  }, [text, role, character, userName])

  if (hasExecutableScript(rendered) || isFullHtmlDocument(rendered)) return <div className="message-content message-content-rich"><SandboxHtml html={rendered} /></div>
  if (looksLikeHtml(rendered)) return <div className="message-content message-content-rich"><SafeInlineHtml html={rendered} /></div>
  const paragraphs = role === 'user' ? userTextParagraphs(rendered) : plainTextParagraphs(rendered)
  return <div className={`message-content message-content-plain ${layout === 'bubble' ? 'message-content-bubble' : 'message-content-flat'}`}><div className={`message-plain-text ${role === 'user' ? 'message-plain-text-user' : ''}`}>{paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 12)}`}>{styledPlainText(paragraph)}</p>)}</div></div>
}

export default memo(MessageContent)
