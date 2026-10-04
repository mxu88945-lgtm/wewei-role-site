import { describe, expect, it } from 'vitest'
import { buildStoryVariablesPrompt, runStoryScript, type StoryScript } from './storyScripts'
import { captureConversationContext, forkConversationAtMessage, restoreConversationContext, storeContextSnapshot } from './conversationBranches'
import { createFreshConversationFrom, restartConversationInPlace, type Conversation } from './conversationLifecycle'
import { captureTemporaryPlot, consumeTemporaryPlot, withFinalTemporaryPlotInstruction } from './temporaryPlot'

const script: StoryScript = {
  id: 'call', name: '配角来电', runOnce: true, mode: 'once', recipientIds: ['a'],
  writes: [{ variableId: 'place', value: '书房' }],
  condition: { variableId: 'stage', value: '未发生' }, prompt: '保持在{{变量:地点}}，安排一通新的来电。',
}
const source: Conversation = {
  id: 'group', kind: 'group', characterId: 'a', participantIds: ['a', 'b'], title: '剧场', createdAt: 1, updatedAt: 1,
  messages: [{ id: 1, role: 'user', text: '继续' }],
  storyVariables: [
    { id: 'place', name: '地点', value: '客厅' },
    { id: 'stage', name: '来电进度', value: '未发生', recipientIds: [] },
    { id: 'secret', name: '隐情', value: '导演专属秘密', recipientIds: ['b'] },
  ], storyScripts: [script],
}

describe('native story script actions', () => {
  it('atomically updates variables and queues a private instruction without chat or model calls', () => {
    const { conversation, error } = runStoryScript(source, 'call', 2, 'queued')
    expect(error).toBeUndefined()
    expect(conversation.storyVariables?.[0]).toEqual({ ...source.storyVariables![0], value: '书房' })
    expect(conversation.temporaryPlot).toEqual({ id: 'queued', text: '保持在书房，安排一通新的来电。', mode: 'once', recipientIds: ['a'] })
    expect(conversation.messages).toBe(source.messages)
    expect(source.storyVariables![0].value).toBe('客厅')
    expect(source.temporaryPlot).toBeUndefined()
    expect(conversation.storyScriptRuns?.call).toBe(2)
    expect(captureTemporaryPlot(conversation, false, 'a')).toBeUndefined()
    expect(captureTemporaryPlot(conversation, true, 'b')).toBeUndefined()
    expect(captureTemporaryPlot(conversation, true, 'a')?.text).toContain('书房')
  })
  it('rejects unmet conditions without changing anything', () => {
    const changed = { ...source, storyVariables: source.storyVariables!.map((item) => item.id === 'stage' ? { ...item, value: '已发生' } : item) }
    const result = runStoryScript(changed, 'call', 2, 'queued')
    expect(result.error).toContain('尚未满足')
    expect(result.conversation).toBe(changed)
  })
  it('prevents rerunning once-only actions even when a saved timestamp is zero', () => {
    const state = runStoryScript(source, 'call', 0, 'queued').conversation
    const cleared = { ...state, temporaryPlot: undefined }
    expect(runStoryScript(cleared, 'call').error).toContain('已运行')
    const repeatable = { ...cleared, storyScripts: [{ ...script, runOnce: false }] }
    expect(runStoryScript(repeatable, 'call').error).toBeUndefined()
  })
  it('does not overwrite an existing direction or partially update variables', () => {
    const pending = { ...source, temporaryPlot: { id: 'earlier', text: '已有安排', mode: 'persistent' as const } }
    const result = runStoryScript(pending, 'call')
    expect(result.error).toContain('已有临时剧情')
    expect(result.conversation).toBe(pending)
    expect(result.conversation.storyVariables?.[0].value).toBe('客厅')
  })
  it('rejects removed recipients, empty recipients, duplicate and missing write targets', () => {
    for (const change of [
      { recipientIds: [] }, { recipientIds: ['removed'] },
      { writes: [{ variableId: 'removed', value: 'new' }] },
      { writes: [...script.writes, ...script.writes] },
    ]) {
      const state = { ...source, storyScripts: [{ ...script, ...change }] }
      expect(runStoryScript(state, 'call').conversation).toBe(state)
      expect(runStoryScript(state, 'call').error).toBeTruthy()
    }
    expect(runStoryScript(source, 'missing').error).toContain('已被删除')
  })
  it('cannot expand another actor’s secret or backstage-only value into a prompt', () => {
    for (const name of ['隐情', '来电进度', '不存在']) {
      const state = { ...source, storyScripts: [{ ...script, prompt: `你需要知道{{变量:${name}}}` }] }
      const result = runStoryScript(state, 'call')
      expect(result.error).toBeTruthy()
      expect(result.conversation).toBe(state)
    }
    const authorized = { ...source, storyScripts: [{ ...script, writes: [], recipientIds: ['b'], prompt: '{{变量:隐情}}' }] }
    expect(runStoryScript(authorized, 'call').conversation.temporaryPlot?.text).toBe('导演专属秘密')
  })
  it('allows variable-only actions without replacing pending backstage instructions', () => {
    const state = { ...source, temporaryPlot: { id: 'old', text: '既有安排' }, storyScripts: [{ ...script, prompt: '', recipientIds: [] }] }
    const result = runStoryScript(state, 'call')
    expect(result.error).toBeUndefined()
    expect(result.conversation.temporaryPlot).toBe(state.temporaryPlot)
  })
  it('preserves persistent script instructions until manually ended', () => {
    const state = runStoryScript({ ...source, storyScripts: [{ ...script, mode: 'persistent' }] }, 'call').conversation
    const captured = captureTemporaryPlot(state, true, 'a')
    expect(consumeTemporaryPlot(state, captured, 0)).toBe(state)
    const prompt = withFinalTemporaryPlotInstruction([], captured?.text, '沈衍', '惟惟', captured?.mode)
    expect(prompt[prompt.length - 1]?.content).toContain('已发生的来电、登场、发现或完成事件不得重复触发')
  })
  it('bounds both the configured and expanded prompt before any mutation', () => {
    const state = { ...source, storyScripts: [{ ...script, prompt: 'x'.repeat(6001) }] }
    expect(runStoryScript(state, 'call').conversation).toBe(state)
    const expanded = { ...source, storyVariables: source.storyVariables!.map((item) => item.id === 'place' ? { ...item, value: 'x'.repeat(1000) } : item), storyScripts: [{ ...script, writes: [], prompt: '{{变量:地点}}'.repeat(7) }] }
    expect(runStoryScript(expanded, 'call').error).toContain('超过 6000')
  })
  it('limits the accumulated variable context without partially writing script results', () => {
    const state = { ...source, storyVariables: [...source.storyVariables!, ...Array.from({ length: 7 }, (_, i) => ({ id: `v${i}`, name: `长变量${i}`, value: 'x'.repeat(1000) }))] }
    const result = runStoryScript(state, 'call')
    expect(result.error).toContain('变量总内容超过')
    expect(result.conversation).toBe(state)
    const prompt = buildStoryVariablesPrompt(state.storyVariables, 'a')
    expect(prompt).not.toContain('长变量6')
    expect(prompt).not.toContain('导演专属秘密')
  })
})

describe('story variable visibility and timeline', () => {
  it('provides actor-filtered facts without leaking variable names, values or script definitions', () => {
    const a = buildStoryVariablesPrompt(source.storyVariables, 'a')
    expect(a).toContain('客厅')
    expect(a).not.toContain('隐情')
    expect(a).not.toContain('来电进度')
    expect(a).not.toContain('配角来电')
    expect(buildStoryVariablesPrompt(source.storyVariables, 'b')).toContain('导演专属秘密')
    expect(buildStoryVariablesPrompt([], 'a')).toBe('')
  })
  it('deep-copies variables and run flags into snapshots and restores historical branches', () => {
    const ran = runStoryScript(source, 'call', 2, 'queued').conversation
    const { conversation: saved, snapshotId } = storeContextSnapshot(ran, captureConversationContext(ran, []), 'state')
    const later = { ...saved, messages: [{ ...source.messages[0], contextSnapshotId: snapshotId }, { id: 2, role: 'assistant' as const, text: '后来剧情' }], storyVariables: [{ id: 'future', name: '后来秘密', value: '未来' }], storyScriptRuns: { future: 3 } }
    const fork = forkConversationAtMessage(later, 1, captureConversationContext(later, []), 'branch', '分线').conversation
    expect(fork.storyVariables).toEqual(ran.storyVariables)
    expect(fork.storyScriptRuns).toEqual({ call: 2 })
    expect(fork.storyScripts).not.toBe(source.storyScripts)
    fork.storyVariables![0].value = '分线变化'
    expect(ran.storyVariables![0].value).toBe('书房')
    const restored = restoreConversationContext(later, [later.messages[0]], saved.contextSnapshots?.state)
    expect(restored.storyVariables).toEqual(ran.storyVariables)
    expect(restored.storyScriptRuns).toEqual({ call: 2 })
    expect(restoreConversationContext(later, [], undefined).storyVariables).toEqual([])
  })
  it('starts fresh conversations clean and clears all script state on restart', () => {
    const ran = runStoryScript(source, 'call', 2, 'queued').conversation
    const fresh = createFreshConversationFrom(ran, '开场')
    expect(fresh.storyVariables).toBeUndefined()
    expect(fresh.storyScripts).toBeUndefined()
    expect(fresh.storyScriptRuns).toBeUndefined()
    const restarted = restartConversationInPlace(ran, '开场')
    expect(restarted.storyVariables).toEqual([])
    expect(restarted.storyScriptRuns).toEqual({})
    expect(restarted.storyScripts).toBeUndefined()
    expect(ran.storyScriptRuns?.call).toBe(2)
  })
})
