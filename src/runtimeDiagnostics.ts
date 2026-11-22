export type RuntimeDiagnosticInput = {
  appVersion: string
  serviceWorkerVersion: string
  scope: string
  theme: string
  wallpaper: string
  roleId?: string
  personaId?: string
  projectId?: string
  conversationId?: string
  apiName?: string
  modelName?: string
  todayPlotImageCount?: number
  dataUpdatedAt?: number
}

export const APP_VERSION = 'v310'
export const SERVICE_WORKER_VERSION = 'weijing-shell-v310'

const safe = (value: string | undefined) => value?.trim() || '未设置'
const time = (value?: number) => value ? new Date(value).toLocaleString() : '未知'

export function buildRuntimeDiagnostic(input: RuntimeDiagnosticInput) {
  return [
    '惟镜运行状态诊断',
    `应用版本：${safe(input.appVersion)}`,
    `Service Worker：${safe(input.serviceWorkerVersion)}`,
    `当前作用域：${safe(input.scope)}`,
    `主题：${safe(input.theme)}`,
    `壁纸：${safe(input.wallpaper)}`,
    `角色标识：${safe(input.roleId)}`,
    `人格标识：${safe(input.personaId)}`,
    `项目标识：${safe(input.projectId)}`,
    `会话标识：${safe(input.conversationId)}`,
    `接口：${safe(input.apiName)}`,
    `模型：${safe(input.modelName)}`,
    `今日幕后配图：${Math.max(0, input.todayPlotImageCount || 0)} 张`,
    `本地数据更新时间：${time(input.dataUpdatedAt)}`,
    '隐私：未包含 API Key、聊天正文或长期记忆正文。',
  ].join('\n')
}
