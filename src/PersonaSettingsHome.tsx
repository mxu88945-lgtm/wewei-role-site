import type { PointerEvent } from 'react'

export type PersonaSettingsPanel = 'home' | 'model' | 'prompts' | 'appearance' | 'tasks'
type Tap = (action: () => void) => { onPointerUp: (event: PointerEvent) => void; onClick: () => void }
type IconName = 'prompt' | 'memory' | 'past' | 'windows' | 'model' | 'people' | 'appearance'
const ICONS: Record<IconName, string> = {
  prompt: 'M9 4h6M10 4v16m4-16v16M9 4H7a4 4 0 0 0 0 8h3',
  appearance: 'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 1-3.7 1.5 1.5 0 0 1 .8-2.8H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3ZM7 10h.01M10 7h.01M15 7h.01M17 11h.01',
  memory: 'm12 3 8 9-8 9-8-9 8-9Z',
  past: 'M3 11a9 9 0 1 1 3 8M3 5v6h6m3-4v5l3 2',
  windows: 'M4 5h16v14H4V5Zm0 4h16M8 5v4',
  model: 'M8 3v3m8-3v3M8 18v3m8-3v3M3 8h3m-3 8h3m12-8h3m-3 8h3M6 6h12v12H6V6Zm4 4h4v4h-4v-4Z',
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

export default function PersonaSettingsHome({ promptLength, memoryCount, threadCount, threadTitle, channelName, modelName, pastLifeEnabled, onNavigate, onThreads, onMemory, onManage, onTogglePastLife, tap }: {
  promptLength: number; memoryCount: number; threadCount: number; threadTitle: string; channelName: string; modelName: string; pastLifeEnabled: boolean
  onNavigate: (panel: PersonaSettingsPanel) => void; onThreads: () => void; onMemory: () => void; onManage: () => void; onTogglePastLife: () => void; tap: Tap
}) {
  return <div className="persona-settings-home">
    <p className="persona-settings-caption">你们的相处</p>
    <section className="persona-settings-group" aria-label="相处与记忆">
      <Row icon="prompt" title="系统提示词" description="相处方式、语气与表达偏好" value={promptLength ? `${promptLength.toLocaleString()} 字` : '默认规则'} onSelect={() => onNavigate('prompts')} tap={tap} />
      <Row icon="memory" title="记忆" description="长期记忆 · 同一人格的窗口共用" value={`${memoryCount} 条`} onSelect={onMemory} tap={tap} />
      <Row icon="appearance" title="外观与文字" description="主题、壁纸、字号与文字颜色" onSelect={() => onNavigate('appearance')} tap={tap} />
      <Row icon="past" title="任务卡" description="当前窗口的倒计时、完成与取消" onSelect={() => onNavigate('tasks')} tap={tap} />
      <div className="persona-settings-row persona-settings-toggle">
        <Icon name="past" /><span className="persona-settings-copy"><strong>前世记忆</strong><small>过往交流与故事参考，不接续原剧情</small></span>
        <button className={`switch ${pastLifeEnabled ? 'on' : ''}`} aria-label="前世记忆" aria-pressed={pastLifeEnabled} {...tap(onTogglePastLife)}><span /></button>
      </div>
    </section>
    <p className="persona-settings-caption">窗口与连接</p>
    <section className="persona-settings-group" aria-label="窗口与连接">
      <Row icon="windows" title="聊天窗口" description={threadTitle || '在左侧栏查看、新开与整理窗口'} value={`${threadCount} 个`} onSelect={onThreads} tap={tap} />
      <Row icon="model" title="模型与渠道" description={modelName || '选择这个人格使用的回复模型'} value={channelName} onSelect={() => onNavigate('model')} tap={tap} />
      <Row icon="people" title="管理人格" description="添加、切换与收纳你的独立人格" onSelect={onManage} tap={tap} />
    </section>
    <p className="persona-settings-footer">背景留作来历，相处从此刻开始。</p>
  </div>
}
