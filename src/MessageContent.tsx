import { useEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import type { Character, RegexScript } from './characterCard'

function parseRegex(source: string) {
  const trimmed = source.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('/')) {
    const lastSlash = trimmed.lastIndexOf('/')
    if (lastSlash > 0) {
      const pattern = trimmed.slice(1, lastSlash)
      const flags = trimmed.slice(lastSlash + 1) || 'g'
      return new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`)
    }
  }
  return new RegExp(trimmed, 'g')
}

function macros(value: string, character: Character, userName: string) {
  return value
    .split('{{char}}').join(character.name)
    .split('{{user}}').join(userName)
}

export function applyDisplayRegex(text: string, scripts: RegexScript[], character: Character, userName: string) {
  let output = macros(text, character, userName)
  for (const script of scripts) {
    if (script.disabled || script.promptOnly || (script.placement.length && !script.placement.includes(2))) continue
    try {
      const regex = parseRegex(macros(script.findRegex, character, userName))
      if (!regex) continue
      output = output.replace(regex, macros(script.replaceString, character, userName))
      for (const trim of script.trimStrings || []) output = output.split(macros(trim, character, userName)).join('')
    } catch (error) {
      console.warn(`正则“${script.scriptName}”执行失败`, error)
    }
  }
  return output.trim()
}

function unwrapCodeFence(value: string) {
  return value
    .replace(/^```(?:html|xml)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function looksLikeHtml(value: string) {
  return /<!doctype\s+html|<html[\s>]|<(?:div|section|article|style|audio|details|table|p|span)\b/i.test(value)
}

function HtmlFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(220)
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
      const next = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0, 120)
      setHeight(Math.min(next + 8, 2400))
    }
    frame.addEventListener('load', sync)
    const timer = window.setInterval(sync, 700)
    return () => { frame.removeEventListener('load', sync); window.clearInterval(timer) }
  }, [safeHtml])

  return <iframe ref={ref} className="message-html-frame" title="角色卡美化内容" sandbox="allow-same-origin allow-popups" srcDoc={safeHtml} style={{ height }} />
}

export default function MessageContent({ text, role, character, userName }: { text: string; role: 'user' | 'assistant'; character: Character; userName: string }) {
  const rendered = useMemo(() => role === 'assistant'
    ? applyDisplayRegex(text, character.regexScripts, character, userName)
    : macros(text, character, userName), [text, role, character, userName])

  if (looksLikeHtml(rendered)) return <HtmlFrame html={rendered} />
  return <div className="message-plain-text">{rendered}</div>
}
