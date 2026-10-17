import { getPersonaState, setPersonaState } from './personaWindowStore'
import { taskIsActive } from './personaTasks'

/** Mark due tasks in their original threads. Never generates or routes chat messages. */
export type PersonaTaskDue = { personaId: string; threadId: string; taskId: string; text: string }
export function tickPersonaTasks(now = Date.now()) {
  const snapshot = getPersonaState()
  const due: PersonaTaskDue[] = snapshot.personas.flatMap((persona) => !persona.enabled ? [] : persona.threads.flatMap((thread) => (thread.tasks || []).filter((task) => taskIsActive(task) && task.firedAt === undefined && task.dueAt <= now).map((task) => ({ personaId: persona.id, threadId: thread.id, taskId: task.id, text: task.text }))))
  if (!due.length) return due
  setPersonaState((state) => ({ ...state, personas: state.personas.map((persona) => !persona.enabled ? persona : { ...persona, threads: persona.threads.map((thread) => {
    if (!thread.tasks?.some((task) => taskIsActive(task) && task.firedAt === undefined && task.dueAt <= now)) return thread
    return { ...thread, tasks: thread.tasks.map((task) => taskIsActive(task) && task.firedAt === undefined && task.dueAt <= now ? { ...task, firedAt: now } : task) }
  }) }) }))
  return due
}

export function startPersonaTaskClock(onDue?: (due: PersonaTaskDue[]) => void) {
  const tick = () => { const due = tickPersonaTasks(); if (due.length) onDue?.(due) }
  const timer = window.setInterval(tick, 1000)
  tick()
  window.addEventListener('focus', tick)
  document.addEventListener('visibilitychange', tick)
  return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick) }
}
