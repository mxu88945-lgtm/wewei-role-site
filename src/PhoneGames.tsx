import { useState } from 'react'
import { GAME_NAMES, type GamePlayer, type PhoneGameKind, type PhoneGameRound, type TruthMode } from './phoneGames'
import './phone-games.css'

export default function PhoneGames({ members, current, onPlay, onClose }: {
  members: GamePlayer[]; current?: PhoneGameRound
  onPlay: (kind: PhoneGameKind, players: GamePlayer[], truthMode: TruthMode, customTask: string) => void
  onClose: () => void
}) {
  const [kind, setKind] = useState<PhoneGameKind>(current?.kind || 'truth')
  const [truthMode, setTruthMode] = useState<TruthMode>(current?.truthMode || 'random')
  const [selected, setSelected] = useState(() => current ? current.players.map((player) => player.id) : members.map((member) => member.id))
  const [customTask, setCustomTask] = useState('')
  const players = members.filter((member) => selected.includes(member.id))
  return <div className="red-packet-layer phone-games-layer" role="dialog" aria-modal="true" aria-label="群互动小游戏" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
    <header><button type="button" aria-label="关闭小游戏" onClick={onClose}>‹</button><strong>今晚玩什么</strong><span /></header>
    <div className="phone-games-body">
      <div className="phone-game-kinds" role="group" aria-label="游戏种类">{(['truth', 'draw', 'poker'] as const).map((value, index) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}><b>{['💬', '🎴', '♠'][index]}</b><span>{GAME_NAMES[value]}</span></button>)}</div>
      <p className="phone-game-intro">{kind === 'truth' ? '随机点一个人，抽一道真心话或大冒险，大家在群里接着玩。' : kind === 'draw' ? '抽一个人和一张互动卡：默契、直球、采访、心愿……' : '每人一张明牌，大王最大，2 最小；同点数并列。每轮重新洗牌，不涉及积分。'}</p>
      <fieldset className="phone-game-people"><legend>谁一起玩 · 已选 {players.length} 人</legend><button type="button" className="phone-game-select-all" onClick={() => setSelected(players.length === members.length ? [] : members.map((member) => member.id))}>{players.length === members.length ? '取消全选' : '全选'}</button><div>{members.map((member) => <label key={member.id}><input type="checkbox" checked={selected.includes(member.id)} onChange={() => setSelected((ids) => ids.includes(member.id) ? ids.filter((id) => id !== member.id) : [...ids, member.id])} />{member.name}{member.id === 'user' && '（我）'}</label>)}</div></fieldset>
      {kind === 'truth' && <fieldset className="phone-game-truth"><legend>抽什么题</legend>{([['random', '随机混合'], ['truth', '只要真心话'], ['dare', '只要大冒险']] as const).map(([value, label]) => <label key={value}><input type="radio" name="truth-mode" checked={truthMode === value} onChange={() => setTruthMode(value)} />{label}</label>)}</fieldset>}
      {kind !== 'poker' && <label className="phone-game-custom">自己出题（可选）<textarea rows={3} maxLength={300} value={customTask} onChange={(event) => setCustomTask(event.target.value)} placeholder="留空抽题库；也可以写你的专属题目，再随机抽一个人来答" /></label>}
      <button type="button" className="phone-game-play" disabled={players.length < 2 || players.length > 54} onClick={() => onPlay(kind, players, truthMode, customTask.trim())}>{kind === 'poker' ? '洗牌，发到群里' : '抽一张，发到群里'}</button>
      <small className="phone-game-foot">至少选两个人 · 你也可以参加 · 不想答可以跳过</small>
    </div>
  </div>
}

export function PhoneGameCard({ round, active, busy, onNext, onEnd }: { round: PhoneGameRound; active: boolean; busy: boolean; onNext: () => void; onEnd: () => void }) {
  const nameOf = (id?: string) => round.players.find((player) => player.id === id)?.name || '参与者'
  return <article className="phone-game-card" aria-label={`${GAME_NAMES[round.kind]}第${round.number}轮`}>
    <header><span>{round.kind === 'poker' ? '♠' : '🎴'}</span><div><strong>{GAME_NAMES[round.kind]}</strong><small>第 {round.number} 轮 · {round.players.length} 人参与</small></div></header>
    {round.kind === 'poker' ? <><div className="phone-game-hands">{round.cards?.map((card) => <div key={card.playerId} className={/[♥♦]|大王/.test(card.label) ? 'red' : ''}><b>{card.label}</b><small>{nameOf(card.playerId)}</small>{round.winnerIds?.includes(card.playerId) && <em>胜出</em>}</div>)}</div><p className="phone-game-winner">🏆 {(round.winnerIds || []).map(nameOf).join('、')}</p><small className="phone-game-rule">大王 ＞ 小王 ＞ A ＞ K ＞ … ＞ 2 · 同点数并列</small></> : <><p className="phone-game-target">这轮抽中 <strong>{nameOf(round.targetId)}</strong></p><p className="phone-game-task">{round.task}</p></>}
    {active && <footer><button type="button" disabled={busy} onClick={onNext}>{busy ? '等大家说完…' : '下一轮 / 换一张'}</button><button type="button" disabled={busy} onClick={onEnd}>结束</button></footer>}
  </article>
}
