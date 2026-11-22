import { describe, expect, it } from 'vitest'
import { buildRuntimeDiagnostic } from './runtimeDiagnostics'

describe('runtime diagnostics', () => {
  it('includes runtime state but never secrets or chat content', () => {
    const summary = buildRuntimeDiagnostic({
      appVersion: 'v157', serviceWorkerVersion: 'weijing-shell-v157', scope: '主聊天',
      theme: '惟境紫雾', wallpaper: '未启用', roleId: 'role-1', conversationId: 'chat-1',
      apiName: '中转站', modelName: 'model-x', dataUpdatedAt: 0,
    })
    expect(summary).toContain('当前作用域：主聊天')
    expect(summary).toContain('模型：model-x')
    expect(summary).not.toContain('sk-secret')
    expect(summary).not.toContain('这是一段聊天正文示例')
    expect(summary).toContain('未包含 API Key')
  })
})
