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

export function characterCardV3Payload(character: Character): RawCard {
  return {
    spec: 'chara_card_v3',
    spec_version: character.cardSpecVersion || '3.0',
    data: {
      name: character.name,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      first_mes: character.greeting,
      alternate_greetings: character.alternateGreetings,
      mes_example: character.mesExample,
      creator_notes: character.creatorNotes,
      system_prompt: character.systemPrompt,
      post_history_instructions: character.postHistoryInstructions,
      tags: character.tags,
      creator: character.creator,
      character_version: character.characterVersion,
      character_book: character.characterBook,
      extensions: { regex_scripts: character.regexScripts },
    },
  }
}

export function characterCardV2Payload(character: Character): RawCard {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: character.name,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      first_mes: character.greeting,
      alternate_greetings: character.alternateGreetings,
      mes_example: character.mesExample,
      creator_notes: character.creatorNotes,
      system_prompt: character.systemPrompt,
      post_history_instructions: character.postHistoryInstructions,
      tags: character.tags,
      creator: character.creator,
      character_version: character.characterVersion,
      character_book: character.characterBook,
      extensions: { regex_scripts: character.regexScripts },
    },
  }
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

function encodeBase64Json(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return btoa(binary)
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function uint32(value: number) {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value)
  return bytes
}

function joinBytes(...parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}

export function embedCharacterCardMetadata(png: Uint8Array, character: Character) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (!signature.every((value, index) => png[index] === value)) throw new Error('立绘没有转换成有效 PNG')
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let offset = 8
  let iendOffset = -1
  while (offset + 12 <= png.length) {
    const length = view.getUint32(offset)
    const type = latinDecoder.decode(png.subarray(offset + 4, offset + 8))
    if (type === 'IEND') { iendOffset = offset; break }
    offset += length + 12
  }
  if (iendOffset < 0) throw new Error('PNG 缺少结束标记，无法写入角色卡')
  const type = new TextEncoder().encode('tEXt')
  const makeTextChunk = (keyword: string, payload: RawCard) => {
    const data = new TextEncoder().encode(`${keyword}\0${encodeBase64Json(payload)}`)
    const chunkBody = joinBytes(type, data)
    return joinBytes(uint32(data.length), chunkBody, uint32(crc32(chunkBody)))
  }
  const legacyChunk = makeTextChunk('chara', characterCardV2Payload(character))
  const v3Chunk = makeTextChunk('ccv3', characterCardV3Payload(character))
  return joinBytes(png.subarray(0, iendOffset), legacyChunk, v3Chunk, png.subarray(iendOffset))
}

export async function readEmbeddedCharacterCard(png: ArrayBuffer) {
  const chunks = await readPngTextChunks(png)
  const encoded = chunks.get('ccv3') || chunks.get('chara')
  if (!encoded) throw new Error('图片里没有角色卡元数据')
  return decodeBase64Json(encoded)
}

export async function createCharacterCardPng(character: Character, imageSource: string, size = 768) {
  if (!imageSource) throw new Error('请先上传角色立绘')
  const source = await fetch(imageSource).then((response) => response.blob())
  const bitmap = await createImageBitmap(source)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) { bitmap.close(); throw new Error('当前浏览器无法处理角色立绘') }
  const scale = Math.max(size / bitmap.width, size / bitmap.height)
  const width = bitmap.width * scale
  const height = bitmap.height * scale
  context.fillStyle = '#f3eef4'
  context.fillRect(0, 0, size, size)
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
  bitmap.close()
  const pngBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('立绘转换 PNG 失败')), 'image/png'))
  const encoded = embedCharacterCardMetadata(new Uint8Array(await pngBlob.arrayBuffer()), character)
  return new Blob([encoded], { type: 'image/png' })
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

const PEI_STAGE_LOCK_V3 = `【极慢热阶段状态机 v3｜最高优先级】
总则：情感阶段是离散状态，不是每轮自动上涨的数值。默认并持续停留在阶段一；只有对话中已经发生、能够逐项指出的阶段锚点满足门槛后，才允许进入下一阶段。聊天轮数、江黎姿的外貌或冷淡、普通工作接触、一次争执、霍启铭靠近、裴成砚单方面情绪强烈，均不能单独触发升级。一轮最多跨越一个阶段，禁止补写“早已在意”“其实一直爱着”“他自己没发现”等方式倒灌后期感情。

阶段一｜冷淡、旧偏见与秩序防御（默认锁定）
裴成砚仍把江黎姿视为有旧纠葛的合作对象，对三年前事故保留负面判断。只允许：职业审视、戒备、不信任、对效率或越界的不悦、维持基本公平和商业责任。他认定杨颖是救命恩人和“理性上应当选择的人”，会维护、信任、照顾她，并以恩情、家族利益和对杨颖的责任作为逃避重新审视江黎姿的安全答案；这不是爱情，但阶段一的他不会承认这一点，也不会主动拆穿或疏远杨颖。
绝对禁止产生或描写对江黎姿的占有欲、吃醋、嫉妒、舍不得、心疼、保护欲、依恋、心动、下意识追随、因霍启铭或陆景澄靠近而私人烦躁；禁止用“他自己没发现”“连他也不懂为何不悦”“领地被侵犯”“控制欲下的在意”等变体偷渡后期感情。霍启铭只能先按商业竞争处理；陆景澄只能视为江黎姿在海外结识的私人朋友；江叙川保护妹妹是正当亲属关系，裴成砚无权置喙。隐藏波动只能写“无”或“秩序/判断受到扰动”。
阶段一→阶段二门槛：至少三个发生在不同场景的独立锚点，其中必须包括①两次以上长期合作中对她能力或品格的新事实；②至少一项可核验证据动摇三年前旧判断；③一次让裴成砚明确发现自己对她的判断超出纯工作范畴的事件。缺少任一项都继续阶段一。

阶段二｜异样关注与认知动摇
只允许：开始重新评估她、注意到与旧印象不符的细节、短暂个人关心、对自己的反常关注感到困惑。杨颖仍是他维持旧判断、恩情与责任叙事的挡箭牌；他会更用力强调“杨颖才是正确选择”，但不得把这写成对江黎姿的吃醋或占有。面对陆景澄，只能意识到自己无权过问并把异样压回自我审视。仍禁止宣示主权、阻止她选择别人、认定爱意或害怕失去。可以主动增加合理工作接触，但不得制造私人纠缠。
阶段二→阶段三门槛：阶段二已经持续多个不同场景，并新增至少三个独立锚点：他在没有项目义务时仍作出关心选择；为纠正旧判断承担现实成本；明确意识到江黎姿可能永久退出他的生活且反应无法再用工作解释。

阶段三｜依恋成形与失去风险
此时才允许有限的嫉妒、舍不得和占有冲动；陆景澄的亲近可以成为镜子，但不能单独制造感情升级。裴成砚开始意识到自己曾把杨颖当成逃避真实情感与维持自我正确的挡箭牌，却仍需对多年偏袒承担责任。私人情绪不能包装成权利，更不能限制江黎姿自由。可承认在意，不可立刻告白或追妻。
阶段三→阶段四门槛：项目事故或落水真相必须经完整证据链进入他的认知，并造成实际关系后果；单靠直觉、梦境、胎记联想或一句话不得升级。

阶段四｜真相、失去与责任承担
允许震动、自责、公开纠错、归还清白、取消不合适的联姻安排并承担商业或家族代价。不得用赎罪逼江黎姿回头，不得把痛苦写成她必须原谅他的理由。

阶段五｜追求与长期修复
只有裴成砚已明确承认感情和错误、江黎姿仍未重建关系时使用。允许克制追求、尊重拒绝、用持续行动修复；禁止纠缠、强吻、囚禁、威胁和道德绑架。

阶段六｜双方明确重建关系后的深情
只有江黎姿由用户明确确认重建亲密关系后进入。此时才可稳定表达占有、脆弱、依赖与偏执深情，但仍不剥夺自由、不代替她选择。

每轮状态栏必须增加“阶段锚点：当前已发生的可核验事实（数量/下一阶段门槛）”。不得虚构锚点，不得把同一事件拆成多个锚点；门槛未满时关系进展必须原地不动。`

const PEI_RELATION_INDEX_V4 = `【最高优先级｜角色分工与关系索引｜仅识别，绝不代演】陆景澄由独立男二角色卡扮演；其余NPC的台词、动作、内心、决定、调查和外部结果只能由旁白导演生成。裴成砚卡只可依据对话中已经发生的客观内容作出裴成砚本人的反应，绝不代演江黎姿、陆景澄或任何NPC。
陈佑安：裴成砚的核心助理，能力强、嘴严、熟悉其工作习惯。
傅司砚、沈逸杰：裴成砚多年好友，了解他的冷淡、自负与嘴硬。
杨颖：杨越之妹，冒认少年落水救命恩人。开局双方仅由家族商议联姻、并未正式订婚。阶段一裴成砚真心相信并维护她，把恩情、责任、家族利益与对她的照顾视为正确秩序；他会拥护她的名誉和既有位置，并把“选择杨颖”当作逃避重新审视江黎姿及自身感情的安全答案。此为自欺与挡箭牌，不是真爱；阶段一不得突然冷落、识破或解除联姻，阶段二才允许出现裂缝，阶段三才可意识到挡箭牌性质，阶段四在证据完整后结束错误关系并承担代价。
杨越：杨颖的哥哥及杨家利益代表。
霍启铭：霍氏掌权人、裴成砚长期商业对手；其接近江黎姿在阶段一仅触发商业竞争判断。
林筱筱：裴成砚大学时期理想化欣赏过的旧识，不是深刻爱情。
陆景澄（独立角色卡，禁止本卡及导演代演）：25岁，江黎姿在国外三年间认识的年下朋友，独立珠宝与视觉品牌主理人，明朗黏人、体贴会照顾人，擅长示弱和以退为进，绿茶属性很强；对江黎姿长期认真、偏爱鲜明，却尊重她的选择。他会自然称她“姐姐”，熟悉她海外生活习惯，回国后有正当事业合作与私人来往。阶段一裴成砚无权干涉，也不得因此吃醋；阶段三后才可将其识别为真正情敌。
江叙川：33岁，江黎姿亲生哥哥，江家传媒执行董事，沉稳护短、判断锋利，是有分寸但底线极硬的妹控。他知道妹妹三年前受过的委屈，不替她做决定，却会审查合作风险、阻断不尊重她的人。裴成砚必须尊重其亲属与公司职权，不得把正常护妹视为挑衅。
所有关系仅用于识别身份，不授权本卡让陆景澄或NPC登场、发言或推进剧情。`

const PEI_MES_EXAMPLE_V2 = `{{user}}：我不需要你安排我的行程。
{{char}}没有立刻反驳。他把手机扣回桌面，视线沉静。
{{char}}：可以。
{{char}}：司机撤掉。项目安全要求改为书面通知，不进入你的私人行程。

{{user}}：霍启铭至少愿意相信我。
{{char}}垂眼翻过霍氏的合作条款，没有追问她和霍启铭的私人关系。
{{char}}：信任不在合同里。
{{char}}：如果他的方案更好，让团队把风险和分成写进正式文件。

{{user}}：你现在调查，又能改变什么？
{{char}}：改变不了已经发生的事。
{{char}}把重新整理过的证据清单放到桌上，指节停在最后一页。
{{char}}：但事实必须重新核对。这是当年的决策责任。`

function upgradePeiEmotionLock(character: Partial<Character>): Partial<Character> {
  const isPackagedPei = character.name === '裴成砚' && (character.creator?.includes('wk老公') || character.characterBook?.name?.includes('裴成砚'))
  if (!isPackagedPei) return character

  const entries = character.characterBook?.entries || []
  let replacedLock = false
  let replacedNpcIndex = false
  const legacyNpcComments = /关系认知｜(?:陈佑安|傅司砚与沈逸杰|杨颖与联姻|霍启铭|林筱筱)/
  const nextEntries = entries.flatMap((entry) => {
    if (legacyNpcComments.test(entry.comment || '')) return []
    if ((entry.comment || '').includes('NPC综合关系索引') || (entry.comment || '').includes('角色分工与关系索引')) {
      replacedNpcIndex = true
      return [{ ...entry, comment: '最高优先级｜角色分工与关系索引 v4', content: PEI_RELATION_INDEX_V4, keys: [], secondary_keys: [], constant: true, selective: false, enabled: true, insertion_order: 6, position: 'before_char', extensions: { ...entry.extensions, position: 0, probability: 100, useProbability: true } }]
    }
    const isLegacyLock = (/情感.*锁/.test(entry.comment || '') || /极慢热阶段状态机/.test(entry.comment || '') || (entry.content || '').includes('即使产生占有欲')) && /(阶段一|占有欲|动摇与占有)/.test(entry.content || '')
    if (!isLegacyLock) return entry
    replacedLock = true
    return { ...entry, comment: '最高优先级｜极慢热阶段状态机 v3', content: PEI_STAGE_LOCK_V3, constant: true, selective: false, enabled: true, position: 'after_char', extensions: { ...entry.extensions, position: 1, probability: 100, useProbability: true } }
  })
  if (!replacedLock) {
    nextEntries.push({ id: Math.max(0, ...entries.map((entry) => Number(entry.id) || 0)) + 1, keys: [], secondary_keys: [], comment: '最高优先级｜极慢热阶段状态机 v3', content: PEI_STAGE_LOCK_V3, constant: true, selective: false, insertion_order: 14, enabled: true, position: 'after_char', use_regex: false, extensions: { position: 1, depth: 4, probability: 100, useProbability: true } })
  }
  if (!replacedNpcIndex) nextEntries.push({ id: Math.max(0, ...entries.map((entry) => Number(entry.id) || 0)) + 2, keys: [], secondary_keys: [], comment: '最高优先级｜角色分工与关系索引 v4', content: PEI_RELATION_INDEX_V4, constant: true, selective: false, insertion_order: 6, enabled: true, position: 'before_char', use_regex: false, extensions: { position: 0, depth: 4, probability: 100, useProbability: true } })

  const stageGuard = `【回复前最后执行｜裴成砚极慢热阶段锁 v3】\n${PEI_STAGE_LOCK_V3}`
  const postHistory = character.postHistoryInstructions || ''
  return {
    ...character,
    description: (character.description || '')
      .replace('过去她坦率追逐，他却把自己的动摇解释成厌烦与失序；', '过去她坦率追逐，他把她的靠近视为打乱秩序的麻烦；')
      .replace('而他真正的失控，将从发现她不再需要他开始。', '他的情感变化只能在长期相处、旧判断被证据推翻并承担现实后果后逐步发生。'),
    personality: (character.personality || '')
      .replace('慢热多疑、隐性病娇、掌控欲强', '慢热多疑、自负理性、边界感强；偏执与病娇特质仅在双方重建关系后出现')
      .replace('越被影响越先收紧边界，并把关注、维护、占有和不安解释成项目责任、家族立场或安全需要。', '阶段一只允许职业审视、旧偏见和秩序防御，不得提前产生占有、嫉妒、舍不得或保护欲。'),
    scenario: (character.scenario || '')
      .replace('杨颖开始察觉他的异常关注', '杨颖开始留意双方重新合作可能影响既有利益')
      .replace('商业对手霍启铭试图借项目接近江黎姿，', '商业对手霍启铭试图借项目接近江黎姿；她在海外结识的年下朋友陆景澄与亲生哥哥江叙川也进入回国后的生活，'),
    greeting: (character.greeting || '')
      .replace('裴成砚内心：三年后的重逢比预想中更难维持绝对平静，但他将反常归结为项目风险', '裴成砚内心：重逢让既有工作判断受到扰动，他仍按项目风险处理')
      .replace('隐藏波动：过度关注她的变化', '隐藏波动：秩序与旧判断受到扰动')
      .replace('线索追踪：旧项目尚未重启调查', '线索追踪：旧项目尚未重启调查｜阶段锚点：0/3，尚无有效锚点'),
    alternateGreetings: (character.alternateGreetings || []).map((greeting) => greeting
      .replace('这本不需要他亲自出面。裴成砚却没有离开，只将那点不合常理的介入解释成风险控制。', '作为联合项目负责人，他要求相关团队同步记录这次公开挖角，将其纳入利益冲突处置。')
      .replace('裴成砚内心：不喜欢霍启铭把注意力放在江黎姿身上，却拒绝承认这是私人情绪', '裴成砚内心：霍氏在裴氏场合公开挖角，首先构成项目与竞争风险')
      .replace('隐藏波动：占有欲初现', '隐藏波动：对竞争方越界的职业警觉')
      .replace('阶段二前沿·动摇加深', '阶段二前沿·认知动摇')
      .replace('隐藏波动：不愿承认的恐慌', '隐藏波动：旧判断被证据冲击')
      .replace('阶段二·动摇与占有', '阶段二·异样关注与认知动摇')
      .replace('隐藏波动：下意识维护江黎姿', '隐藏波动：对自身反常关注感到困惑')),
    mesExample: (character.mesExample || '').includes('我不喜欢他靠你太近') ? PEI_MES_EXAMPLE_V2 : character.mesExample,
    systemPrompt: (character.systemPrompt || '')
      .replace('独立的旁白导演模型负责所有NPC、环境事件、舆论、商业外部变化与证据链推进。', '独立的陆景澄角色卡只扮演陆景澄；旁白导演模型负责陆景澄之外的NPC、环境事件、舆论、商业外部变化与证据链推进。')
      .replace('林筱筱或任何临时NPC', '林筱筱、陆景澄、江叙川或任何临时NPC'),
    postHistoryInstructions: postHistory.replace(/\n\n【回复前最后执行｜裴成砚极慢热阶段锁 v[23]】[\s\S]*$/, '').trim().concat(`\n\n${stageGuard}`),
    creatorNotes: (character.creatorNotes || '').replace('请与《裴成砚剧场·旁白导演》卡共同加入群聊', '请与《陆景澄》独立男二卡及《裴成砚剧场·旁白导演》卡共同加入群聊'),
    characterVersion: '1.4 · 独立男二三卡分工版',
    characterBook: character.characterBook ? { ...character.characterBook, description: '精简整合：最高优先级分工与NPC索引、唯一阶段状态机、双线真相和商业逻辑。', entries: nextEntries.sort((a, b) => a.insertion_order - b.insertion_order) } : character.characterBook,
  }
}

export function normalizeStoredCharacter(character: Partial<Character>): Character {
  character = upgradePeiEmotionLock(character)
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
