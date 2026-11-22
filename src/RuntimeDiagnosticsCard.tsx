import { useMemo, useState } from 'react'
import { buildRuntimeDiagnostic, type RuntimeDiagnosticInput } from './runtimeDiagnostics'

type Props = RuntimeDiagnosticInput

export default function RuntimeDiagnosticsCard(props: Props) {
  const [copied, setCopied] = useState(false)
  const summary = useMemo(() => buildRuntimeDiagnostic(props), [props])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary)
    } catch {
      const area = document.createElement('textarea')
      area.value = summary
      area.setAttribute('readonly', 'true')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.append(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }
  return <section className="runtime-diagnostics-card" aria-label="运行状态诊断">
    <div className="runtime-diagnostics-heading"><div><strong>运行状态诊断</strong><small>只读 · 不包含 API Key、聊天正文或长期记忆正文</small></div><button className="soft-button" onClick={() => void copy()}>{copied ? '已复制' : '复制诊断摘要'}</button></div>
    <pre>{summary}</pre>
  </section>
}
