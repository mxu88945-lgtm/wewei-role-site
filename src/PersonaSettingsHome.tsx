import type { PointerEvent } from 'react'

export type PersonaSettingsPanel = 'home' | 'model' | 'prompts'
type Tap = (action: () => void) => { onPointerUp: (event: PointerEvent) => void; onClick: () => void }
type IconName = 'prompt' | 'memory' | 'past' | 'windows' | 'model' | 'people'
const ICONS: Record<IconName, string> = {
  prompt: 'M9 4h6M10 4v16m4-16v16M9 4H7a4 4 0 0 0 0 8h3',
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
