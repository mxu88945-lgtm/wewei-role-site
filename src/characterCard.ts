export type CardSpec = 'chara_card_v2' | 'chara_card_v3' | string

export type WorldBookEntryExtensions = {
  position?: number
  display_index?: number
  probability?: number
  useProbability?: boolean
  depth?: number
  selectiveLogic?: number
  group?: string
  group_override?: boolean
  group_weight?: number
  prevent_recursion?: boolean
  delay_until_recursion?: boolean
  scan_depth?: number | null
  match_whole_words?: boolean | null
  case_sensitive?: boolean | null
  role?: number
  sticky?: number
  cooldown?: number
  delay?: number
  [key: string]: unknown
}

export type WorldBookEntry = {
  id: number
  keys: string[]
  secondary_keys: string[]
  comment: string
  content: string
  constant: boolean
  selective: boolean
  insertion_order: number
  enabled: boolean
  position: string
  use_regex: boolean
  extensions: WorldBookEntryExtensions
}

export type CharacterBook = {
  name: string
  entries: WorldBookEntry[]
  [key: string]: unknown
}

export type RegexScript = {
  id: string
  scriptName: string
  findRegex: string
  replaceString: string
  trimStrings: string[]
  placement: number[]
  disabled: boolean
  markdownOnly: boolean
  promptOnly: boolean
  runOnEdit: boolean
  substituteRegex: number
  minDepth: number | null
  maxDepth: number | null
  [key: string]: unknown
}

export type Character = {
  id: string
  name: string
  tagline: string
  description: string
  personality: string
  scenario: string
  greeting: string
  alternateGreetings: string[]
  mesExample: string
  creatorNotes: string
  systemPrompt: string
  postHistoryInstructions: string
  tags: string[]
  creator: string
  characterVersion: string
  avatar?: string
  cardSpec?: CardSpec
  cardSpecVersion?: string
  sourceFileName?: string
  characterBook?: CharacterBook
  regexScripts: RegexScript[]
  rawCard?: Record<string, unknown>
}

type CardData = Record<string, unknown> & {
  name?: string
  description?: string
  personality?: string
  scenario?: string
  first_mes?: string
  mes_example?: string
  creator_notes?: string
  system_prompt?: string
  post_history_instructions?: string
  tags?: string[]
  creator?: string
  character_version?: string
  alternate_greetings?: string[]
  character_book?: CharacterBook
  extensions?: Record<string, unknown> & { regex_scripts?: RegexScript[] }
}

type RawCard = Record<string, unknown> & {
  spec?: CardSpec
  spec_version?: string
  name?: string
  description?: string
  personality?: string
  scenario?: string
  first_mes?: string
  mes_example?: string
  data?: CardData
}

const textDecoder = new TextDecoder()
const latinDecoder = new TextDecoder('latin1')

function readNullTerminated(bytes: Uint8Array, start: number) {
  let end = start
  while (end < bytes.length && bytes[end] !== 0) end += 1
  return { value: latinDecoder.decode(bytes.subarray(start, end)), next: end + 1 }
}

async function inflate(bytes: Uint8Array) {
  if (!('DecompressionStream' in window)) throw new Error('当前浏览器不能解压压缩角色卡元数据')
  const payload = bytes.slice().buffer as ArrayBuffer
  const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readPngTextChunks(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (!signature.every((value, index) => bytes[index] === value)) throw new Error('这不是有效的 PNG 角色卡')

  const view = new DataView(buffer)
  const chunks = new Map<string, string>()
  let offset = 8

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = latinDecoder.decode(bytes.subarray(offset + 4, offset + 8))
    const data = bytes.subarray(offset + 8, offset + 8 + length)

    if (type === 'tEXt') {
      const key = readNullTerminated(data, 0)
      chunks.set(key.value, latinDecoder.decode(data.subarray(key.next)))
    } else if (type === 'zTXt') {
      const key = readNullTerminated(data, 0)
      chunks.set(key.value, textDecoder.decode(await inflate(data.subarray(key.next + 1))))
    } else if (type === 'iTXt') {
      const key = readNullTerminated(data, 0)
      const compressed = data[key.next] === 1
      let cursor = key.next + 2
      cursor = readNullTerminated(data, cursor).next
      cursor = readNullTerminated(data, cursor).next
      const payload = data.subarray(cursor)
      chunks.set(key.value, textDecoder.decode(compressed ? await inflate(payload) : payload))
    }

    offset += length + 12
    if (type === 'IEND') break
  }

  return chunks
}

function decodeBase64Json(value: string) {
  try {
    const binary = atob(value.replace(/\s/g, ''))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return JSON.parse(textDecoder.decode(bytes)) as RawCard
  } catch {
    throw new Error('角色卡元数据存在，但 Base64 JSON 无法解析')
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function plainTextPreview(value: string, fallback: string) {
  const text = value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`#*_>~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, 54) || fallback
}

async function createAvatarThumbnail(file: File) {
  const bitmap = await createImageBitmap(file)
  const size = 384
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return ''
  const scale = Math.max(size / bitmap.width, size / bitmap.height)
  const width = bitmap.width * scale
  const height = bitmap.height * scale
  context.fillStyle = '#eee9f0'
  context.fillRect(0, 0, size, size)
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.82)
}

export async function importCharacterCard(file: File): Promise<Character> {
  const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
  const isJson = file.type.includes('json') || file.name.toLowerCase().endsWith('.json')
  let rawCard: RawCard
  if (isPng) {
    const chunks = await readPngTextChunks(await file.arrayBuffer())
    const encoded = chunks.get('ccv3') || chunks.get('chara')
    if (!encoded) throw new Error('图片里没有找到 chara 或 ccv3 角色卡元数据')
    rawCard = decodeBase64Json(encoded)
  } else if (isJson) {
    try { rawCard = JSON.parse(await file.text()) as RawCard } catch { throw new Error('JSON 角色卡格式无效') }
  } else {
    throw new Error('请导入 PNG 或 JSON 角色卡')
  }
  const data = rawCard.data || rawCard
  const name = stringValue(data.name || rawCard.name).trim()
  if (!name) throw new Error('角色卡缺少角色名称')

  const description = stringValue(data.description || rawCard.description)
  const greeting = stringValue(data.first_mes || rawCard.first_mes) || '你来了。'
  const extensions = (data.extensions && typeof data.extensions === 'object' ? data.extensions : {}) as NonNullable<CardData['extensions']>
  const regexScripts = Array.isArray(extensions.regex_scripts) ? extensions.regex_scripts : []
  const characterBook = data.character_book && typeof data.character_book === 'object'
    ? data.character_book as CharacterBook
    : undefined

  return {
    id: crypto.randomUUID(),
    name,
    tagline: plainTextPreview(description, `${rawCard.spec_version || '角色卡'} · 导入角色`),
    description,
    personality: stringValue(data.personality || rawCard.personality),
    scenario: stringValue(data.scenario || rawCard.scenario),
    greeting,
    alternateGreetings: stringArray(data.alternate_greetings),
    mesExample: stringValue(data.mes_example || rawCard.mes_example),
    creatorNotes: stringValue(data.creator_notes),
    systemPrompt: stringValue(data.system_prompt),
    postHistoryInstructions: stringValue(data.post_history_instructions),
    tags: stringArray(data.tags),
    creator: stringValue(data.creator),
    characterVersion: stringValue(data.character_version),
    avatar: isPng ? await createAvatarThumbnail(file) : undefined,
    cardSpec: rawCard.spec,
    cardSpecVersion: rawCard.spec_version,
    sourceFileName: file.name,
    characterBook,
    regexScripts,
    rawCard,
  }
}

export function createBlankCharacter(input: { name: string; tagline: string; description: string; greeting: string; tags: string }): Character {
  return {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    tagline: input.tagline.trim() || '新的角色',
    description: input.description.trim(),
    personality: '',
    scenario: '',
    greeting: input.greeting.trim() || '你来了。',
    alternateGreetings: [],
    mesExample: '',
    creatorNotes: '',
    systemPrompt: '',
    postHistoryInstructions: '',
    tags: input.tags.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
    creator: '',
    characterVersion: '',
    regexScripts: [],
  }
}

export function normalizeStoredCharacter(character: Partial<Character>): Character {
  return {
    id: character.id || crypto.randomUUID(),
    name: character.name || '未命名角色',
    tagline: character.tagline || '角色卡',
    description: character.description || '',
    personality: character.personality || '',
    scenario: character.scenario || '',
    greeting: character.greeting || '你来了。',
    alternateGreetings: character.alternateGreetings || [],
    mesExample: character.mesExample || '',
    creatorNotes: character.creatorNotes || '',
    systemPrompt: character.systemPrompt || '',
    postHistoryInstructions: character.postHistoryInstructions || '',
    tags: character.tags || [],
    creator: character.creator || '',
    characterVersion: character.characterVersion || '',
    avatar: character.avatar,
    cardSpec: character.cardSpec,
    cardSpecVersion: character.cardSpecVersion,
    sourceFileName: character.sourceFileName,
    characterBook: character.characterBook,
    regexScripts: character.regexScripts || [],
    rawCard: character.rawCard,
  }
}
