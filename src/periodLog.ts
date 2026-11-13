/**
 * v230 经期记录（移植自伯恩 src/lib/period.ts，改成「每次一段 {start, end|null}」）。
 * 纯函数：统计平均周期/经期、预测下次、判断今天处在哪个阶段，以及给人格窗口尾巴的一句短提示。
 * 只存本机 localStorage（weijing.periodLog，会进备份）；不做医疗判断。
 */

export const PERIOD_LOG_KEY = 'weijing.periodLog'

export type PeriodEntry = { id: string; start: string; end: string | null }
export type PeriodLogState = {
  /** 让人格窗口里的 TA 知道当前阶段（只在经期中、经前几天、推迟时说一句）。 */
  enabled: boolean
  entries: PeriodEntry[]
}

export const DEFAULT_CYCLE = 28
export const DEFAULT_LENGTH = 5
/** 开始后超过这么多天还没点「结束」，按平均经期长度算（多半是忘了点）。 */
export const OPEN_ENTRY_LIMIT = 14

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function toDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function toDateStr(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
export function addDays(s: string, n: number): string {
  const dt = toDate(s)
  dt.setDate(dt.getDate() + n)
  return toDateStr(dt)
}
/** a − b，按自然日。 */
export function diffDays(a: string, b: string): number {
  return Math.round((toDate(a).getTime() - toDate(b).getTime()) / 86400000)
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const isDate = (value: unknown): value is string => typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(toDate(value).getTime())

export function emptyPeriodLog(): PeriodLogState {
  return { enabled: true, entries: [] }
}

const newId = () => `pd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function normalizePeriodLog(raw: unknown): PeriodLogState {
  if (!raw || typeof raw !== 'object') return emptyPeriodLog()
  const value = raw as { enabled?: unknown; entries?: unknown }
  const entries = Array.isArray(value.entries) ? value.entries.flatMap((item): PeriodEntry[] => {
    if (!item || typeof item !== 'object') return []
    const entry = item as { id?: unknown; start?: unknown; end?: unknown }
    if (!isDate(entry.start)) return []
    const end = isDate(entry.end) && diffDays(entry.end, entry.start) >= 0 ? entry.end : null
    return [{ id: typeof entry.id === 'string' && entry.id ? entry.id : newId(), start: entry.start, end }]
  }) : []
  return { enabled: value.enabled !== false, entries: sortEntries(entries) }
}

const sortEntries = (entries: PeriodEntry[]) => [...entries].sort((a, b) => a.start.localeCompare(b.start))

/** 这一段实际覆盖到哪天（开着的段：到今天，最多 OPEN_ENTRY_LIMIT 天，超过就按平均长度）。 */
export function entryEnd(entry: PeriodEntry, today: string, avgLength = DEFAULT_LENGTH): string {
  if (entry.end) return entry.end
  const span = diffDays(today, entry.start)
  if (span < 0) return entry.start
  if (span < OPEN_ENTRY_LIMIT) return today
  return addDays(entry.start, avgLength - 1)
}

/** 正在进行（开始了、没点结束、还没超时）的那一段。 */
export function openEntry(state: PeriodLogState, today: string): PeriodEntry | undefined {
  const last = state.entries[state.entries.length - 1]
  if (!last || last.end) return undefined
  const span = diffDays(today, last.start)
  return span >= 0 && span < OPEN_ENTRY_LIMIT ? last : undefined
}

/** 今天开始。已经有进行中的一段就不重复开。 */
export function markPeriodStart(state: PeriodLogState, today: string): PeriodLogState {
  if (openEntry(state, today)) return state
  const covering = state.entries.find((entry) => entry.end && diffDays(today, entry.start) >= 0 && diffDays(entry.end, today) >= 0)
  if (covering) return state
  return { ...state, entries: sortEntries([...state.entries, { id: newId(), start: today, end: null }]) }
}

/** 今天结束：结束进行中的那一段。 */
export function markPeriodEnd(state: PeriodLogState, today: string): PeriodLogState {
  const open = openEntry(state, today)
  if (!open) return state
  return { ...state, entries: state.entries.map((entry) => entry.id === open.id ? { ...entry, end: today } : entry) }
}

/** 补记一段（可只填开始）。与已有段重叠或首尾相接时合并成一段。 */
export function addPeriodRange(state: PeriodLogState, start: string, end: string | null, today: string): PeriodLogState {
  if (!isDate(start) || diffDays(today, start) < 0) return state
  let finalEnd = end && isDate(end) ? (diffDays(end, start) < 0 ? start : end) : null
  if (finalEnd && diffDays(finalEnd, today) > 0) finalEnd = today
  let merged: PeriodEntry = { id: newId(), start, end: finalEnd }
  const rest: PeriodEntry[] = []
  for (const entry of state.entries) {
    const entryStop = entryEnd(entry, today)
    const mergedStop = entryEnd(merged, today)
    const touches = diffDays(entry.start, addDays(mergedStop, 1)) <= 0 && diffDays(merged.start, addDays(entryStop, 1)) <= 0
    if (!touches) { rest.push(entry); continue }
    const startMin = diffDays(entry.start, merged.start) < 0 ? entry.start : merged.start
    const open = (entry.end === null && entryStop === today) || (merged.end === null && mergedStop === today)
    const stopMax = diffDays(entryStop, mergedStop) > 0 ? entryStop : mergedStop
    merged = { id: entry.id, start: startMin, end: open ? null : stopMax }
  }
  return { ...state, entries: sortEntries([...rest, merged]) }
}

export function removePeriodEntry(state: PeriodLogState, id: string): PeriodLogState {
  return { ...state, entries: state.entries.filter((entry) => entry.id !== id) }
}

export type PeriodPhase = 'none' | 'period' | 'premenstrual' | 'late' | 'afterPeriod' | 'ovulation' | 'follicular' | 'luteal'

export type PeriodStats = {
  hasData: boolean
  avgCycle: number
  avgLength: number
  /** 经期第几天（1 起）；不在经期为 null */
  periodDay: number | null
  nextStart: string | null
  /** 距预测下次的天数；推迟时为负 */
  daysUntilNext: number | null
  ovulation: string | null
  phase: PeriodPhase
  /** 给界面的一句短话，例如「经期中 · 第 2 天」 */
  label: string
  /** 设置首页右侧的极短值，例如「经期第 2 天」「约 12 天后」 */
  short: string
}

/** 平均周期：相邻两次开始的间隔（只算 15–60 天的，漏记的长间隔不计），夹在 21–45。 */
export function averageCycle(entries: PeriodEntry[]): number {
  const starts = sortEntries(entries).map((entry) => entry.start)
  const gaps: number[] = []
  for (let i = 1; i < starts.length; i += 1) {
    const gap = diffDays(starts[i], starts[i - 1])
    if (gap >= 15 && gap <= 60) gaps.push(gap)
  }
  const recent = gaps.slice(-6)
  return recent.length ? clamp(Math.round(recent.reduce((a, b) => a + b, 0) / recent.length), 21, 45) : DEFAULT_CYCLE
}

/** 平均经期长度：只算已结束的段，夹在 2–10。 */
export function averageLength(entries: PeriodEntry[]): number {
  const lengths = entries.filter((entry) => entry.end).map((entry) => diffDays(entry.end as string, entry.start) + 1).filter((n) => n >= 1 && n <= 14).slice(-6)
  return lengths.length ? clamp(Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length), 2, 10) : DEFAULT_LENGTH
}

export function periodStats(state: PeriodLogState, today: string): PeriodStats {
  const entries = sortEntries(state.entries)
  const avgCycle = averageCycle(entries)
  const avgLength = averageLength(entries)
  const empty: PeriodStats = { hasData: false, avgCycle, avgLength, periodDay: null, nextStart: null, daysUntilNext: null, ovulation: null, phase: 'none', label: '还没有记录', short: '未记录' }
  const past = entries.filter((entry) => diffDays(today, entry.start) >= 0)
  const last = past[past.length - 1]
  if (!last) return empty
  const lastStop = entryEnd(last, today, avgLength)
  const inPeriod = diffDays(lastStop, today) >= 0
  const periodDay = inPeriod ? diffDays(today, last.start) + 1 : null
  let nextStart = addDays(last.start, avgCycle)
  let daysUntilNext = diffDays(nextStart, today)
  // 推迟超过两周多半是漏记：按平均周期往后滚。
  while (daysUntilNext < -OPEN_ENTRY_LIMIT) { nextStart = addDays(nextStart, avgCycle); daysUntilNext = diffDays(nextStart, today) }
  const ovulation = addDays(nextStart, -14)
  const short = periodDay ? `经期第${periodDay}天` : daysUntilNext < 0 ? `晚了${-daysUntilNext}天` : daysUntilNext === 0 ? '预计今天' : `约${daysUntilNext}天后`
  const base = { hasData: true, avgCycle, avgLength, periodDay, nextStart, daysUntilNext, ovulation, short }
  if (periodDay) return { ...base, phase: 'period', label: `经期中 · 第 ${periodDay} 天` }
  if (daysUntilNext < 0) return { ...base, phase: 'late', label: `比预计晚了 ${-daysUntilNext} 天` }
  if (daysUntilNext === 0) return { ...base, phase: 'premenstrual', label: '预计今天来' }
  if (daysUntilNext <= 3) return { ...base, phase: 'premenstrual', label: `经期前期 · 约 ${daysUntilNext} 天后` }
  const sinceEnd = diffDays(today, lastStop)
  if (sinceEnd >= 1 && sinceEnd <= 3) return { ...base, phase: 'afterPeriod', label: '经期刚结束' }
  const toOvulation = diffDays(ovulation, today)
  if (Math.abs(toOvulation) <= 2) return { ...base, phase: 'ovulation', label: '排卵期前后' }
  if (toOvulation > 2) return { ...base, phase: 'follicular', label: `卵泡期 · 约 ${daysUntilNext} 天后来` }
  return { ...base, phase: 'luteal', label: `黄体期 · 约 ${daysUntilNext} 天后来` }
}

/** 日历上这一天：已记录的经期 / 预测的下次。 */
export function dayMark(state: PeriodLogState, date: string, today: string, stats: PeriodStats = periodStats(state, today)): 'period' | 'predicted' | null {
  for (const entry of state.entries) {
    if (diffDays(date, entry.start) >= 0 && diffDays(entryEnd(entry, today, stats.avgLength), date) >= 0) return 'period'
  }
  if (stats.nextStart && stats.phase !== 'period') {
    const offset = diffDays(date, stats.nextStart)
    if (offset >= 0 && offset < stats.avgLength && diffDays(date, today) >= 0) return 'predicted'
  }
  return null
}

/** 一个月的日历格子（周一起），前面用 null 补位。 */
export function monthGrid(year: number, month: number): Array<string | null> {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7
  const count = new Date(year, month + 1, 0).getDate()
  return [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => toDateStr(new Date(year, month, i + 1)))]
}

/**
 * 人格窗口【本轮背景】里的一句话：只在经期中、经前三天内、推迟时说；其它时候不提。
 * 不给医疗建议，只让 TA 自然体贴一点。
 */
export function periodTurnNote(state: PeriodLogState, today: string, userName = '她'): string {
  if (!state.enabled) return ''
  const stats = periodStats(state, today)
  const who = userName.trim() || '她'
  const tail = '只是让你心里有数：语气体贴些，可以自然关心冷暖和休息；不用每条都提，不给医疗建议。'
  if (stats.phase === 'period') return `【她的生理期】${who}今天经期第 ${stats.periodDay} 天。${tail}`
  if (stats.phase === 'premenstrual') return `【她的生理期】${who}的经期${stats.daysUntilNext ? `预计 ${stats.daysUntilNext} 天后来` : '预计就在今天'}，可能容易累或情绪起伏。${tail}`
  if (stats.phase === 'late') return `【她的生理期】${who}的经期比预计晚了 ${-(stats.daysUntilNext || 0)} 天（可能只是没记）。别主动追问，${tail}`
  return ''
}
