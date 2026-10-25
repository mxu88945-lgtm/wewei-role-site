import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ApiSettingsPage from './ApiSettingsPage'
import BackupCard from './BackupCard'
import ChatSearchPage from './ChatSearchPage'
import TemporaryPlotPage, { type PlotTemplate } from './TemporaryPlotPage'
import RequestPreviewPage, { type RequestPreview } from './RequestPreviewPage'
import './story-tools.css'
import PresetEditor from './PresetEditor'
import CharacterCardManager from './CharacterCardManager'
import { GreetingPicker, GroupGreetingPicker, ImportPreview, type GroupGreetingChoice } from './ImportFlow'
import MentionPicker from './MentionPicker'
import { prewarmAvatarThumbnails } from './avatarThumbnail'
import MessageContent, { isPendingAssistantText } from './MessageContent'
import PhoneStatusWidget from './PhoneStatusWidget'
import PhoneLockScreen from './PhoneLockScreen'
import PhoneWebSettings from './PhoneWebSettings'
import { TAVILY_KEY_STORAGE, buildSearchQuery, needsWebSearch, tavilySearch } from './phoneWeb'
import { createBlankCharacter, importCharacterCard, normalizeStoredCharacter, LIBRARY_ROLES, type Character, type LibraryRole } from './characterCard'
import { type MomentSeed } from './Moments'
import { Forum } from './Forum'
import { DAY_DM_KEY, LATE_NIGHT_KEY, PAT_LINE, canDayDm, dayDmReason, nextDayDmState, type DayDmState, applyPatTags, applyRedPacketTags, buildRedPacketNote, createRedPacket, findRedPacket, lateNightKey, parseRedPacketLine, parseTransferLine, transferText, TRANSFER_NOTE, readRedPackets, redPacketOrdinal, redPacketText, userPatText, writeRedPackets, type RedPacketLineInfo } from './phoneFun'
import { RedPacketCard, RedPacketDetail, RedPacketSendSheet, TransferCard, TransferSheet } from './RedPacket'
import { messageTime, phoneTimeLabel, showPhoneTimeDivider } from './phoneTime'
import { latestMessageId, phoneUnreadCount, unreadLabel } from './phoneUnread'
import { FORUM_USER, buildForumRecapNote, findForumThread, forumShareText, threadsFromMoments, type ForumThread } from './forum'
import PhoneAutoSettingsCard from './PhoneAutoSettings'
import PhonePointsCard from './PhonePointsCard'
import { fixStageMentions, phoneStageNameNote } from './phoneStageName'
import { addWishPoolLine, grantedWishLine, takeWishPoolTags, wishPoolNote } from './wishPool'
import { applyPardons, applyShopTags, buildShopNote, readShop, spendLockTicket, takePriority, writeShop } from './phoneShop'
import PhoneShop from './PhoneShop'
import PhoneGames, { PhoneGameCard } from './PhoneGames'
import { buildPhoneGameNote, nextPhoneGame, phoneGameSpeakers, phoneGameText, type GamePlayer, type PhoneGameKind, type PhoneGameRound, type TruthMode } from './phoneGames'
import { collageAvatar, phoneAvatarSignature, squareAvatarFromFile } from './groupAvatar'
import { PHONE_POINTS_EVENT, addPoints, applyMessagePoints, buildPointsNote, readPoints, todayTopPoints, writePoints } from './phonePoints'
import { FORUM_UPDATED_EVENT, dueRunAt, forumAutoTick, forumWelcomeThread, isQuietHour, pickAutoGroup, readPhoneAuto, writePhoneAuto } from './phoneAuto'
import type { Moment } from './moments'
import { USER_AUTHOR, communityMemberIds, excerptFromMessage } from './moments'
import { buildBackstageNote, buildDmGroupPeek, buildGroupDmPeek, parsePhoneForumShare, stripPhoneForumShareTag, phoneDeliveryInstruction, phoneDmRules, phonePromptHistory, PHONE_COMPLETION_TIMEOUT_MS } from './phoneGroup'
import { PhoneChatInfo } from './PhoneChatInfo'
import { NOTICE_DURATIONS, lurkFallback, activeNotice, noticeRemaining, buildNoticeNote, findAtMentionIds, queueSummons, parsePhoneQuit, parsePhoneKick, parsePhoneVote, kickPassed, findNamedParticipantIds, selectPhoneSpeakers, pickPhoneChatters, cleanPhoneOutput, phoneGroupDisplayTitle, phoneStreamPreview, containsPhoneReasoning, phoneFinalGuard, buildSmartPickPrompt, buildMicPrompt, parseMicAnswer, parseSmartPick, buildPhoneArchive, buildPhoneGroupBackground, phoneBindingCandidates, buildPhoneRealWorldNote, parsePhoneLockCommand, buildPhoneLockBreachNote, type PhoneLockState, type PhoneLockBreach, phoneCharacter, phoneModeRules, stripPhoneQuitTag, stripPhoneKickTag, computeStoryUpdates, resetStorySeenForBindingChanges, storyUpdateNotice, buildStoryUpdateNote } from './phoneGroup'
import { assignChatGroup, chatGroupNames, groupConversations, setChatGroupMembers } from './chatGroups'
import { assignLibraryGroup, setLibraryGroupMembers, effectiveLibraryRole, groupLibraryCharacters, LIBRARY_ROLE_LABELS, libraryGroupNames } from './characterLibraryGroups'
import { activeCharacterMemory, characterMemoryEntryFromConversation, characterMemoryExtractionPrompt, characterMemorySummaryProtocol, parseCharacterMemoryCandidates, splitCharacterMemorySummary } from './characterMemory'
import { ChatApiError, completeChat, fetchApiModels, testApiConnection, type ApiConfig, type ApiModel } from './chatApi'
import { buildChatPrompt } from './promptBuilder'
import { CHAT_IMAGE_LIMIT, CHAT_VIDEO_MAX_FRAMES, prepareChatImage, prepareChatVideo, type ChatImage } from './chatImages'
import { captureTemporaryPlot, consumeTemporaryPlot, withAssistantRetryInstruction, withFinalTemporaryPlotInstruction } from './temporaryPlot'
import { checkAndRepairTemporaryPlot, reviewTemporaryPlotReply } from './temporaryPlotReview'
import { resolveChatScrollTarget, type ChatScrollSnapshot } from './chatScroll'
import { createApiChannel, isApiChannelComplete, normalizeApiChannels, resolveApiChannel, withApiModel, type ApiChannel } from './apiChannels'
import { enabledPresetText, normalizePresetSections } from './presetConfig'
import { durableGet, durableSet } from './persistentStore'
import { completeStatusBlock, containsHiddenReasoning, hasCompleteRoleplayBody, hasGroupIdentityLeak, moveStatusBlockToEnd, normalizeDirectorStatusOutput, sanitizeAssistantOutput, stripLeadingSpeakerLabels, stripStatusBlocksForStreaming } from './outputSanitizer'
import { hasCompleteCoreMemoryPayload, isMemoryScanCurrent, planMemoryScan } from './memoryScan'
import { archivedMemoriesForConversation, memoriesForConversation, replaceConversationMemories, restoreMemoryToRevision } from './memoryEngine'
import { findMentionedParticipantIds, isRoleplayPauseCommand, mentionsEveryone, selectGroupSpeakerIds, stripParticipantMentions, type GroupReplyMode } from './groupReplyRouting'
import Pet from './Pet'
import PetCritter, { PET_CHOICES, type PetVariant } from './PetCritter'
import DirectorTemplateEditor from './DirectorTemplateEditor'
import { recoverConversationDirector } from './directorRecovery'
import { buildSharedTheaterBackground, createDirectorCharacter, createDirectorTemplateConfig, saveDirectorLibraryCard, instantiateLibraryDirector, DIRECTOR_OUTPUT_GUARD, directorRuntimeBoundary, type DirectorTemplateConfig } from './directorTemplate'
import CharacterWorkshop from './CharacterWorkshop'
import StoryProjectManager from './StoryProjectManager'
import PersonaWindowPage from './PersonaWindowPage'
import { getPersonaState, hydratePersonaStore, isPersonaStoreHydrated, setPersonaState, usePersonaAppearanceScope } from './personaWindowStore'
import { personaWallpaper, personaWallpaperKey, resolvePersonaAppearance } from './personaAppearance'
import { startPersonaTaskClock, type PersonaTaskDue } from './personaTaskClock'
import { buildPersonaWindowNoteForPhone, PERSONA_WINDOWS_KEY, switchPersona, switchPersonaThread } from './personaWindow'
import { normalizeStoryProjects, type StoryProject } from './storyProject'
import { buildStoryProjectPrompt, selectConversationStoryProject } from './storyProjectPrompt'
import { buildAutomaticContinuityInput, captureAssistantMessageIds, hasUnprocessedAssistantMessages, mergeAutomaticContinuity, parseAutomaticContinuityResponse } from './storyContinuity'
import { buildReplyHelperMessages, cleanReplyHelperDraft, REPLY_HELPER_MAX_TOKENS } from './replyHelper'
import { PHONE_COMPRESSION_KEEP_RECENT, PHONE_COMPRESSION_TRIGGER, canApplyContextCompression, planAutoContextCompression, planContextCompression, shouldStartAutoCompression, uncompressedMessages, type ContextCompressionPlan } from './contextCompression'
import { buildMessageQuote, prioritizeAddressed, quotedParticipantIds, withQuotePrefix, type MessageQuote } from './quoteReply'
import { chatWindowAnchorIncluding, earlierChatMessageCount, earlierChatWindowAnchor, resolveChatWindowStart, trimmedChatWindowAnchor } from './chatWindow'
import { findLatestActorContinuityAnchor, findLatestSceneContinuityAnchor } from './actorContinuity'
import ReplyHelperSettingsPage from './ReplyHelperSettingsPage'
import StoryScriptsPage from './StoryScriptsPage'
import WallpaperSettings, { WallpaperLayers } from './WallpaperSettings'
import { migrateLegacyWallpaper, migrateThemeWallpapers, themeWallpaperKey, normalizeWallpaper, normalizeWallpapers, readWallpaperImage, sampleImageTopColor, WALLPAPERS_KEY, WallpaperUploadTickets, wallpaperImage, wallpaperScopeKey, wallpaperTopColor, type ChatWallpaper, type ChatWallpapers } from './chatWallpaper'
import { buildStoryVariablesPrompt, runStoryScript } from './storyScripts'
import { addConversationParticipant, createFreshConversationFrom, removeConversationParticipant, restartConversationInPlace, type Conversation, type ConversationContextSnapshot, type Message } from './conversationLifecycle'
import { appendReplyAlternative, captureConversationContext, contextAtMessage, forkConversationAtMessage, projectContextFromSnapshot, replyAlternatives, restoreConversationContext, selectReplyAlternative, storeContextSnapshot } from './conversationBranches'
import { memoriesForConversationCharacter, mergeConversationCharacterMemories, migrateCardMemoriesToConversations, setConversationCharacterMemories } from './conversationCharacterMemory'
import { parseConversationTxt } from './conversationTxt'
import { isFailedTransportAssistantMessage, modelVisibleMessageText, stripUiOnlyStatusBlocks } from './modelContext'
import { countConversationStats } from './conversationStats'
import { enforceRelationshipStageFloor, extractRelationshipStage, highestRelationshipStage, relationshipStageLockInstruction, repairRelationshipStageHistory, type RelationshipStage } from './relationshipStage'
import { buildStatusFallback, getStatusProtocol, latestStatusContent } from './statusProtocol'
import { dismissComposerKeyboard } from './composerKeyboard'
import { createKeyboardScrollPin, VIEWPORT_CHANGE_EVENT, VIEWPORT_WILL_CHANGE_EVENT } from './keyboardScrollPin'
import { isChatScoped, legacyDefaultThemeId, pickGlobalIdentity, pickIdentity, pickThemeId, repairLeakedGlobalPersona } from './chatScope'

type Page = 'home' | 'persona-window' | 'phone' | 'story-projects' | 'characters' | 'create' | 'character-workshop' | 'group-create' | 'director-template' | 'group-greeting-picker' | 'import-preview' | 'character-detail' | 'card-data' | 'card-worldbook' | 'card-regex' | 'card-memory' | 'greeting-picker' | 'chat' | 'more' | 'api' | 'reply-helper-api' | 'model' | 'settings' | 'appearance' | 'font' | 'display-reply' | 'identity' | 'worldbook' | 'theater-world' | 'temporary-plot' | 'story-scripts' | 'chat-search' | 'request-preview' | 'preset' | 'memory' | 'memory-api' | 'memory-list'
type MessageEditor = { mode: 'assistant' | 'resend'; messageId: number; text: string }
type AssistantRequestOptions = { continueWithoutUser?: boolean; phoneNudge?: string; explicitlyMentioned?: boolean; replacement?: Message; rollbackConversation?: Conversation; contextOverride?: ConversationContextSnapshot }
type Drawer = 'left' | 'right'
type HistoryEntry = { page: Page; reopenDrawer?: Drawer }
type LegacySessionMap = Record<string, Message[]>
type MemoryEntry = { id: string; createdAt: number; title: string; content: string; sourceCount: number; pinned?: boolean; consolidated?: boolean; historyRevision?: number; restoredFromId?: string }
type MemoryConfig = {
  api: ApiConfig
  useGlobalApi?: boolean
  autoEvery: number
  autoCharacterMemory?: boolean
  maxEntries: number
  summaryPrompt: string
  injectPosition: string
  injectPrompt: string
  lastSummarizedCount: number
}
type MemoryConfigMap = Record<string, MemoryConfig>
type MemoryEntryMap = Record<string, MemoryEntry[]>
type UserIdentity = { id: string; name: string; description: string; avatar?: string }
type ChatThemeMode = 'mist' | 'pearl' | 'sage' | 'pudding' | 'strawberry' | 'blueberry' | 'liquid'
type ChatThemePreset = { id: string; name: string; mode: ChatThemeMode; baseColor: string; textColor: string; narrationColor: string; quoteColor: string; frost: number; custom?: boolean }

const demoCharacter: Character = {
  id: 'huo-jin', name: '霍烬', tagline: '沉稳克制的守护者',
  description: 'A 国旧世家出身，寡言、冷静，习惯把所有风浪挡在身后。不会替你决定，但会一直站在你能看见的地方。',
  personality: '', scenario: '', greeting: '夜里风大。过来，站我这边。', alternateGreetings: [], mesExample: '', creatorNotes: '', systemPrompt: '', postHistoryInstructions: '',
  tags: ['慢热', '沉稳', '守护', '剧情向'], creator: '', characterVersion: '', regexScripts: [],
}

function apiRequestContext(channel: ApiChannel) {
  let host = channel.baseUrl.trim()
  try { host = new URL(channel.baseUrl).host } catch {
    // Keep the user-entered host when the URL itself is malformed.
  }
  return `${channel.name || '未命名渠道'} · ${host || '未知地址'} · ${channel.modelName || '未填写模型'}`
}

const legacyMemoryPrompt = `【暂停剧情扮演】请根据前文内容，对上次总结之后的剧情进行总结。生成一个详细的总结集合，涵盖所有主要事件、观点、关系变化与关键信息。总结需逻辑清晰，按时间顺序组织，每件事以独立条目呈现，并尽量标注具体时间点。若时间信息不明确，请根据上下文合理推测并注明。重点保留人物关系、承诺、冲突、情绪转折、世界设定与未完成事项，避免遗漏。`
const previousMemoryPrompt = `【长期记忆整理｜不要继续角色扮演】
你只整理“本次新增对话”，输出可供后续剧情检索的长期记忆，不续写剧情，不复述提示词。
要求：
1. 只记录实际发生或明确说出的事实，不把猜测写成事实；时间不明时写“时间未明确”，禁止擅自编造日期。
2. 按发生顺序整理，优先保留事件、地点、人物关系变化、承诺、冲突、情绪转折、重要物品、世界设定与未完成事项。
3. 区分角色与用户各自的言行，禁止把角色行为记到用户身上。
4. “已有长期记忆”仅用于查重；不要复制或改写已保存内容，只补充新增信息或明确发生的变化。
5. 删除寒暄、重复描述、文风修辞、状态栏格式要求及与长期剧情无关的细节。
输出格式：
【时间线】
- 时间/阶段｜地点｜事件与结果
【关系与状态变化】
- 人物｜变化｜原因
【未完成事项】
- 事项｜当前进度
没有内容的栏目写“无”，不要输出其他说明。`
const legacyStructuredMemoryPrompt = `【长期记忆提取器｜禁止续写剧情】
你会收到“已有长期记忆（仅供查重）”和“本次新增对话（唯一总结范围）”。只从本次新增对话提取后续剧情真正需要记住的新事实；已有记忆不得重复改写，除非本次对话明确更新、纠正或推翻了旧状态。

提取规则：
1. 只记录明确发生、明确说出或文本明确展示的事实。不得推测幕后事件、动机、日期、关系或结局；时间不明写“时间未明确”。
2. 严格按说话者归属言行。用户角色只能记录用户消息中明确表达的台词、动作和决定；禁止把模型代写的用户反应当成事实。
3. 区分“客观发生”“角色声称”“角色内心”和“他人推测”。未被证实的说法必须标注来源与可信状态。
4. 保留知情边界：秘密、证据、身份或计划分别写明谁知道、谁不知道、谁只是怀疑。角色内心不得自动视为其他人物已知。
5. 重点保留事件因果、关系变化、承诺与冲突、情感阶段、重要物品、调查线索、证据链、世界设定变化和未完成事项。
6. 删除寒暄、重复措辞、纯气氛描写、文风修辞、状态栏、提示词、格式要求和没有造成状态变化的日常动作。
7. 新事实明确纠正旧状态时只保留最新状态，并标注“已更新/已完成/已撤销/待决定”；已经完成、离场、被撤销或被用户否定的事项不得写成当前未完成。
8. 不要把模型代写的未来计划、角色内心或他人猜测写成客观事实；只有在后续消息明确发生或被用户确认时才可升级为事实。
9. 若本次新增对话没有值得长期保存的信息，只输出：无新增长期记忆

输出格式：
【事件时间线】
- 时间/阶段｜地点｜参与者｜事件 → 直接结果
【人物与关系状态】
- 人物/关系｜当前状态或情感阶段｜本次变化及明确原因
【秘密、线索与知情边界】
- 秘密/线索/证据｜知情者｜未知者｜已证实/声称/怀疑
【承诺与未完成事项】
- 事项｜责任人｜当前进度｜下一触发条件
【当前场景锚点】
- 时间｜地点｜在场人物｜最后确认的局面
没有内容的栏目写“无”，不要输出解释、评价或剧情续写。`
const previousStageMemoryPrompt = `【剧情长记忆阶段整理｜禁止续写剧情】
你会收到“已有长期记忆（仅供查重）”与“本次新增对话（唯一总结范围）”。只整理本次新增对话中已经明确发生、明确说出或明确展示的事实；不要继续角色扮演，不要补写任何人的动作、心理、台词、动机或后续。

整理原则：
1. 已有长期记忆只用于查重和更新。重复事实不再记录；本次对话明确更新、完成、撤销或推翻旧状态时，记录最新结论并标注“已更新/已完成/已撤销”。
2. 严格按说话者归属。不得把模型代写的用户反应、角色内心、猜测、传闻、计划或未执行的承诺写成已经发生的事实。
3. 时间以对话明确给出的日期、时段、前后顺序为准；没有可靠时间时写“时间未明确”，不得凭空编造具体日期。
4. 每条只写一个事件或一项关键状态变化，写清背景、经过、直接结果与知情边界；简洁但足够让后续剧情无缝接上。

严格按以下格式输出：
【当前阶段｜用 4-10 个字概括】

【事件时间线】
- 时间点｜地点（未知则写未明确）｜参与者｜事件 → 直接结果

【关系与状态变化】
- 人物/关系｜当前状态｜本次变化与明确原因

【线索、证据与知情边界】
- 线索/秘密｜知情者｜未知者｜已证实/声称/怀疑｜当前进度

【承诺与未完成事项】
- 事项｜责任人｜当前进度｜下一触发条件

【当前场景锚点】
- 时间｜地点｜在场人物｜最后确认的局面

没有内容的栏目写“无”。不要输出解释、评价、提示词复述或剧情续写。`
const defaultMemoryPrompt = `【暂停剧情扮演】请根据前文内容，对[上次总结]之后的剧情进行总结，生成一个详细的总结集合，涵盖所有主要事件、观点或关键信息。总结需逻辑清晰，按时间顺序组织，每件事以独立条目形式呈现，并在每条前标注具体时间点（例如日期、时间或事件发生的时间段）。若时间信息不明确，请根据上下文合理推测并注明。每个事件总结约100字，力求简明扼要但信息完整，突出关键细节。整个总结集合应全面覆盖前文内容，避免遗漏，确保条目间逻辑连贯。

**格式要求：**
- 使用条目式结构，每条以时间点开头（例如“2023年10月1日：”）。
- 每条总结约100字，描述一个事件或关键信息，包括背景、经过和影响。
- 语言客观中立，避免添加未提及内容，保持叙事一致性。
- 若事件较多，可分组（如按日期或主题），并在分组前加小标题。
- 每次总结需起一个主标题，起名格式为“xxxx阶段”。`
const defaultInjectPrompt = `以下是该角色与用户的长期记忆。请把它当作已经发生过的事实，自然延续，不要逐条复述，也不要替用户决定言行：\n\n{{memories}}`

const defaultMemoryConfig = (): MemoryConfig => ({
  api: { baseUrl: 'https://api.openai.com/v1', apiKey: '', modelName: 'gpt-4.1-mini' },
  useGlobalApi: true,
  autoEvery: 50,
  autoCharacterMemory: true,
  maxEntries: 2000,
  summaryPrompt: defaultMemoryPrompt,
  injectPosition: 'after-main-prompt',
  injectPrompt: defaultInjectPrompt,
  lastSummarizedCount: 0,
})
const builtInThemes: ChatThemePreset[] = [
  { id: 'mist', name: '惟境紫雾', mode: 'mist', baseColor: '#f5f1f8', textColor: '#4e4852', narrationColor: '#7f7089', quoteColor: '#7b4d67', frost: .72 },
  { id: 'pearl', name: '月光珍珠', mode: 'pearl', baseColor: '#f8f7f5', textColor: '#403d42', narrationColor: '#716d74', quoteColor: '#6a5360', frost: .68 },
  { id: 'sage', name: '青瓷薄荷', mode: 'sage', baseColor: '#e8f2ee', textColor: '#354b45', narrationColor: '#718a82', quoteColor: '#47776d', frost: .66 },
  { id: 'pudding', name: '布丁奶黄', mode: 'pudding', baseColor: '#fff6dc', textColor: '#5b4330', narrationColor: '#a07a52', quoteColor: '#c0702c', frost: .70 },
  { id: 'strawberry', name: '草莓奶油兔', mode: 'strawberry', baseColor: '#fff0f3', textColor: '#5c3a44', narrationColor: '#a8707f', quoteColor: '#c04866', frost: .70 },
  { id: 'blueberry', name: '蓝莓蝴蝶结', mode: 'blueberry', baseColor: '#eef5fd', textColor: '#34465e', narrationColor: '#6f86a6', quoteColor: '#3f6fae', frost: .70 },
  { id: 'liquid', name: '惟镜·液态', mode: 'liquid', baseColor: '#dfece5', textColor: '#203b32', narrationColor: '#627b72', quoteColor: '#2d745f', frost: .34 },
]

const migrateMemoryConfigs = (configs: MemoryConfigMap) => Object.fromEntries(Object.entries(configs).map(([id, config]) => [id, {
  ...config,
  useGlobalApi: config.useGlobalApi ?? !config.api?.apiKey,
  autoCharacterMemory: config.autoCharacterMemory !== false,
  summaryPrompt: config.summaryPrompt === legacyMemoryPrompt || config.summaryPrompt === previousMemoryPrompt || config.summaryPrompt === legacyStructuredMemoryPrompt || config.summaryPrompt === previousStageMemoryPrompt ? defaultMemoryPrompt : config.summaryPrompt,
}]))

const read = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value))
const conversationFrostKey = (conversationId: string) => `weijing.chatBackgroundFrost.${conversationId}`
const syncPwaThemeColor = (color: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return
  try { localStorage.setItem('weijing.pwaThemeColor', color) } catch {
    // Theme application still works when private browsing blocks localStorage.
  }
  // iOS can sample the page behind the status bar, so every root layer under
  // it carries the theme color instead of the stylesheet's fixed light grey.
  document.documentElement.style.backgroundColor = color
  document.body.style.backgroundColor = color
  const root = document.getElementById('root')
  if (root) root.style.backgroundColor = color
  document.querySelectorAll('meta[name="theme-color"]').forEach((element) => element.remove())
  const themeMeta = document.createElement('meta')
  themeMeta.setAttribute('name', 'theme-color')
  themeMeta.setAttribute('content', color)
  document.head.appendChild(themeMeta)
}
const writeDurable = (key: string, value: unknown) => {
  // Existing installs may still have a localStorage copy. Keep it as a fallback
  // until IndexedDB succeeds once, then remove the duplicate large payload.
  const hasLegacyCopy = localStorage.getItem(key) !== null
  if (hasLegacyCopy) {
    try { write(key, value) } catch (error) { console.warn('本地轻量储存已满，继续写入 IndexedDB', error) }
  }
  void durableSet(key, value)
    .then(() => {
      try { localStorage.removeItem(key) } catch {
        // IndexedDB is already authoritative; a blocked legacy cleanup is harmless.
      }
    })
    .catch((error) => console.error('IndexedDB 写入失败', error))
}

const nextMessageId = (messages: Message[]) => Math.max(
  Date.now(),
  ...messages.map((message) => Number.isFinite(message.id) ? message.id + 1 : 0),
)

async function imageThumbnail(file: File, size = 256) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size
  const context = canvas.getContext('2d'); if (!context) return ''
  const scale = Math.max(size / bitmap.width, size / bitmap.height)
  const width = bitmap.width * scale; const height = bitmap.height * scale
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', .82)
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.replace(/[\\/:*?"<>|]/g, '_')
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportableCharacter(character: Character) {
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
      extensions: {
        regex_scripts: character.regexScripts,
        ...(character.directorTemplateConfig ? { weijing_director_template: character.directorTemplateConfig } : {}),
        ...(character.beautificationProtocol?.trim() ? { beautification_protocol: character.beautificationProtocol } : {}),
        ...(character.characterMemory?.length ? { weijing_character_memory: character.characterMemory } : {}),
      },
    },
  }
}

const createConversation = (character: Character, greeting = character.greeting, title?: string): Conversation => ({
  id: `${character.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  characterId: character.id,
  title: title || `与${character.name}的对话`,
  messages: [{ id: Date.now(), role: 'assistant', text: greeting }],
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

const repairGuTingshenConversationStages = (source: Conversation[], characters: Character[]) => {
  const guTingshenIds = characters.filter((character) => character.name === '顾霆深').map((character) => character.id)
  if (!guTingshenIds.length) return source
  return source.map((conversation) => {
    let nextConversation = conversation
    guTingshenIds.forEach((characterId) => {
      if (conversation.characterId !== characterId && !conversation.participantIds?.includes(characterId)) return
      const repaired = repairRelationshipStageHistory(nextConversation.messages, characterId)
      const stored = nextConversation.relationshipStages?.[characterId]
      const highest = Math.max(stored || 0, repaired.highest || 0)
      if (!repaired.changed && highest === stored) return
      nextConversation = {
        ...nextConversation,
        messages: repaired.messages as Message[],
        relationshipStages: highest ? { ...(nextConversation.relationshipStages || {}), [characterId]: highest } : nextConversation.relationshipStages,
      }
    })
    return nextConversation
  })
}

const removeFailedTransportMessages = (source: Conversation[]) => source.map((conversation) => ({
  ...conversation,
  messages: conversation.messages.filter((message) => !isFailedTransportAssistantMessage(message) && !(message.role === 'assistant' && isPendingAssistantText(message.text || ''))),
}))

const loadConversations = (characters: Character[]): Conversation[] => {
  const stored = read<Conversation[]>('weijing.conversations', [])
  if (Array.isArray(stored) && stored.length) return repairGuTingshenConversationStages(removeFailedTransportMessages(stored), characters)

  const legacy = read<LegacySessionMap>('weijing.sessions', {})
  const migrated = Object.entries(legacy).map(([characterId, messages], index) => {
    const character = characters.find((item) => item.id === characterId) || demoCharacter
    const timestamp = Date.now() - index
    return {
      id: `${characterId}-migrated-${timestamp}`,
      characterId,
      title: `与${character.name}的对话`,
      messages: Array.isArray(messages) && messages.length ? messages : [{ id: timestamp, role: 'assistant' as const, text: character.greeting }],
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  })
  return repairGuTingshenConversationStages(removeFailedTransportMessages(migrated.length ? migrated : [createConversation(characters[0] || demoCharacter)]), characters)
}

function BackHeader({ title, onBack, action }: { title: string; onBack: () => void; action?: React.ReactNode }) {
  return <header className="page-header"><butto�、提示词、格式要求和没有造成状态变化的日常动作。
7. 新事实明确纠正旧状态时只保留最新状态，并标注“已更新/已完成/已撤销/待决定”；已经完成、离场、被撤销或被用户否定的事项不得写成当前未完成。
8. 不要把模型代写的未来计划、角色内心或他人猜测写成客观事实；只有在后续消息明确发生或被用户确认时才可升级为事实。
9. 若本次新增对话没有值得长期保存的信息，只输出：无新增长期记忆

输出格式：
【事件时间线】
- 时间/阶段｜地点｜参与者｜事件 → 直接结果
【人物与关系状态】
- 人物/关系｜当前状态或情感阶段｜本次变化及明确原因
【秘密、线索与知情边界】
- 秘密/线索/证据｜知情者｜未知者｜已证实/声称/怀疑
【承诺与未完成事项】
- 事项｜责任人｜当前进度｜下一触发条件
【当前场景锚点】
- 时间｜地点｜在场人物｜最后确认的局面
没有内容的栏目写“无”，不要输出解释、评价或剧情续写。`
const previousStageMemoryPrompt = `【剧情长记忆阶段整理｜禁止续写剧情】
你会收到“已有长期记忆（仅供查重）”与“本次新增对话（唯一总结范围）”。只整理本次新增对话中已经明确发生、明确说出或明确展示的事实；不要继续角色扮演，不要补写任何人的动作、心理、台词、动机或后续。

整理原则：
1. 已有长期记忆只用于查重和更新。重复事实不再记录；本次对话明确更新、完成、撤销或推翻旧状态时，记录最新结论并标注“已更新/已完成/已撤销”。
2. 严格按说话者归属。不得把模型代写的用户反应、角色内心、猜测、传闻、计划或未执行的承诺写成已经发生的事实。
3. 时间以对话明确给出的日期、时段、前后顺序为准；没有可靠时间时写“时间未明确”，不得凭空编造具体日期。
4. 每条只写一个事件或一项关键状态变化，写清背景、经过、直接结果与知情边界；简洁但足够让后续剧情无缝接上。

严格按以下格式输出：
【当前阶段｜用 4-10 个字概括】

【事件时间线】
- 时间点｜地点（未知则写未明确）｜参与者｜事件 → 直接结果

【关系与状态变化】
- 人物/关系｜当前状态｜本次变化与明确原因

【线索、证据与知情边界】
- 线索/秘密｜知情者｜未知者｜已证实/声称/怀疑｜当前进度

【承诺与未完成事项】
- 事项｜责任人｜当前进度｜下一触发条件

【当前场景锚点】
- 时间｜地点｜在场人物｜最后确认的局面

没有内容的栏目写“无”。不要输出解释、评价、提示词复述或剧情续写。`
const defaultMemoryPrompt = `【暂停剧情扮演】请根据前文内容，对[上次总结]之后的剧情进行总结，生成一个详细的总结集合，涵盖所有主要事件、观点或关键信息。总结需逻辑清晰，按时间顺序组织，每件事以独立条目形式呈现，并在每条前标注具体时间点（例如日期、时间或事件发生的时间段）。若时间信息不明确，请根据上下文合理推测并注明。每个事件总结约100字，力求简明扼要但信息完整，突出关键细节。整个总结集合应全面覆盖前文内容，避免遗漏，确保条目间逻辑连贯。

**格式要求：**
- 使用条目式结构，每条以时间点开头（例如“2023年10月1日：”）。
- 每条总结约100字，描述一个事件或关键信息，包括背景、经过和影响。
- 语言客观中立，避免添加未提及内容，保持叙事一致性。
- 若事件较多，可分组（如按日期或主题），并在分组前加小标题。
- 每次总结需起一个主标题，起名格式为“xxxx阶段”。`
const defaultInjectPrompt = `以下是该角色与用户的长期记忆。请把它当作已经发生过的事实，自然延续，不要逐条复述，也不要替用户决定言行：\n\n{{memories}}`

const defaultMemoryConfig = (): MemoryConfig => ({
  api: { baseUrl: 'https://api.openai.com/v1', apiKey: '', modelName: 'gpt-4.1-mini' },
  useGlobalApi: true,
  autoEvery: 50,
  autoCharacterMemory: true,
  maxEntries: 2000,
  summaryPrompt: defaultMemoryPrompt,
  injectPosition: 'after-main-prompt',
  injectPrompt: defaultInjectPrompt,
  lastSummarizedCount: 0,
})
const builtInThemes: ChatThemePreset[] = [
  { id: 'mist', name: '惟境紫雾', mode: 'mist', baseColor: '#f5f1f8', textColor: '#4e4852', narrationColor: '#7f7089', quoteColor: '#7b4d67', frost: .72 },
  { id: 'pearl', name: '月光珍珠', mode: 'pearl', baseColor: '#f8f7f5', textColor: '#403d42', narrationColor: '#716d74', quoteColor: '#6a5360', frost: .68 },
  { id: 'sage', name: '青瓷薄荷', mode: 'sage', baseColor: '#e8f2ee', textColor: '#354b45', narrationColor: '#718a82', quoteColor: '#47776d', frost: .66 },
  { id: 'pudding', name: '布丁奶黄', mode: 'pudding', baseColor: '#fff6dc', textColor: '#5b4330', narrationColor: '#a07a52', quoteColor: '#c0702c', frost: .70 },
  { id: 'strawberry', name: '草莓奶油兔', mode: 'strawberry', baseColor: '#fff0f3', textColor: '#5c3a44', narrationColor: '#a8707f', quoteColor: '#c04866', frost: .70 },
  { id: 'blueberry', name: '蓝莓蝴蝶结', mode: 'blueberry', baseColor: '#eef5fd', textColor: '#34465e', narrationColor: '#6f86a6', quoteColor: '#3f6fae', frost: .70 },
  { id: 'liquid', name: '惟镜·液态', mode: 'liquid', baseColor: '#dfece5', textColor: '#203b32', narrationColor: '#627b72', quoteColor: '#2d745f', frost: .34 },
]

const migrateMemoryConfigs = (configs: MemoryConfigMap) => Object.fromEntries(Object.entries(configs).map(([id, config]) => [id, {
  ...config,
  useGlobalApi: config.useGlobalApi ?? !config.api?.apiKey,
  autoCharacterMemory: config.autoCharacterMemory !== false,
  summaryPrompt: config.summaryPrompt === legacyMemoryPrompt || config.summaryPrompt === previousMemoryPrompt || config.summaryPrompt === legacyStructuredMemoryPrompt || config.summaryPrompt === previousStageMemoryPrompt ? defaultMemoryPrompt : config.summaryPrompt,
}]))

const read = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value))
const conversationFrostKey = (conversationId: string) => `weijing.chatBackgroundFrost.${conversationId}`
const syncPwaThemeColor = (color: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return
  try { localStorage.setItem('weijing.pwaThemeColor', color) } catch {
    // Theme application still works when private browsing blocks localStorage.
  }
  // iOS can sample the page behind the status bar, so every root layer under
  // it carries the theme color instead of the stylesheet's fixed light grey.
  document.documentElement.style.backgroundColor = color
  document.body.style.backgroundColor = color
  const root = document.getElementById('root')
  if (root) root.style.backgroundColor = color
  document.querySelectorAll('meta[name="theme-color"]').forEach((element) => element.remove())
  const themeMeta = document.createElement('meta')
  themeMeta.setAttribute('name', 'theme-color')
  themeMeta.setAttribute('content', color)
  document.head.appendChild(themeMeta)
}
const writeDurable = (key: string, value: unknown) => {
  // Existing installs may still have a localStorage copy. Keep it as a fallback
  // until IndexedDB succeeds once, then remove the duplicate large payload.
  const hasLegacyCopy = localStorage.getItem(key) !== null
  if (hasLegacyCopy) {
    try { write(key, value) } catch (error) { console.warn('本地轻量储存已满，继续写入 IndexedDB', error) }
  }
  void durableSet(key, value)
    .then(() => {
      try { localStorage.removeItem(key) } catch {
        // IndexedDB is already authoritative; a blocked legacy cleanup is harmless.
      }
    })
    .catch((error) => console.error('IndexedDB 写入失败', error))
}

const nextMessageId = (messages: Message[]) => Math.max(
  Date.now(),
  ...messages.map((message) => Number.isFinite(message.id) ? message.id + 1 : 0),
)

async function imageThumbnail(file: File, size = 256) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size
  const context = canvas.getContext('2d'); if (!context) return ''
  const scale = Math.max(size / bitmap.width, size / bitmap.height)
  const width = bitmap.width * scale; const height = bitmap.height * scale
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', .82)
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.replace(/[\\/:*?"<>|]/g, '_')
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportableCharacter(character: Character) {
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
      extensions: {
        regex_scripts: character.regexScripts,
        ...(character.directorTemplateConfig ? { weijing_director_template: character.directorTemplateConfig } : {}),
        ...(character.beautificationProtocol?.trim() ? { beautification_protocol: character.beautificationProtocol } : {}),
        ...(character.characterMemory?.length ? { weijing_character_memory: character.characterMemory } : {}),
      },
    },
  }
}

const createConversation = (character: Character, greeting = character.greeting, title?: string): Conversation => ({
  id: `${character.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  characterId: character.id,
  title: title || `与${character.name}的对话`,
  messages: [{ id: Date.now(), role: 'assistant', text: greeting }],
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

const repairGuTingshenConversationStages = (source: Conversation[], characters: Character[]) => {
  const guTingshenIds = characters.filter((character) => character.name === '顾霆深').map((character) => character.id)
  if (!guTingshenIds.length) return source
  return source.map((conversation) => {
    let nextConversation = conversation
    guTingshenIds.forEach((characterId) => {
      if (conversation.characterId !== characterId && !conversation.participantIds?.includes(characterId)) return
      const repaired = repairRelationshipStageHistory(nextConversation.messages, characterId)
      const stored = nextConversation.relationshipStages?.[characterId]
      const highest = Math.max(stored || 0, repaired.highest || 0)
      if (!repaired.changed && highest === stored) return
      nextConversation = {
        ...nextConversation,
        messages: repaired.messages as Message[],
        relationshipStages: highest ? { ...(nextConversation.relationshipStages || {}), [characterId]: highest } : nextConversation.relationshipStages,
      }
    })
    return nextConversation
  })
}

const removeFailedTransportMessages = (source: Conversation[]) => source.map((conversation) => ({
  ...conversation,
  messages: conversation.messages.filter((message) => !isFailedTransportAssistantMessage(message) && !(message.role === 'assistant' && isPendingAssistantText(message.text || ''))),
}))

const loadConversations = (characters: Character[]): Conversation[] => {
  const stored = read<Conversation[]>('weijing.conversations', [])
  if (Array.isArray(stored) && stored.length) return repairGuTingshenConversationStages(removeFailedTransportMessages(stored), characters)

  const legacy = read<LegacySessionMap>('weijing.sessions', {})
  const migrated = Object.entries(legacy).map(([characterId, messages], index) => {
    const character = characters.find((item) => item.id === characterId) || demoCharacter
    const timestamp = Date.now() - index
    return {
      id: `${characterId}-migrated-${timestamp}`,
      characterId,
      title: `与${character.name}的对话`,
      messages: Array.isArray(messages) && messages.length ? messages : [{ id: timestamp, role: 'assistant' as const, text: character.greeting }],
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  })
  return repairGuTingshenConversationStages(removeFailedTransportMessages(migrated.length ? migrated : [createConversation(characters[0] || demoCharacter)]), characters)
}

function BackHeader({ title, onBack, action }: { title: string; onBack: () => void; action?: React.ReactNode }) {
  return <header className="page-header"><button className="icon-button" onClick={onBack}>‹</button><h1>{title}</h1><div className="header-action">{action}</div></header>
}

/** Detail-page preview of an opening: card pages (```html blocks / raw HTML) are not dumped as source. */
function greetingPreview(greeting: string) {
  const text = (greeting || '')
    .replace(/```[\s\S]*?```/g, ' 〔卡片页面〕 ')
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 400 ? `${text.slice(0, 400)}…` : text
}

function PhaseElapsed({ label, startedAt }: { label: string; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000))
  return <div className="message-content message-phase"><p>{label}（已等 {seconds} 秒）</p></div>
}

function App() {
  const [page, setPage] = useState<Page>('home')
  const [taskDueNotices, setTaskDueNotices] = useState<PersonaTaskDue[]>([])
  const taskToastSuppressUntil = useRef(0)
  const taskToastTap = (action: () => void) => ({
    onPointerUp: (event: React.PointerEvent) => {
      if (event.pointerType !== 'touch') return
      event.preventDefault()
      taskToastSuppressUntil.current = Date.now() + 500
      action()
    },
    onClick: () => { if (Date.now() >= taskToastSuppressUntil.current) action() },
  })
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [drawer, setDrawer] = useState<Drawer | null>(null)
  const [conversationMenuId, setConversationMenuId] = useState<string | null>(null)
  const [messageMenuId, setMessageMenuId] = useState<number | null>(null)
  const [phoneModesOpen, setPhoneModesOpen] = useState(false)
  const [messageEditor, setMessageEditor] = useState<MessageEditor | null>(null)
  const [phoneLock, setPhoneLockState] = useState<PhoneLockState | null>(() => { try { const value = JSON.parse(localStorage.getItem('weijing.phoneLock') || 'null') as PhoneLockState | null; return value && value.until > Date.now() ? value : null } catch { return null } })
  const setPhoneLock = (value: PhoneLockState | null) => { setPhoneLockState(value); try { if (value) localStorage.setItem('weijing.phoneLock', JSON.stringify(value)); else localStorage.removeItem('weijing.phoneLock') } catch { /* 存不下也不影响本次锁屏 */ } }
  const breakPhoneLock = () => {
    if (!phoneLock) return
    const breach: PhoneLockBreach = { at: Date.now(), byName: phoneLock.byName, remainingMinutes: Math.max(1, Math.ceil((phoneLock.until - Date.now()) / 60000)), reason: phoneLock.reason }
    try { lo