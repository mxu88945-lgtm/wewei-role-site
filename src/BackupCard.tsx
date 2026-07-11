import { useMemo, useRef, useState } from 'react'

type BackupFile = {
  format: 'weijing-backup'
  version: 1
  createdAt: string
  data: Record<string, string>
}

function collectData() {
  const data: Record<string, string> = {}
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith('weijing.')) continue
    const value = localStorage.getItem(key)
    if (value !== null) data[key] = value
  }
  return data
}

export default function BackupCard() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const storageSize = useMemo(() => Object.entries(collectData()).reduce((total, [key, value]) => total + key.length + value.length, 0), [])

  const exportBackup = () => {
    const backup: BackupFile = { format: 'weijing-backup', version: 1, createdAt: new Date().toISOString(), data: collectData() }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `weijing-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage('备份已生成，请妥善保管。')
  }

  const restoreBackup = async (file?: File) => {
    if (!file) return
    try {
      const backup = JSON.parse(await file.text()) as Partial<BackupFile>
      if (backup.format !== 'weijing-backup' || backup.version !== 1 || !backup.data || typeof backup.data !== 'object') throw new Error('不是有效的惟境备份文件')
      const entries = Object.entries(backup.data).filter(([key, value]) => key.startsWith('weijing.') && typeof value === 'string')
      if (!entries.length) throw new Error('备份文件中没有惟境数据')
      if (!window.confirm(`恢复 ${entries.length} 项本地数据？当前角色、会话和设置会被备份内容覆盖。`)) return
      const previous = collectData()
      try {
        Object.keys(previous).forEach((key) => localStorage.removeItem(key))
        entries.forEach(([key, value]) => localStorage.setItem(key, value))
      } catch (error) {
        Object.keys(collectData()).forEach((key) => localStorage.removeItem(key))
        Object.entries(previous).forEach(([key, value]) => localStorage.setItem(key, value))
        throw error
      }
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '恢复失败')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return <section className="backup-card">
    <input ref={inputRef} type="file" accept="application/json,.json" onChange={(event) => restoreBackup(event.target.files?.[0])} />
    <div><strong>备份与恢复</strong><small>当前惟境数据约 {(storageSize / 1024 / 1024).toFixed(2)} MB</small></div>
    <p>备份包含角色、会话、记忆、设置和 API 渠道。文件内含 API Key，请勿转发给他人。</p>
    <div className="backup-actions"><button onClick={exportBackup}>导出完整备份</button><button onClick={() => inputRef.current?.click()}>从备份恢复</button></div>
    {message && <small className="backup-message">{message}</small>}
  </section>
}
