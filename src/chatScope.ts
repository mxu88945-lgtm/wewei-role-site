// Which "scope" a page belongs to. A story conversation's own persona and bound
// theme apply only inside that conversation's chat (and the chat-settings pages
// opened from it). Home, 小手机, the forum, background ticks and global settings
// always use the user's global identity and default theme.

export type ScopeIdentity = { id: string; name: string; description: string; avatar?: string }
export type ScopeConversation = { id: string; personaId?: string; themePresetId?: string; updatedAt?: number; phone?: unknown }

export const DEFAULT_IDENTITY: ScopeIdentity = { id: 'persona-default', name: '周惟惟', description: '由用户亲自决定言行、心理与关键选择。' }

// Pages that, when opened from a chat, still belong to that chat.
export const CHAT_SUB_PAGES: ReadonlySet<string> = new Set([
  'chat-search', 'request-preview', 'temporary-plot', 'story-scripts', 'card-data', 'theater-world',
  'identity', 'appearance', 'font', 'display-reply', 'director-template', 'character-detail',
  'card-worldbook', 'card-regex', 'card-memory', 'memory', 'memory-api', 'memory-list', 'greeting-picker',
])

/** True on the chat page, or on a chat sub-page reached (directly or via other sub-pages) from the chat. */
export function isChatScoped(page: string, history: ReadonlyArray<{ page: string }>): boolean {
  if (page === 'chat') return true
  if (!CHAT_SUB_PAGES.has(page)) return false
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index].page
    if (entry === 'chat') return true
    if (!CHAT_SUB_PAGES.has(entry)) return false
  }
  return false
}

/** The user's global identity: the globally selected persona, else the first, else 周惟惟. */
export function pickGlobalIdentity<T extends ScopeIdentity>(identities: readonly T[], activePersonaId: string): T | ScopeIdentity {
  return identities.find((item) => item.id === activePersonaId) || identities[0] || DEFAULT_IDENTITY
}

/** The identity used for one conversation (its bound persona) — falls back to the global identity. */
export function pickIdentity<T extends ScopeIdentity>(conversation: ScopeConversation | undefined, identities: readonly T[], activePersonaId: string): T | ScopeIdentity {
  return (conversation?.personaId && identities.find((item) => item.id === conversation.personaId)) || pickGlobalIdentity(identities, activePersonaId)
}

/**
 * The theme on screen. A conversation's bound theme only counts while that chat is
 * in scope; everywhere else the user's stable default theme applies.
 */
export function pickThemeId(chatScoped: boolean, conversation: ScopeConversation | undefined, defaultThemePresetId: string): string {
  return (chatScoped && conversation?.themePresetId) || defaultThemePresetId || ''
}

/**
 * One-time default for installs that never stored a default theme: the theme of the
 * most recently used themed story chat at startup. Computed once and saved, so it
 * never changes again just because another conversation got updated.
 */
export function legacyDefaultThemeId(conversations: readonly ScopeConversation[]): string {
  return [...conversations].filter((item) => item.themePresetId && !item.phone).sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0))[0]?.themePresetId || ''
}

/**
 * Older builds let picking a persona inside a story chat overwrite the global
 * persona, and stamped the global persona onto every 小手机 chat created afterwards.
 * One-time repair: a global persona that is bound to a story chat (and is not the
 * first identity) goes back to the first identity, and 小手机 chats lose any
 * story-only persona they inherited that way, so they follow the global identity.
 * Returns null when nothing needs changing.
 */
export function repairLeakedGlobalPersona<C extends ScopeConversation>(conversations: readonly C[], identities: readonly ScopeIdentity[], activePersonaId: string): { activePersonaId: string; conversations: C[] } | null {
  const first = identities[0]
  if (!first) return null
  const storyPersonas = new Set(conversations.filter((item) => !item.phone && item.personaId && item.personaId !== first.id).map((item) => item.personaId as string))
  const nextPersonaId = storyPersonas.has(activePersonaId) && identities.some((item) => item.id === activePersonaId) ? first.id : activePersonaId
  let changed = nextPersonaId !== activePersonaId
  const next = conversations.map((item) => {
    if (!item.phone || !item.personaId || !storyPersonas.has(item.personaId)) return item
    changed = true
    return { ...item, personaId: undefined }
  })
  return changed ? { activePersonaId: nextPersonaId, conversations: next } : null
}
