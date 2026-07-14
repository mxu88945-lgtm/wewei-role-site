export type GroupReplyMode = 'natural' | 'contextual' | 'all' | 'specified'

type GroupParticipant = { id: string; name: string }

type SelectGroupSpeakersOptions = {
  participantIds: string[]
  mentionedIds: string[]
  mode: GroupReplyMode
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

export function selectGroupSpeakerIds({ participantIds, mentionedIds, mode, lastSpeakerId, text, random = Math.random }: SelectGroupSpeakersOptions) {
  const explicitMentions = participantIds.filter((id) => mentionedIds.includes(id))

  // An explicit @ is a direct instruction and must override every automatic reply mode.
  if (explicitMentions.length) return explicitMentions
  if (mode === 'specified') return []
  if (mode === 'all') return participantIds

  const availableIds = participantIds.filter((id) => id !== lastSpeakerId)
  const pool = availableIds.length ? availableIds : participantIds
  const first = pool[Math.floor(random() * Math.max(1, pool.length))]
  const speakerIds = first ? [first] : []

  if (mode === 'contextual' && /你们|大家|两人|所有人|一起|分别/.test(text)) {
    const second = participantIds.find((id) => id !== first)
    if (second) speakerIds.push(second)
  }
  return speakerIds
}
