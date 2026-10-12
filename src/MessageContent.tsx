import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import type { Character } from './characterCard'
import { applyMacros, applyRegexScripts } from './regexEngine'
import { completeStatusBlock, containsHiddenReasoning, detectStatusTag, moveStatusBlockToEnd, normalizeDirectorStatusOutput, sanitizeAssistantOutput, stripStatusBlocksForStreaming } from './outputSanitizer'
import { buildStatusFallback, getStatusProtocol } from './statusProtocol'

function unwrapCodeFence(value: string) {
  return value
    .replace(/^```(?:html|xml)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

export type MessageSegment = { kind: 'html' | 'text'; value: string }

/**
 * Tavo / SillyTavern "Code Block" mode: every ```html fence is its own isolated
 * page, and the story text around it renders normally. Cards often ship several
 * full HTML documents in one message (a home page, a music player, a "back to
 * home" button), which must never be merged into one document.
 */
export function splitHtmlFences(value: string): MessageSegment[] | null {
  const fence = /```[ \t]*html[ \t]*\r?\n([\s\S]*?)```/gi
  const segments: MessageSegment[] = []
  let last = 0
  for (let match = fence.exec(value); match; match = fence.exec(value)) {
    if (!/<[a-z!][^>]*>/i.test(match[1])) continue
    const before = value.slice(last, match.index)
    if (before.trim()) segments.push({ kind: 'text', value: before.trim() })
    segments.push({ kind: 'html', value: match[1].trim() })
    last = match.index + match[0].length
  }
  if (!segments.some((segment) => segment.kind === 'html')) return null
  const rest = value.slice(last)
  if (rest.trim()) segments.push({ kind: 'text', value: rest.trim() })
  return segments
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
const COMPACT_MARKUP_TAG = /^(?:scene|status|[a-z][\w-]*_status)$/i

const PENDING_ASSISTANT_PLACEHOLDER = /^正在回应(?:…|\.{3}|。)?$/

export function isPendingAssistantText(value: string) {
  return PENDING_ASSISTANT_PLACEHOLDER.test(value.trim())
}

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
  let compactDepth = 0
  return parts.map((part) => {
    const protectedMatch = part.match(/^\uE000PROTECTED_(\d+)\uE001$/)
    if (protectedMatch) return protectedBlocks[Number(protectedMatch[1])] || ''
    if (part.startsWith('<') && part.endsWith('>')) {
      const tag = part.match(/^<\s*(\/?)\s*([a-z][\w-]*)\b[^>]*>/i)
      if (tag && COMPACT_MARKUP_TAG.test(tag[2])) {
        if (tag[1]) compactDepth = Math.max(0, compactDepth - 1)
        else if (!/\/\s*>$/.test(part)) compactDepth += 1
      }
      return part
    }
    const compactPanel = compactDepth > 0
    const autoParagraph = !compactPanel && !part.includes('```') && part.trim().length >= 100
    const visualParagraphs = autoParagraph ? plainTextParagraphs(part) : [part]
    if (autoParagraph && visualParagraphs.length > 1) {
      return visualParagraphs.map((paragraph) => `<p class="message-story-paragraph">${renderInlineMarkdown(paragraph)}</p>`).join('')
    }
    const renderedPart = visualParagraphs.map(renderInlineMarkdown).join('')
    return renderedPart
      .replace(/\r\n?/g, '\n')
      .replace(/\n{2,}/g, compactPanel ? '<br>' : '<span class="message-paragraph-break"></span>')
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

type SceneHooks = { greetings?: string[]; onSelectGreeting?: (index: number, text: string) => void }

function SandboxHtml({ html, raw = false, greetings, onSelectGreeting }: { html: string; raw?: boolean } & SceneHooks) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const tokenRef = useRef(`render-${crypto.randomUUID()}`)
  const fullDocument = useMemo(() => /<!doctype\s+html|<html[\s>]/i.test(unwrapCodeFence(html)), [html])
  // A fenced page is sized to its own content, like Tavo, instead of a fixed 620px box.
  const autoSize = raw || !fullDocument
  const [height, setHeight] = useState(raw ? 120 : fullDocument ? 620 : 220)
  const greetingsKey = greetings ? JSON.stringify(greetings) : ''
  const source = useMemo(() => {
    // Rich character cards containing their own <style> are rendered in an iframe.
    // Run the same mixed-markup paragraphing used by safe inline HTML first, so a
    // long model-authored story does not collapse into one dense block just because
    // the card ships custom CSS.
    // A fenced page is the card author's own document: parse it untouched (no <br>
    // between tags, which used to push stray line breaks into <head> and break layouts).
    const document = new DOMParser().parseFromString(raw ? html : normalizeMixedMarkup(html), 'text/html')
    const policy = document.createElement('meta')
    policy.httpEquiv = 'Content-Security-Policy'
    policy.content = "default-src 'none'; img-src data: https:; media-src data: https:; font-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"
    document.head.prepend(policy)
    const baseStyle = document.createElement('style')
    baseStyle.textContent = (raw ? 'html,body{margin:0!important;' : 'html,body{margin:0!important;padding:0!important;') + 'min-height:0!important;overflow-x:hidden;box-sizing:border-box}*,*:before,*:after{box-sizing:border-box;max-width:100%}.message-paragraph-break{display:block;height:.62em}.message-auto-paragraph-break{height:.82em}'
    document.head.append(baseStyle)
    if (raw) {
      // Size a fenced page to its content: html/body must not stretch to the iframe's own
      // height (height:100% / 100vh), or the measured height feeds back and leaves a huge blank.
      const fitStyle = document.createElement('style')
      fitStyle.textContent = 'html,body{height:auto!important;min-height:0!important;max-height:none!important;overflow:hidden!important}'
      document.head.append(fitStyle)
      const vh = Math.max(4, Math.round((window.innerHeight || 800) / 100 * 100) / 100)
      const fixVh = (css: string) => css.replace(/(-?\d*\.?\d+)(?:d|s|l)?vh\b/gi, (_m, n) => `${Math.round(Number(n) * vh)}px`)
      document.querySelectorAll('style').forEach((node) => { if (node !== baseStyle && node !== fitStyle) node.textContent = fixVh(node.textContent || '') })
      document.querySelectorAll<HTMLElement>('[style]').forEach((node) => node.setAttribute('style', fixVh(node.getAttribute('style') || '')))
    }
    if (greetingsKey) {
      // Minimal SillyTavern / TavernHelper bridge so card home pages can jump to an opening.
      const bridge = document.createElement('script')
      bridge.textContent = `(()=>{const token=${JSON.stringify(tokenRef.current)};const swipes=${greetingsKey.replace(/</g, '\\u003c')};const pick=(i)=>parent.postMessage({type:'weijing-select-greeting',token,index:Number(i)||0},'*');window.getChatMessages=async()=>[{message_id:0,role:'assistant',message:swipes[0],swipes}];window.setChatMessage=async(_m,_id,opts)=>{pick(opts&&opts.swipe_id!=null?opts.swipe_id:0)};window.jumpToSwipe=pick;addEventListener('DOMContentLoaded',()=>{const home=document.getElementById('returnHomeText');if(home)home.addEventListener('click',()=>pick(0))})})();`
      document.head.prepend(bridge)
    }
    if (autoSize) {
      const reporter = document.createElement('script')
      reporter.textContent = `(()=>{const token=${JSON.stringify(tokenRef.current)};let last=0,queued=false;const report=()=>{queued=false;const b=document.body;const next=Math.ceil(${raw ? "b?Math.max(b.scrollHeight,b.getBoundingClientRect().height):0" : "Math.max(document.body?.scrollHeight||0,document.documentElement?.scrollHeight||0)"});if(next!==last){last=next;parent.postMessage({type:'weijing-render-size',token,height:next},'*')}};const queue=()=>{if(!queued){queued=true;requestAnimationFrame(report)}};addEventListener('load',queue);new ResizeObserver(queue).observe(document.documentElement);setTimeout(queue,80);setTimeout(queue,500);setTimeout(queue,1500)})();`
      document.body.append(reporter)
    }
    return `<!doctype html>${document.documentElement.outerHTML}`
  }, [html, fullDocument, raw, autoSize, greetingsKey])

  const greetingsRef = useRef(greetings)
  const onSelectRef = useRef(onSelectGreeting)
  greetingsRef.current = greetings
  onSelectRef.current = onSelectGreeting
  useLayoutEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.token !== tokenRef.current) return
      if (event.data?.type === 'weijing-select-greeting') {
        const index = Number(event.data.index) || 0
        const text = greetingsRef.current?.[index]
        if (text) onSelectRef.current?.(index, text)
        return
      }
      if (event.data?.type !== 'weijing-render-size') return
      const next = Math.max(40, Math.min(raw ? 4000 : 1200, Number(event.data.height) || 220))
      setHeight((current) => Math.abs(current - next) > 1 ? next : current)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [])

  return <iframe ref={frameRef} className={`message-script-frame ${fullDocument && !raw ? 'full-document' : 'inline-script'}${raw ? ' fenced-page' : ''}`} title="角色卡互动内容" sandbox="allow-scripts" srcDoc={source} style={{ height }} />
}

function MessageContent({ text, role, character, userName, layout = 'bubble', streaming = false, greetings, onSelectGreeting }: { text: string; role: 'user' | 'assistant'; character: Character; userName: string; layout?: 'bubble' | 'flat'; streaming?: boolean } & SceneHooks) {
  const rendered = useMemo(() => {
    const director = character.tags.includes('共演导演') || character.tags.includes('旁白导演')
    const cleanText = role === 'assistant' ? sanitizeAssistantOutput(text, { director }) : text
    const sanitizedText = role === 'assistant' && streaming
      ? stripStatusBlocksForStreaming(cleanText)
      : role === 'assistant' && director
        ? normalizeDirectorStatusOutput(cleanText)
        : cleanText
    const visibleText = role === 'assistant' && !sanitizedText && containsHiddenReasoning(text, director)
      ? '（已拦截模型内部分析；未计入正式剧情。）'
      : sanitizedText
    const pendingAssistant = role === 'assistant' && isPendingAssistantText(visibleText)
    const statusProtocol = role === 'assistant' && !director ? getStatusProtocol(character) : { tag: '', fields: [] }
    const statusTag = role === 'assistant' ? statusProtocol.tag || detectStatusTag(
      character.beautificationProtocol || '',
      character.systemPrompt || '',
      character.postHistoryInstructions || '',
      ...character.regexScripts.map((script) => script.findRegex || ''),
      visibleText,
    ) : ''
    const statusFallback = role === 'assistant' && !streaming && !director && statusTag && !pendingAssistant
      ? buildStatusFallback(character, userName, { output: visibleText })
      : null
    const normalizedText = statusFallback
      ? completeStatusBlock(visibleText, statusTag, statusFallback.content, statusFallback.fields)
      : visibleText
    const orderedText = statusTag ? moveStatusBlockToEnd(normalizedText, statusTag) : normalizedText
    return role === 'assistant'
      ? applyRegexScripts(orderedText, character.regexScripts, character, userName, 2, 'display')
      : applyMacros(visibleText, character, userName)
  }, [text, role, character, userName, streaming])

  const segments = streaming ? null : splitHtmlFences(rendered)
  if (segments) {
    return <div className="message-content message-content-rich message-content-segments">{segments.map((segment, index) => segment.kind === 'html'
      ? <SandboxHtml key={`h${index}`} html={segment.value} raw greetings={greetings} onSelectGreeting={onSelectGreeting} />
      : <RenderedBlock key={`t${index}`} rendered={segment.value} role={role} layout={layout} />)}</div>
  }
  return <RenderedBlock rendered={rendered} role={role} layout={layout} />
}

function RenderedBlock({ rendered, role, layout }: { rendered: string; role: 'user' | 'assistant'; layout: 'bubble' | 'flat' }) {
  if (hasExecutableScript(rendered) || isFullHtmlDocument(rendered)) return <div className="message-content message-content-rich"><SandboxHtml html={rendered} /></div>
  if (looksLikeHtml(rendered)) return <div className="message-content message-content-rich"><SafeInlineHtml html={rendered} /></div>
  const paragraphs = role === 'user' ? userTextParagraphs(rendered) : plainTextParagraphs(rendered)
  return <div className={`message-content message-content-plain ${layout === 'bubble' ? 'message-content-bubble' : 'message-content-flat'}`}><div className={`message-plain-text ${role === 'user' ? 'message-plain-text-user' : ''}`}>{paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 12)}`}>{styledPlainText(paragraph)}</p>)}</div></div>
}

export default memo(MessageContent)
