import { describe, expect, it, vi } from 'vitest'
import { activeThread } from './personaWindow'
import { planPersonaRequest } from './personaWindowRuntime'
import { estimateTokens } from './promptBudget'
import { FIXTURE_NOW, fixtureDeps, fixtureHistory, fixturePersona } from './personaPromptFixture'

const plan = (latest?: string) => {
  const persona = fixturePersona()
  const history = fixtureHistory(latest)
  const thread = { ...activeThread(persona), messages: history }
  return planPersonaRequest(persona, history, fixtureDeps(), thread)
}

describe('人格窗口每轮请求的体积 (v236)', () => {
  it('measure', () => {
    vi.useFakeTimers(); vi.setSystemTime(FIXTURE_NOW)
    for (const latest of ['今天好累，晚上随便吃了碗面，现在窝在沙发上不想动。', '你还记得书院群里林栖起哄让你唱歌那次吗？']) {
      const result = plan(latest)
      if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.MEASURE) {
        console.log(`\n=== ${latest}`)
        for (const part of result.parts) console.log(`${part.where}\t${part.key}\t${part.label}\t${part.chars}\t≈${estimateTokens(part.chars)}`)
        for (const lane of result.memory.audit.lanes) console.log(`  lane ${lane.key} ${lane.chars}`)
        const total = result.messages.reduce((sum, m) => sum + JSON.stringify(m.content).length, 0)
        const tokens = result.messages.reduce((sum, m) => sum + estimateTokens(typeof m.content === 'string' ? m.content : m.content.map((p) => p.type === 'text' ? p.text : '').join('')), 0)
        console.log(`TOTAL chars ${total} tokens≈${tokens}`)
      }
      expect(result.parts.length).toBeGreaterThan(5)
    }
    // v236 量化基准（典型场景）：v235 闲聊一轮约 24,000 字，v236 约 16,000 字；不让它悄悄长回去。
    const casual = plan('今天好累，晚上随便吃了碗面，现在窝在沙发上不想动。')
    const chars = casual.messages.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : m.content.reduce((acc, p) => acc + (p.type === 'text' ? p.text.length : 0), 0)), 0)
    expect(chars).toBeLessThan(17000)
    expect(casual.parts.filter((part) => part.where === 'turn').reduce((sum, part) => sum + part.chars, 0)).toBeLessThan(800)
    const asked = plan('你还记得书院群里林栖起哄让你唱歌那次吗？')
    expect(asked.parts.find((part) => part.key === 'memory-turn')?.chars || 0).toBeGreaterThan(1000)
    vi.useRealTimers()
  })
})
