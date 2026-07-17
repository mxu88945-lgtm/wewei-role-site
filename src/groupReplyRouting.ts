export type GroupReplyMode = 'natural' | 'contextual' | 'all' | 'specified'

type GroupParticipant = { id: string; name: string }

type SelectGroupSpeakersOptions = {
  participantIds: string[]
  mentionedIds: string[]
  mode: GroupReplyMode
  directorCharacterId?: string
  lastSpeakerId?: string
  text: string
  random?: () => number
}

export function findMentionedParticipantIds(text: string, participants: GroupParticipant[]) {
  const mentionedIds: string[] = []
  const mentionPattern = /[@＠]/g

  for (const match of text.matchAll(mentionPattern)) {
    const nameStart = (match.index ?? 0) + match[0].length
    const matchedParticipant = participants
      .filter((participant) => participant.name && text.startsWith(participant.name, nameStart))
      .sort((left, right) => right.name.length - left.name.length)[0]
    if (matchedParticipant && !mentionedIds.includes(matchedParticipant.id)) mentionedIds.push(matchedParticipant.id)
  }
  return mentionedIds
}

export function selectGroupSpeakerIds({ participantIds, mentionedIds, mode, directorCharacterId, lastSpeakerId, text, random = Math.random }: SelectGroupSpeakersOptions) {
  const explicitMentions = participantIds.filter((id) => mentionedIds.includes(id))
  const resolvedDirectorId = directorCharacterId || participantIds.find((id) => /director/i.test(id))

  // An explicit @ is a direct instruction and must override every automatic reply mode.
  if (explicitMentions.length) return explicitMentions
  if (mode === 'specified') return []
  if (mode === 'all') return participantIds

  // The director is a control role, not a normal actor in the random speaker
  // pool. It only enters when the user explicitly asks it to move the scene.
  if (resolvedDirectorId && /(?:旁白|导演)(?:推进|继续|调度|安排)|推进(?:剧情|场景|下一幕|一下)/.test(text)) {
    return [resolvedDirectorId]
  }

  const actorIds = participantIds.filter((id) => id !== resolvedDirectorId)
  const availableIds = actorIds.filter((id) => id !== lastSpeakerId)
  const pool = availableIds.length ? availableIds : actorIds
  const first = pool[Math.floor(random() * Math.max(1, pool.length))]
  const speakerIds = first ? [first] : []

  if (mode === 'contextual' && /你们|大家|两人|所有人|一起|分别/.test(text)) {
    const second = participantIds.find((id) => id !== first)
    if (second) speakerIds.push(second)
  }
  return speakerIds
}
