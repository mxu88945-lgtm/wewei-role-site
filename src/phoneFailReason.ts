/** v337：小手机群里「没连上」只说人话，不贴整段接口 JSON。 */
export function shortFailReason(message: string): string {
  const text = String(message || '')
  const codes = [...text.matchAll(/(?:upstream|HTTP|status|"code"\s*:)\s*(\d{3})/gi)].map((match) => Number(match[1]))
  const code = codes.find((value) => value >= 500) || codes.find((value) => value === 429) || codes[0]
  if (/timeout|超时|timed out/i.test(text)) return '等太久超时了'
  if (code === 429 || /rate.?limit|quota|exhausted/i.test(text)) return '模型限流了，过会儿再试'
  if (code && code >= 500) return `模型那边忙（${code}），过会儿再试`
  if (code === 401 || code === 403) return `密钥或权限不对（${code}）`
  if (code) return `接口返回 ${code}`
  if (/network|fetch|load failed|网络/i.test(text)) return '网络断了一下'
  return text.length > 40 ? `${text.slice(0, 40)}…` : text || '请求失败'
}
