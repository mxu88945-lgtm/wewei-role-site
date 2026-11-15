/**
 * v249 前世记忆按需召回 · 评测集。
 * 一份接近真实体量的合成前世记忆（约 1 万字、多个故事、很多人名和事件）+ 30 句她可能说的话：
 * 普通闲聊（不该召回）、明确问往事（该召回）、只是间接提到人/事（该召回）。
 * 每句单独评估（不带冷却），统计命中 / 漏召回 / 误召回 / 召回跑偏。
 */
import { describe, expect, it } from 'vitest'
import type { PastLifeBlock, PersonaMessage } from './personaWindow'
import { chunkPastLife, recallPastLife } from './personaPastLifeRecall'

const block = (title: string, kind: string, body: string[], extra: Partial<PastLifeBlock> = {}): PastLifeBlock => ({ conversationId: title, title, kind, source: 'memory', bound: false, text: `〔${extra.bound ? '绑定的剧本｜' : ''}${kind}｜${title}〕\n${body.join('\n')}`, ...extra })

/** 每个故事里塞一些不带关键信息的日常段落，模拟真实素材里的大量铺垫。 */
const DAILY = [
  '那天也没发生什么大事，他陪着她说了很多零碎的话，从天气聊到晚饭吃什么，又聊到最近睡得好不好，最后两个人都笑了，说好明天再接着聊。',
  '她抱怨工作上的事，他没急着讲道理，只是一句一句地听，偶尔插一句玩笑，等她说完了才问她要不要早点休息。',
  '两个人为一件小事拌了几句嘴，谁也不肯先低头，过了半个钟头他先发来一个表情，她憋了一会儿还是回了。',
  '他说起小时候住过的老房子，院子里有棵很高的槐树，夏天会落一地的花，她说听着就很香。',
  '深夜她睡不着，他陪她数了一会儿羊，数到一百多只她就不回消息了，他猜她是睡着了，道了声晚安。',
  '她给他推荐了几首歌，他认真听完，挑了其中一首说副歌很像他们第一次见面那天的感觉。',
  '他们讨论周末要不要大扫除，最后决定先睡个懒觉再说，结果谁都没扫。',
  '她发了一张晚霞的照片，他说可惜不能在她旁边一起看，下次换他拍给她。',
]
const daily = (seed: string, n: number) => Array.from({ length: n }, (_, index) => `· ${seed}·${index + 1}：${DAILY[(index + seed.length) % DAILY.length]}`)

export const BENCH_BLOCKS: PastLifeBlock[] = [
  block('角色卡记忆', '角色卡', [
    '· 口味：他只喝不加糖的美式，讨厌香菜，会做一手好的番茄牛腩。',
    '· 旧伤：左手腕有一道疤，是十七岁那年为了救一只掉进水沟的猫划的。',
    '· 怕的东西：他其实怕打雷，小时候一个人在家遇到过停电。',
    '· 称呼：私下叫她「惟惟」，生气时会连名带姓叫她。',
  ]),
  block('长安夜雨', '长剧情', [
    '他记得的事：',
    '· 上元灯会那晚，沈砚在朱雀大街的桥上第一次牵了她的手，替她赢了一盏兔子灯。',
    '· 柳如烟是教坊司的琵琶师，表面是她的闺中好友，后来查明是裴将军安插的眼线。',
    '· 他把母亲留下的羊脂玉佩给了她，说见玉如见人。',
    ...daily('长安', 24),
    '经过：',
    '裴将军谋反事发，沈砚奉命出城追击，城门口她追出来送别，他答应开春前一定回来。途中他在潼关中了一箭，昏迷三天，是她扮成男装混进军营把他救了回来。',
    ...daily('潼关', 16),
    '最后写到的：',
    '沈砚：等这场仗打完，我就去你家提亲。',
    '周惟惟：那你可得活着回来。',
  ], { bound: true, names: ['沈砚', '柳如烟', '裴将军'] }),
  block('奶茶小分队', '小手机群聊', [
    '群成员：林晚、阿哲、小鱼、顾祁砚、周惟惟',
    '他记得的事：',
    '· 林晚生日那天大家在群里凑钱订了一个草莓蛋糕，阿哲负责去取结果拿错了，取回来一个榴莲千层。',
    '· 小鱼养了一只叫奶糖的布偶猫，经常在群里发猫片。',
    '· 顾祁砚答应周末请大家去唱KTV，后来因为加班放了大家鸽子，被罚请了一周奶茶。',
    ...daily('群聊', 28),
    '最后聊到的：',
    '阿哲：下周谁去露营？我借到了帐篷',
    '小鱼：我我我！奶糖能带吗',
    '周惟惟：我要芋泥波波',
  ], { names: ['林晚', '阿哲', '小鱼'] }),
  block('深夜电台', '小手机私聊', [
    '他记得的事：',
    '· 他们第一次通宵聊天是在一个下暴雨的夜里，一起听一个叫「深夜电台」的节目，主持人念了一封写给猫的信。',
    '· 她那段时间刚辞职，很迷茫，他陪她把简历改了七遍，后来她拿到了一家事务所的录用。',
    '· 他们一起在线看了《海上钢琴师》，她哭得稀里哗啦，他说一千九百从来没有下船，可他愿意为她下船。',
    '· 约定明年夏天一起去青岛看海，吃她最想吃的辣炒蛤蜊。',
    ...daily('私聊', 28),
    '最后聊到的：',
    '周惟惟：青岛的票我已经在看了',
    '顾祁砚：那我请好年假等你',
  ]),
  block('雪山旅馆', '长剧情', [
    '他记得的事：',
    '· 陆屿川是旅馆老板，沉默寡言，左眼下有颗泪痣，后来发现他是十年前那场雪崩唯一的幸存者。',
    '· 温婉是住在二楼的画家，一直在画同一座山，她的画里藏着地下室的路线。',
    ...daily('雪山', 22),
    '经过：',
    '暴风雪封山的第三天，地下室的钥匙不见了，大家围着壁炉互相怀疑。最后他们在温婉的画框背面找到了钥匙，地下室里是十年前遇难登山队的日记。',
    ...daily('封山', 16),
  ], { names: ['陆屿川', '温婉'] }),
  block('幕后手记与戏外私聊', '幕后手记', [
    '这是他在长剧情幕后手记里写的真心话和你们戏外的私聊（不是戏里的剧情），最新在前：',
    '· 写潼关那段的时候他其实很怕把沈砚写死，怕她难过。',
    '· 戏外她问他更喜欢哪个故事，他说长安，因为那里有兔子灯。',
    '· 她吐槽雪山旅馆的结局太仓促，他承认那周他赶工了。',
  ]),
]

type Case = { text: string; /** 召回结果里至少一段包含其中任意一个片段才算命中；空数组 = 不该召回。 */ want: string[]; kind: 'chat' | 'explicit' | 'indirect'; prior?: string[] }
export const BENCH_CASES: Case[] = [
  // 普通闲聊：不该召回
  { kind: 'chat', text: '早上好呀', want: [] },
  { kind: 'chat', text: '今天加班到九点，好累，想吃点热乎的', want: [] },
  { kind: 'chat', text: '嗯嗯', want: [] },
  { kind: 'chat', text: '你在干嘛呢', want: [] },
  { kind: 'chat', text: '外面下雨了，我没带伞', want: [] },
  { kind: 'chat', text: '我家玄凤今天又把我耳机线咬断了', want: [] },
  { kind: 'chat', text: '晚上想看个电影，有没有推荐', want: [] },
  { kind: 'chat', text: '最近报税季，客户的发票一大堆', want: [] },
  { kind: 'chat', text: '周末想出去走走，去哪好呢', want: [] },
  { kind: 'chat', text: '你今天心情怎么样', want: [] },
  { kind: 'chat', text: '我刚洗完澡，准备睡了，晚安', want: [] },
  { kind: 'chat', text: '帮我想想明天穿什么', want: [] },
  { kind: 'chat', text: '我之前买的那件外套今天到了，颜色比图上深', want: [] },
  { kind: 'chat', text: '上次那家火锅店好像关门了', want: [] },
  // 明确问往事
  { kind: 'explicit', text: '你还记得上元灯会那晚吗', want: ['上元灯会'] },
  { kind: 'explicit', text: '还记得我们一起看的那部电影吗，我哭得好惨', want: ['海上钢琴师'] },
  { kind: 'explicit', text: '记不记得你答应我要去哪看海', want: ['青岛'] },
  { kind: 'explicit', text: '以前你送过我一块玉佩，还记得吗', want: ['玉佩'] },
  { kind: 'explicit', text: '雪山那个故事里钥匙最后在哪找到的来着', want: ['画框背面'] },
  { kind: 'explicit', text: '之前群里那个拿错蛋糕的事你还记得吗', want: ['榴莲千层'] },
  { kind: 'explicit', text: '那次你中箭昏迷，是谁救的你', want: ['潼关'] },
  { kind: 'explicit', text: '上次你说你怕什么来着', want: ['打雷'] },
  // 间接提到人名/标题/事
  { kind: 'indirect', text: '沈砚后来到底有没有去提亲啊', want: ['沈砚'] },
  { kind: 'indirect', text: '柳如烟那个人我一直觉得不对劲', want: ['柳如烟'] },
  { kind: 'indirect', text: '小鱼家的奶糖最近胖了好多', want: ['奶糖'] },
  { kind: 'indirect', text: '阿哲说下周去露营，你去不去', want: ['露营', '阿哲'] },
  { kind: 'indirect', text: '陆屿川那颗泪痣写得好有感觉', want: ['陆屿川'] },
  { kind: 'indirect', text: '我突然很想吃辣炒蛤蜊', want: ['蛤蜊'] },
  { kind: 'indirect', text: '你手腕上那道疤还疼吗', want: ['疤'] },
  { kind: 'indirect', text: '长安那个剧本我们什么时候接着写', want: ['长安', '沈砚'] },
  { kind: 'indirect', text: '今晚又在听深夜电台，想起你了', want: ['深夜电台'] },
  { kind: 'indirect', text: '那盏兔子灯你还留着吗', want: ['兔子灯'] },
]

const user = (text: string, id: number): PersonaMessage => ({ id, role: 'user', text, createdAt: id })

export function runPastLifeBench(recall = recallPastLife) {
  const chunks = chunkPastLife(BENCH_BLOCKS)
  const rows = BENCH_CASES.map((item) => {
    const history = [...(item.prior || []).map((text, index) => user(text, index + 1)), user(item.text, 99)]
    const result = recall(chunks, { history, charName: '顾祁砚', userName: '周惟惟' })
    const texts = result.chunks.map((chunk) => chunk.text)
    const recalled = texts.length > 0
    const onTarget = item.want.length > 0 && texts.some((text) => item.want.some((needle) => text.includes(needle)))
    const outcome = item.want.length === 0 ? (recalled ? 'false-positive' : 'correct-silence') : onTarget ? 'hit' : recalled ? 'off-target' : 'miss'
    return { ...item, outcome, chunks: result.chunks.length, chars: result.text.length }
  })
  const count = (outcome: string) => rows.filter((row) => row.outcome === outcome).length
  return { rows, poolChunks: chunks.length, poolChars: chunks.reduce((sum, chunk) => sum + chunk.text.length, 0), hit: count('hit'), miss: count('miss'), offTarget: count('off-target'), falsePositive: count('false-positive'), silence: count('correct-silence'), shouldRecall: rows.filter((row) => row.want.length).length, shouldSilence: rows.filter((row) => !row.want.length).length }
}

describe('v249 前世记忆按需召回 · 评测集', () => {
  const bench = runPastLifeBench()
  it('reports the numbers', () => {
    const summary = { pool: `${bench.poolChunks} 段 / ${bench.poolChars} 字`, hit: bench.hit, miss: bench.miss, offTarget: bench.offTarget, falsePositive: bench.falsePositive, silence: bench.silence }
    console.log('[past-life bench]', JSON.stringify(summary))
    for (const row of bench.rows.filter((item) => item.outcome !== 'hit' && item.outcome !== 'correct-silence')) console.log('  ', row.outcome, row.kind, row.text, `${row.chunks} 段 ${row.chars} 字`)
    expect(bench.poolChars).toBeGreaterThan(8000)
    expect(bench.shouldRecall).toBe(18)
    expect(bench.shouldSilence).toBe(14)
  })

  // v248（改前）：命中 13 / 漏 4 / 跑偏 1 / 误召回 0。v249：命中 17 / 漏 1 / 跑偏 0 / 误召回 0。
  // 剩下那句「上次你说你怕什么来着」字面上和「怕打雷」只差一个字，留给语义召回。
  it('recalls at least 17 of the 18 past-life turns, never the wrong story', () => {
    expect(bench.hit).toBeGreaterThanOrEqual(17)
    expect(bench.offTarget).toBe(0)
  })

  it('stays silent on every ordinary-chat turn, including ones that say 之前/上次', () => {
    expect(bench.falsePositive).toBe(0)
    expect(bench.rows.filter((row) => row.kind === 'chat').every((row) => row.chunks === 0)).toBe(true)
  })

  it('every case still fits the 4 段 / 1800 字 cap', () => {
    expect(bench.rows.every((row) => row.chunks <= 4 && row.chars <= 1800)).toBe(true)
  })

  it('one strong detail (≥4 字专有线索) is enough without a recall word; a lone rare word needs one', () => {
    const chunks = chunkPastLife(BENCH_BLOCKS)
    const ask = (text: string) => recallPastLife(chunks, { history: [user(text, 1)], charName: '顾祁砚', userName: '周惟惟' }).chunks
    expect(ask('你手腕上那道疤还疼吗').some((chunk) => chunk.text.includes('疤'))).toBe(true)
    expect(ask('玉佩')).toEqual([])
    expect(ask('以前那块玉佩还记得吗').some((chunk) => chunk.text.includes('玉佩'))).toBe(true)
    expect(ask('今天加班到好晚')).toEqual([])
  })
})
