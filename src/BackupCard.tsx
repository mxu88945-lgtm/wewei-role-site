import { useRef, useState } from 'react'
import { collectBackupData, parseBackupText, redactBackupData, restoreBackupData, type BackupFile } from './backupStore'

export default function BackupCard({ liveData = {}, disabled = false }: { liveData?: Record<string, unknown>; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [includeKeys, setIncludeKeys] = useState(false)
  const exportBackup = async () => {
    setBusy(true)
    try {
      const backup: BackupFile = { format: 'weijing-backup', version: 1, createdAt: new Date().toISOString(), data: includeKeys ? await collectBackupData(liveData) : redactBackupData(await collectBackupData(liveData)) }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `weijing-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage(`完整备份已生成：${Object.keys(backup.data).length} 项数据，含角色、剧情与记忆${includeKeys ? '，含 API Key' : '，不含 API Key'}。`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '备份失败，请重试') }
    finally { setBusy(false) }
  }
  const restoreBackup = async (file?: File) => {
    if (!file || disabled) return
    setBusy(true)
    try {
      const backup = parseBackupText(await file.text())
      if (!window.confirm(`恢复 ${Object.keys(backup.data).length} 项数据？当前角色、会话、记忆和设置会被备份内容覆盖。`)) return
      await restoreBackupData(backup)
      window.location.reload()
    } catch (error) { setMessage(error instanceof Error ? error.message : '恢复失败') }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }
  return <section className="backup-card">
    <input ref={inputRef} type="file" accept="application/json,.json" disabled={busy || disabled} onChange={(event) => void restoreBackup(event.target.files?.[0])} />
    <div><strong>完整备份与恢复</strong><small>包含角色、会话、记忆、书签、剧情收藏和设置</small></div>
    <label className="backup-include-keys"><input type="checkbox" checked={includeKeys} disabled={busy || disabled} onChange={(event) => setIncludeKeys(event.target.checked)} /> 备份里包含 API Key（仅自己留存时勾选）</label>
    <p>{includeKeys ? '备份文件内含 API Key，请勿发给别人。' : '默认不含 API Key，恢复时会保留本机已填的 Key。'}</p>
    <div className="backup-actions"><button disabled={busy || disabled} onClick={() => void exportBackup()}>{busy ? '正在处理…' : '导出完整备份'}</button><button disabled={busy || disabled} onClick={() => inputRef.current?.click()}>从备份恢复</button></div>
    {disabled && <small>请等待生成或总结完成后再备份与恢复。</small>}
    {message && <small role="status" className="backup-message">{message}</small>}
  </section>
}
