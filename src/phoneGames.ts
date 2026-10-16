export type GamePlayer = { id: string; name: string }
export type PhoneGameKind = 'truth' | 'draw' | 'poker'
export type TruthMode = 'truth' | 'dare' | 'random'
export type PhoneGameRound = {
  id: string; kind: PhoneGameKind; number: number; players: GamePlayer[]; truthMode: TruthMode
  targetId?: string; task?: string; taskId?: string; usedTaskIds: string[]
  cards?: Array<{ playerId: string; label: string; rank: number }>; winnerIds?: string[]
}
export const GAME_NAMES: Record<PhoneGameKind, string> = { truth: '真心话大冒险', draw: '互动抽卡', poker: '扑克牌比大小' }
const TRUTHS = [
  '说出你对在场某人的第一印象，以及现在变了什么。', '最近一次嘴硬，心里真正想说的是什么？',
  '如果今晚只能单独约一个人聊天，你会选谁，为什么？', '在群里你最容易被谁一句话拿捏？举个例子。',
  '说一件你一直没好意思承认的小心思。', '今天最想向在场谁问一个什么问题？',
  '说出你最欣赏自己的一点，以及最想改的一点。', '你最近最吃醋的一刻是什么时候？没有就直说没有。',
  '哪一句夸奖最能让你心动？', '给在场一人一个真诚评价，不许只说客套话。',
  '如果重来一次，你想改变哪一次聊天里的回答？', '你希望在场的人更了解你的哪一面？',
]
const DARES = [
  '选一位在场的人，用三句话认真夸他或她，不许重复。', '用三个表情描述你今天的心情，再解释给大家听。',
  '给在场某人取一个昵称，并说明理由；对方可以否决。', '向在场一人发出一个小邀请，内容由你决定。',
  '用一句电影台词描述此刻的自己。', '模仿在场一人的口头禅，让大家猜是谁，不要替对方发言。',
  '给在场一人写一句不超过二十字的专属夸奖。', '用一本正经的语气讲一个冷笑话。',
  '对在场一人说一句你平时会嘴硬不说的话。', '把你此刻想说的话写成四句短诗。',
  '下一条消息只能用五个字表达自己的态度。', '给自己起一个今晚的称号，接受大家吐槽。',
]
const DRAWS = [
  '默契卡：挑一人，先说你猜对方此刻最想做什么，等对方揭晓。',
  '直球卡：挑一人，坦白一句平时藏在玩笑后面的话。',
  '反转卡：对你最常互怼的人，认真说出一个优点。',
  '采访卡：向在场一人提一个你最想知道答案的问题，等对方回答。',
  '心愿卡：说一个今晚想实现的小愿望，看看谁愿意认领。',
  '接龙卡：用一句话开一个有趣的故事，邀请大家一人接一句。',
  '二选一卡：给在场某人出一道有趣的二选一，等对方选择。',
  '昵称卡：说出你最想被在场某人怎样称呼，以及理由。',
  '回忆卡：分享一件你和在场某人都记得的小事，记不清就别编。',
  '夸夸卡：选一个人，给出具体、真诚、不重复的夸奖。',
  '秘密卡：说一件关于自己的小秘密，可以选择跳过。',
  '点歌卡：选一首歌送给在场某人，只说歌名和理由。',
]
const pickIndex = (length: number, random: () => number) => Math.min(length - 1, Math.max(0, Math.floor(random() * length)))

/** Each round is resolved locally once and saved with the conversation; models never deal cards. */
export function nextPhoneGame(input: { kind: PhoneGameKind; players: GamePlayer[]; truthMode?: TruthMode; customTask?: string; previous?: PhoneGameRound; random?: () => number; now?: number }): PhoneGameRound {
  const random = input.random || Math.random
  const players = input.players.filter((player, index, list) => player.id && list.findIndex((other) => other.id === player.id) === index)
  if (players.length < 2 || players.length > 54) throw new Error('请选择 2—54 位参与者（可以包括你）')
  const previous = input.previous?.kind === input.kind ? input.previous : undefined
  const round: PhoneGameRound = {
    id: `${input.now ?? Date.now()}-${random().toString(36).slice(2, 10)}`, kind: input.kind,
    number: (previous?.number || 0) + 1, players: players.map((player) => ({ ...player })),
    truthMode: input.truthMode || previous?.truthMode || 'random', usedTaskIds: [...(previous?.usedTaskIds || [])],
  }
  if (input.kind === 'poker') {
    const deck = ['♣', '♦', '♥', '♠'].flatMap((suit) => ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map((face, index) => ({ label: `${suit}${face}`, rank: index + 2 })))
    deck.push({ label: '小王', rank: 15 }, { label: '大王', rank: 16 })
    round.cards = players.map((player) => ({ playerId: player.id, ...deck.splice(pickIndex(deck.length, random), 1)[0] }))
    const top = Math.max(...round.cards.map((card) => card.rank))
    round.winnerIds = round.cards.filter((card) => card.rank === top).map((card) => card.playerId)
  } else {
    round.targetId = players[pickIndex(players.length, random)].id
    const pool = input.kind === 'draw' ? DRAWS.map((text, index) => ({ id: `draw-${index}`, text })) : [
      ...(round.truthMode !== 'dare' ? TRUTHS.map((text, index) => ({ id: `truth-${index}`, text: `真心话：${text}` })) : []),
      ...(round.truthMode !== 'truth' ? DARES.map((text, index) => ({ id: `dare-${index}`, text: `大冒险：${text}` })) : []),
    ]
    let available = pool.filter((task) => !round.usedTaskIds.includes(task.id))
    if (!available.length) { round.usedTaskIds = round.usedTaskIds.filter((id) => !pool.some((task) => task.id === id)); available = pool }
    const task = available[pickIndex(available.length, random)]
    round.task = input.customTask?.trim().slice(0, 300) || task.text
    round.taskId = input.customTask?.trim() ? undefined : task.id
    if (round.taskId) round.usedTaskIds.push(round.taskId)
  }
  return round
}

export function phoneGameText(round: PhoneGameRound) {
  const nameOf = (id: string) => round.players.find((player) => player.id === id)?.name || '已离开的参与者'
  const lines = [`🎲 ${GAME_NAMES[round.kind]} · 第 ${round.number} 轮`, `参与：${round.players.map((player) => player.name).join('、')}`]
  if (round.kind === 'poker') {
    lines.push('规则：每轮重新洗 54 张牌，每人一张；大王 > 小王 > A > K > … > 2，同点数并列。',
      ...(round.cards || []).map((card) => `${nameOf(card.playerId)}：${card.label}`), `🏆 本轮胜出：${(round.winnerIds || []).map(nameOf).join('、')}`)
  } else lines.push(`抽中：${nameOf(round.targetId || '')}`, round.task || '')
  return lines.join('\n')
}

export function phoneGameSpeakers(round: PhoneGameRound, liveIds: string[]) {
  const ids = round.players.map((player) => player.id).filter((id) => id !== 'user' && liveIds.includes(id))
  return round.kind === 'poker' ? ids : round.targetId === 'user' ? ids.slice(0, 2) : ids.filter((id) => id === round.targetId)
}

export function buildPhoneGameNote(round: PhoneGameRound | undefined, speakerId: string, userName: string) {
  if (!round) return ''
  return `【当前群互动游戏｜程序已抽签，不能修改结果】\n${phoneGameText(round)}
本轮你只扮演自己，不代替其他参与者作答或行动；抽签、牌面、胜负已经确定，不能自行重抽、改牌或扣加积分。
${round.kind === 'poker' ? '按自己拿到的牌和输赢接话，可以互相打趣；没有筹码和积分输赢。' : round.targetId === speakerId ? '本轮抽中你，请先按题目用自己的语气作答或完成文字互动，可以拒绝或说跳过。需要别人回应时，向对方提问并等对方回答。' : round.targetId === 'user' ? `本轮抽中${userName}，等她自己回答，可以短暂起哄或接话，不能替她编答案。` : '本轮抽中别人，可以回应他已说的话，不能替他完成任务。'}
只在这个群里玩；不要在私聊里继续此轮游戏。`
}
