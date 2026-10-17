import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createPersonaTask, normalizePersonaTasks, parsePersonaTask, personaTaskStatus, taskIsActive, updatePersonaTask } from './personaTasks'
import { addPersonaThread, deletePersonaMessage, emptyPersonaState, enablePersona, normalizePersonaState, updatePersonaThread } from './personaWindow'
import { getPersonaState, setPersonaState } from './personaWindowStore'
import { tickPersonaTasks } from './personaTaskClock'
import { personaReplyText } from './personaWindowPresentation'
import { durableGet, durableSet } from './persistentStore'

describe('persona task cards', () => {
  it('parses one bounded reminder and hides complete or streaming markers', () => {
    expect(parsePersonaTask('记下了。[提醒:出门带文件|10][提醒:第二张|5]', 't', 1000, 2)).toEqual({ id: 't', text: '出门带文件', createdAt: 1000, dueAt: 601000, sourceMessageId: 2 })
    expect(parsePersonaTask('[提醒:喝茶|无效]', 't', 1000, 2)?.dueAt).toBe(1801000)
    expect(parsePersonaTask('[提醒: |10]', 't', 1000, 2)).toBeUndefined()
    expect(createPersonaTask('t', '安排', Infinity, 1000).dueAt).toBe(1801000)
    for (const text of ['正文[提醒:出门|10]', '正文[提醒:出门|', '正文[提', '正文[定时提醒:']) expect(personaReplyText(text)).toBe('正文')
  })

  it('records completion timing or cancellation once without treating overdue as done', () => {
    const task = createPersonaTask('t', '带文件', 1, 1000)
    expect(personaTaskStatus([task], 62000)).toContain('尚未点完成')
    expect(taskIsActive(task)).toBe(true)
    const done = updatePersonaTask([task], 't', 'done', 31000)
    expect(personaTaskStatus(done, 100000)).toContain('已完成，用时 00:30，按时')
    expect(updatePersonaTask(done, 't', 'cancel', 40000)).toEqual(done)
    expect(personaTaskStatus(updatePersonaTask([task], 't', 'cancel', 2000))).toContain('不再催促')
  })

  it('restores task state and preserves exact thread ownership in durable backups', async () => {
    let state = enablePersona(enablePersona(emptyPersonaState(), 'yu'), 'gu')
    const persona = state.personas[0], threadId = persona.activeThreadId
    state = updatePersonaThread(state, persona.id, threadId, (thread) => ({ ...thread, tasks: [{ ...createPersonaTask('t', '带文件', 1, 1000), doneAt: 2000 }] }))
    state = addPersonaThread(state, persona.id)
    await durableSet('test.taskBackup', JSON.parse(JSON.stringify(state)))
    const restored = normalizePersonaState(await durableGet('test.taskBackup'))
    expect(restored.personas[0].threads.find((thread) => thread.id === threadId)?.tasks?.[0].doneAt).toBe(2000)
    expect(restored.personas[0].threads.find((thread) => thread.id !== threadId)?.tasks).toBeUndefined()
    expect(restored.personas[1].threads[0].tasks).toBeUndefined()
    expect(normalizePersonaTasks([{ id: 'bad', text: '坏数据', createdAt: 100, dueAt: 10 }, { id: 'bad2', text: '坏数据', createdAt: 100, dueAt: Infinity }])).toEqual([])
  })

  it('marks overdue tasks in the original window once after a switch or resume, without adding messages', () => {
    let state = enablePersona(emptyPersonaState(), 'yu')
    const persona = state.personas[0], firstId = persona.activeThreadId
    state = updatePersonaThread(state, persona.id, firstId, (thread) => ({ ...thread, tasks: [createPersonaTask('t', '带文件', 1, 1000)] }))
    state = addPersonaThread(state, persona.id)
    setPersonaState(() => state)
    tickPersonaTasks(62000)
    const updated = getPersonaState()
    expect(updated.personas[0].threads[0].tasks?.[0].firedAt).toBe(62000)
    expect(updated.personas[0].threads[1].tasks).toBeUndefined()
    expect(updated.personas[0].threads.every((thread) => thread.messages.length === 0)).toBe(true)
    tickPersonaTasks(90000)
    expect(getPersonaState()).toBe(updated)
  })

  it('deleting the source reply removes its card while preserving manually created tasks', () => {
    let state = enablePersona(emptyPersonaState(), 'yu')
    const persona = state.personas[0]
    state = updatePersonaThread(state, persona.id, persona.activeThreadId, (thread) => ({ ...thread, messages: [{ id: 1, role: 'assistant', text: '任务', createdAt: 1000 }], tasks: [createPersonaTask('auto', '带文件', 1, 1000, 1), createPersonaTask('manual', '手动', 1, 1000)] }))
    state = deletePersonaMessage(state, persona.id, persona.activeThreadId, 1)
    expect(state.personas[0].threads[0].tasks?.map((task) => task.id)).toEqual(['manual'])
  })
})
