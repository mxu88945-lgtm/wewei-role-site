/**
 * v251：长回复窗口的合成对话（只给测试 import）。
 * - longReplyHistory：她每句 40–120 字，他每条回复约 replyChars 字（300/500/800），模拟长回复。
 * - plantedHistory：前半段埋 10 件具体的事（会滑出最近原文窗口），后半段是普通长回复闲聊。
 */
import type { PersonaMessage } from './personaWindow'

const HOUR = 3600_000

// 她的日常话由三截拼成（6×6×6 种），36 轮里不重复，像真实聊天那样有相近的词但不逐字重复。
const USER_OPEN = ['今天上班又被临时拉去开会', '下午太阳很好我在窗边坐了一会儿', '刚才把衣服洗了晾上', '晚上随便煮了点面加了个蛋', '早上差点没赶上公交', '中午跟同事去楼下吃了家新开的店']
const USER_MID = ['，小鸡们一直叫像在跟我抢位置', '，阳台有点挤明天得收拾一下', '，开到快七点才结束', '，路上风好大把我吹得头疼', '，看了半部电影中间还睡着了', '，手机快没电了也懒得充']
const USER_END = ['，现在只想躺着。', '，你有没有好好吃饭？', '，周末要不要出去走走呢。', '，说起来还挺好笑的。', '，感觉一天过得好快。', '，先跟你报备一下。']

const REPLY_SENTENCES = [
  '他把手里的书合上，放到一边，抬眼看了看窗外渐暗的天色。',
  '“先吃点东西，”他说，语气淡淡的，却没有给她拒绝的余地。',
  '廊下的灯被风吹得晃了一下，影子在墙上拉得很长。',
  '他起身去倒了杯热茶，指尖碰到杯沿时停了停，像是在试温度。',
  '“累就别硬撑，”他低声道，“事情明天也还在，人得先顾好自己。”',
  '院子里的竹叶沙沙地响，远处有人在收拾晾晒的衣物。',
  '他靠在椅背上，难得地没有急着说话，只是安静地听她讲完。',
  '桌上的烛火跳了跳，他伸手拨了一下灯芯，屋里亮了些。',
  '“我在，”他说，“你慢慢说，不着急。”',
  '他把外衣搭在她肩上，动作很轻，像怕惊动了什么。',
  '夜色一点点沉下来，书院里渐渐安静，只剩下虫鸣。',
  '他想了想，又补了一句：“下次早点告诉我，我去接你。”',
  '茶水的热气慢慢散开，带着一点淡淡的清香。',
  '他垂眼看着她，眼神比平时软了许多，却什么都没说。',
  '“嗯，”他应了一声，嘴角却不自觉地往上扬了一点。',
  '风从窗缝里钻进来，他起身把窗关严了些。',
]

/** 稳定的伪随机，保证每次跑出来的文字一样。 */
const pick = <T,>(list: T[], seed: number) => list[Math.abs(Math.imul(seed + 7, 2654435761) >>> 0) % list.length]

export function replyText(chars: number, seed: number, lead = '') {
  let text = lead
  let index = 0
  while (text.length < chars) text += pick(REPLY_SENTENCES, seed * 31 + index++)
  return text.slice(0, Math.max(chars, lead.length))
}

export function userText(seed: number) {
  return USER_OPEN[seed % 6] + USER_MID[Math.floor(seed / 6) % 6] + USER_END[(seed * 5 + 1) % 6]
}

export function longReplyHistory(exchanges: number, replyChars: number, now: number, latest = '今天好累，晚上随便吃了碗面，现在窝在沙发上不想动。'): PersonaMessage[] {
  const out: PersonaMessage[] = []
  let id = 1
  for (let index = 0; index < exchanges; index++) {
    const at = now - (exchanges - index) * HOUR
    out.push({ id: id++, role: 'user', text: userText(index), createdAt: at })
    out.push({ id: id++, role: 'assistant', text: replyText(replyChars, index), createdAt: at + 60_000 })
  }
  out.push({ id: id++, role: 'user', text: latest, createdAt: now - 60_000 })
  return out
}

/** 10 件具体的事：埋在哪一轮、她当时怎么说、他回复里也接一句、之后怎么问、命中看哪个词。 */
export const PLANTED = [
  { at: 2, user: '今天带团子去宠物医院剪指甲了，给它剪的是邵医生，团子全程抖成一团。', reply: '团子胆子小，邵医生手稳就好。', ask: '团子的指甲最近又长了，好烦', marker: '邵医生' },
  { at: 4, user: '跟你说，下个月十二号我要去青岛出差，公司给订的酒店在八大关附近。', reply: '青岛海风大，八大关那边晚上冷，带件外套。', ask: '你还记得我下个月要去哪出差吗？', marker: '八大关' },
  { at: 6, user: '你话这么少，以后我就叫你闷葫芦好了。', reply: '闷葫芦就闷葫芦，随你叫。', ask: '闷葫芦今天怎么又不说话', marker: '闷葫芦' },
  { at: 8, user: '你答应过我，等天冷了给我做一碗桂花酒酿圆子，不许赖账。', reply: '桂花酒酿圆子，记下了，天冷就做。', ask: '上次说好的酒酿圆子呢', marker: '桂花酒酿圆子' },
  { at: 10, user: '我们组那个梁思远又把我做的方案拿去跟领导邀功了，气死我了。', reply: '梁思远这种人，下次方案发出去记得抄送领导。', ask: '梁思远今天又来烦我了', marker: '梁思远' },
  { at: 12, user: '完蛋，我那把蓝色折叠伞落在地铁上了，是我最喜欢的那把。', reply: '蓝色折叠伞，明天去地铁失物招领问问。', ask: '之前丢在地铁上的折叠伞我还没去找', marker: '蓝色折叠伞' },
  { at: 14, user: '左边那颗智齿又疼起来了，牙医说下周三给我拔。', reply: '智齿拔之前别吃太硬的东西，下周三我陪你。', ask: '智齿还在疼，好难受', marker: '智齿' },
  { at: 16, user: '那我们定个暗号吧：月亮不睡我不睡，你听到就要回我。', reply: '月亮不睡我不睡。记住了。', ask: '月亮不睡', marker: '月亮不睡我不睡' },
  { at: 18, user: '我最近在学尤克里里，第一首练的是小星星，手指按得好疼。', reply: '尤克里里先练慢一点，手指起茧就不疼了。', ask: '尤克里里我好久没练了', marker: '尤克里里' },
  { at: 20, user: '我奶奶的生日是腊月初八，正好是喝腊八粥那天，今年想回去陪她。', reply: '腊月初八，到时候提醒你订票。', ask: '你还记得我奶奶生日是哪天吗？', marker: '腊月初八' },
]

export const ORDINARY = [
  '今天好累啊，什么都不想干',
  '晚上吃什么好呢，好纠结',
  '下雨了，好冷',
  '我刚洗完澡，头发还没吹',
  '你在干嘛呀',
  '给我讲个睡前故事吧',
  '工作好烦，不想上班',
  '今天天气还挺不错的',
  '我想你了',
  '晚安啦，明天见',
]

/** 前 22 轮里埋好 10 件事，之后接普通长回复闲聊，总共 exchanges 轮；最后一句是 latest。 */
export function plantedHistory(exchanges: number, replyChars: number, now: number, latest: string): PersonaMessage[] {
  const out: PersonaMessage[] = []
  let id = 1
  for (let index = 0; index < exchanges; index++) {
    const at = now - (exchanges - index) * HOUR
    const fact = PLANTED.find((item) => item.at === index)
    out.push({ id: id++, role: 'user', text: fact ? fact.user : userText(index), createdAt: at })
    out.push({ id: id++, role: 'assistant', text: replyText(replyChars, index, fact ? fact.reply : ''), createdAt: at + 60_000 })
  }
  out.push({ id: id++, role: 'user', text: latest, createdAt: now - 60_000 })
  return out
}
