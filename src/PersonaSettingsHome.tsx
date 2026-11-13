import type { PointerEvent } from 'react'

export type PersonaSettingsPanel = 'home' | 'model' | 'prompts' | 'appearance' | 'tasks' | 'selfCard' | 'period' | 'lifePeople' | 'gifts'
type Tap = (action: () => void) => { onPointerUp: (event: PointerEvent) => void; onClick: () => void }
type IconName = 'gift' | 'selfCard' | 'prompt' | 'memory' | 'past' | 'windows' | 'model' | 'people' | 'appearance' | 'music' | 'period' | 'person'
const ICONS: Record<IconName, string> = {
  gift: 'M20 12v9H4v-9M2 7h20v5H2V7Zm10 14V7m0 0H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Zm0 0h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z',
  selfCard: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  prompt: 'M9 4h6M10 4v16m4-16v16M9 4H7a4 4 0 0 0 0 8h3',
  appearance: 'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 1-3.7 1.5 1.5 0 0 1 .8-2.8H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3ZM7 10h.01M10 7h.01M15 7h.01M17 11h.01',
  memory: 'm12 3 8 9-8 9-8-9 8-9Z',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  past: 'M3 11a9 9 0 1 1 3 8M3 5v6h6m3-4v5l3 2',
  windows: 'M4 5h16v14H4V5Zm0 4h16M8 5v4',
  model: 'M8 3v3m8-3v3M8 18v3m8-3v3M3 8h3m-3 8h3m12-8h3m-3 8h3M6 6h12v12H6V6Zm4 4h4v4h-4v-4Z',
  period: 'M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z',
  person: 'M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10-8a4 4 0 0 1 0 8m3 10v-2a4 4 0 0 0-3-3.87',
}

function Icon({ name }: { name: IconName }) {
  return <span className="persona-settings-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg></span>
}

function Row({ icon, title, description, value, onSelect, tap }: { icon: IconName; title: string; description: string; value?: string; onSelect: () => void; tap: Tap }) {
  return <button className="persona-settings-row" {...tap(onSelect)}>
    <Icon name={icon} /><span className="persona-settings-copy"><strong>{title}</strong><small>{description}</small></span>
    <span className="persona-settings-value" title={value}>{value}</span><span className="persona-settings-chevron" aria-hidden="true">›</span>
  </button>
}

export default function PersonaSettingsHome({ promptLength, memoryCount, threadCount, threadTitle, channelName, modelName, pastLifeEnabled, onNavigate, onThreads, onMemory, onManage, onTogglePastLife, trackCount = 0, songPickEnabled = true, onMusic, onToggleSongPick, selfCardLength = 0, giftCount, periodLabel, peopleCount, personaCount, onSwitchPersona, tap }: {
  promptLength: number; memoryCount: number; threadCount: number; threadTitle: string; channelName: string; modelName: string; pastLifeEnabled: boolean
  onNavigate: (panel: PersonaSettingsPanel) => void; onThreads: () => void; onMemory: () => void; onManage: () => void; onTogglePastLife: () => void
  /** v207 一起听歌 */
  trackCount?: number; songPickEnabled?: boolean; onMusic?: () => void; onToggleSongPick?: () => void
  /** v211 他自己写的卡 */
  selfCardLength?: number
  /** v231 他做的礼物（不传就不显示） */
  giftCount?: number
  /** v230 她的生活：经期记录、人物档案（不传就不显示） */
  periodLabel?: string; peopleCount?: number
  /** v230 切换人格（原顶栏中间的入口） */
  personaCount?: number; onSwitchPersona?: () => void; tap: Tap
}) {
  return <div className="persona-settings-home">
    <p className="persona-settings-caption">你们的相处</p>
    <section className="persona-settings-group" aria-label="相处与记忆">
      <Row icon="prompt" title="系统提示词" description="相处方式、语气与表达偏好" value={promptLength ? `${promptLength.toLocaleString()} 字` : '默认规则'} onSelect={() => onNavigate('prompts')} tap={tap} />
      <Row icon="selfCard" title="他自己写的卡" description="他在相处中慢慢补全的自己，原卡不动" value={selfCardLength ? `${selfCardLength.toLocaleString()} 字` : '还空着'} onSelect={() => onNavigate('selfCard')} tap={tap} />
      {giftCount !== undefined && <Row icon="gift" title="他做的礼物" description="他亲手做给你的礼物，聊天里会变成礼物卡" value={giftCount ? `${giftCount} 份` : '还没有'} onSelect={() => onNavigate('gifts')} tap={tap} />}
      <Row icon="memory" title="记忆" description="长期记忆 · 同一人格的窗口共用" value={`${memoryCount} 条`} onSelect={onMemory} tap={tap} />
      <Row icon="appearance" title="外观与文字" description="主题、壁纸、字号与文字颜色" onSelect={() => onNavigate('appearance')} tap={tap} />
      <Row icon="past" title="任务卡" description="当前窗口的倒计时、完成与取消" onSelect={() => onNavigate('tasks')} tap={tap} />
      <div className="persona-settings-row persona-settings-toggle">
        <Icon name="past" /><span className="persona-settings-copy"><strong>前世记忆</strong><small>过往交流与故事参考，不接续原剧情</small></span>
        <button className={`switch ${pastLifeEnabled ? 'on' : ''}`} aria-label="前世记忆" aria-pressed={pastLifeEnabled} {...tap(onTogglePastLife)}><span /></button>
      </div>
    </section>
    {onMusic && <><p className="persona-settings-caption">一起听歌</p>
    <section className="persona-settings-group" aria-label="一起听歌">
      <Row icon="music" title="🎵 唱片机" description="和主聊天同一份歌单" value={trackCount ? `${trackCount} 首` : '导入歌'} onSelect={onMusic} tap={tap} />
      {onToggleSongPick && <div className="persona-settings-row persona-settings-toggle">
        <Icon name="music" /><span className="persona-settings-copy"><strong>让他自己点歌</strong><small>气氛合适时，他偶尔从歌单里挑一首放</small></span>
        <button className={`switch ${songPickEnabled ? 'on' : ''}`} aria-label="让他自己点歌" aria-pressed={songPickEnabled} {...tap(onToggleSongPick)}><span /></button>
      </div>}
    </section></>}
    {(periodLabel !== undefined || peopleCount !== undefined) && <><p className="persona-settings-caption">你的生活</p>
    <section className="persona-settings-group" aria-label="你的生活">
      {periodLabel !== undefined && <Row icon="period" title="经期记录" description="记录与预测，TA 会在需要时体贴一点" value={periodLabel} onSelect={() => onNavigate('period')} tap={tap} />}
      {peopleCount !== undefined && <Row icon="person" title="人物档案" description="你身边的人，聊到时 TA 会记得是谁" value={peopleCount ? `${peopleCount} 人` : '还空着'} onSelect={() => onNavigate('lifePeople')} tap={tap} />}
    </section></>}
    <p className="persona-settings-caption">窗口与连接</p>
    <section className="persona-settings-group" aria-label="窗口与连接">
      <Row icon="windows" title="聊天窗口" description={threadTitle || '在左侧栏查看、新开与整理窗口'} value={`${threadCount} 个`} onSelect={onThreads} tap={tap} />
      <Row icon="model" title="模型与渠道" description={modelName || '选择这个人格使用的回复模型'} value={channelName} onSelect={() => onNavigate('model')} tap={tap} />
      {onSwitchPersona && <Row icon="people" title={`切换人格${personaCount ? `（共 ${personaCount} 位）` : ''}`} description="在你开启的人格之间切换" onSelect={onSwitchPersona} tap={tap} />}
      <Row icon="people" title="管理人格" description="添加、切换与收纳你的独立人格" onSelect={onManage} tap={tap} />
    </section>
    <p className="persona-settings-footer">背景留作来历，相处从此刻开始。</p>
  </div>
}
