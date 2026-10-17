export type PersonaTask = { id: string; text: string; createdAt: number; dueAt: number; sourceMessageId?: number; doneAt?: number; canceledAt?: number; firedAt?: number; reactedAt?: number }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
export const PERSONA_TASK_PROMPT = '【任务卡】仅对用户提到的易忘安排或待办，在回复末尾写 [提醒:事项|分钟]，例如 [提醒:出门前带上文件|30]。每轮最多一张，多数回复无需任务卡，不要反复安排相同任务。标记会变成可完成/取消的倒计时卡。任务只属于当前窗口；应用关闭时不会在后台唤醒模型，也不要声称已在现实中替用户执行。'

export function normalizePersonaTasks(value: unknown): PersonaTask[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((raw): PersonaTask[] => {
    if (!record(raw) || typeof raw.id !== 'string' || !raw.id || seen.has(raw.id) || typeof raw.text !== 'string' || !raw.text.trim() || typeof raw.createdAt !== 'number' || !Number.isFinite(raw.createdAt) || typeof raw.dueAt !== 'number' || !Number.isFinite(raw.dueAt) || raw.dueAt < raw.createdAt) return []
    seen.add(raw.id)
    const task: PersonaTask = { id: raw.id, text: raw.text.trim().slice(0, 500), createdAt: raw.createdAt, dueAt: raw.dueAt }
    if (typeof raw.sourceMessageId === 'number' && Number.isSafeInteger(raw.sourceMessageId) && raw.sourceMessageId > 0) task.sourceMessageId = raw.sourceMessageId
    for (const key of ['doneAt', 'canceledAt', 'firedAt', 'reactedAt'] as const) if (typeof raw[key] === 'number' && Number.isFinite(raw[key]) && raw[key] >= raw.createdAt) task[key] = raw[key]
    return [task]
  })
}

export const taskIsActive = (task: PersonaTask) => task.doneAt === undefined && task.canceledAt === undefined
export function createPersonaTask(id: string, text: string, minutes: number, now = Date.now(), sourceMessageId?: number): PersonaTask {
  const duration = Number.isFinite(minutes) ? Math.max(1, Math.min(10080, Math.round(minutes))) : 30
  return { id, text: text.trim().slice(0, 500), createdAt: now, dueAt: now + duration * 60000, ...(sourceMessageId !== undefined ? { sourceMessageId } : {}) }
}
export function parsePersonaTask(text: string, id: string, now: number, sourceMessageId: number): PersonaTask | undefined {
  const match = /\[\s*(?:提醒|提醒任务|定时提醒|任务|reminder)\s*[:：]\s*([^\]\n]+)\]/i.exec(text)
  if (!match) return undefined
  const parts = match[1].split('|'), title = parts[0].trim()
  if (!title) return undefined
  return createPersonaTask(id, title, parts[1]?.trim() ? Number(parts[1]) : 30, now, sourceMessageId)
}
export function updatePersonaTask(tasks: PersonaTask[], id: string, action: 'done' | 'cancel', now = Date.now()) {
  return tasks.map((task) => task.id !== id || !taskIsActive(task) ? task : { ...task, ...(action === 'done' ? { doneAt: Math.max(now, task.createdAt) } : { canceledAt: Math.max(now, task.createdAt) }) })
}
export function taskClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000)), seconds = total % 60, minutes = Math.floor(total / 60) % 60, hours = Math.floor(total / 3600)
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
export function personaTaskStatus(tasks: PersonaTask[] = [], now = Date.now()) {
  if (!tasks.length) return ''
  const current = tasks.filter(taskIsActive).slice(-6), recent = tasks.filter((task) => !taskIsActive(task)).slice(-3)
  return '【当前窗口任务状态｜应用记录，仅供参考】\n' + [...current, ...recent].map((task) => `- ${task.text}：${task.doneAt !== undefined ? `已完成，用时 ${taskClock(task.doneAt - task.createdAt)}，${task.doneAt <= task.dueAt ? '按时' : '超时'}` : task.canceledAt !== undefined ? '用户已取消，不再催促' : task.dueAt <= now ? '时间已到，尚未点完成' : `剩余 ${taskClock(task.dueAt - now)}`}`).join('\n') + '\n到期不代表用户完成；不要把任务当成用户已经做过的事实。'
}
