export type PresetSection = {
  id: string
  name: string
  content: string
  enabled: boolean
}

export const defaultPresetSections = (legacy = ''): PresetSection[] => [
  { id: crypto.randomUUID(), name: 'Main Prompt', content: legacy || '克制、细腻、慢热；每轮携带微量剧情进展。', enabled: true },
  { id: crypto.randomUUID(), name: '主角保护', content: '只描写角色、NPC 与环境，不替用户决定言行、心理、身体反应或关键选择。', enabled: true },
  { id: crypto.randomUUID(), name: '剧情推进', content: '保持人物关系与既有时间线连续；每轮携带少量自然的剧情进展，避免跳跃推进。', enabled: true },
]

export function normalizePresetSections(value: unknown, legacy = ''): PresetSection[] {
  if (!Array.isArray(value) || !value.length) return defaultPresetSections(legacy)
  const sections = value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return []
    const source = item as Partial<PresetSection>
    return [{
      id: typeof source.id === 'string' && source.id ? source.id : crypto.randomUUID(),
      name: typeof source.name === 'string' && source.name.trim() ? source.name : `提示词 ${index + 1}`,
      content: typeof source.content === 'string' ? source.content : '',
      enabled: source.enabled !== false,
    }]
  })
  return sections.length ? sections : defaultPresetSections(legacy)
}

export function enabledPresetText(sections: PresetSection[]) {
  return sections.filter((section) => section.enabled && section.content.trim()).map((section) => `【${section.name}】\n${section.content.trim()}`).join('\n\n')
}
