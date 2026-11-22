import { useEffect, useRef, useState } from 'react'

export type DraftScope = string

const STORAGE_KEY = 'weijing.composerDrafts'
type DraftMap = Record<string, string>

function readDrafts(): DraftMap {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as unknown
    return value && typeof value === 'object' ? value as DraftMap : {}
  } catch { return {} }
}

function writeDrafts(value: DraftMap) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) } catch { /* 私密模式/配额不足不影响发送 */ }
}

export function draftScopeKey(kind: 'chat' | 'persona', id: string) {
  return `composer:${kind}:${id || 'default'}`
}

export function readScopedDraft(scope: DraftScope): string {
  return readDrafts()[scope] || ''
}

export function saveScopedDraft(scope: DraftScope, value: string) {
  const drafts = readDrafts()
  if (value) drafts[scope] = value
  else delete drafts[scope]
  writeDrafts(drafts)
}

/** Scope-isolated draft state. Drafts are deliberately local-only and never part of chat history. */
export function useScopedDraft(scope: DraftScope) {
  const [draft, setDraft] = useState(() => readScopedDraft(scope))
  const scopeRef = useRef(scope)
  const skipSaveRef = useRef(false)

  useEffect(() => {
    if (scopeRef.current === scope) return
    scopeRef.current = scope
    skipSaveRef.current = true
    setDraft(readScopedDraft(scope))
  }, [scope])

  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false
      return
    }
    saveScopedDraft(scope, draft)
  }, [scope, draft])

  return [draft, setDraft] as const
}
