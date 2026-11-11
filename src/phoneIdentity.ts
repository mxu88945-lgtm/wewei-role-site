// 小手机自己的用户身份（v208）。小手机群聊、私聊、论坛、商店等戏外场景用它，
// 不再跟着当前正在跑的剧情所选的身份走。
// 解析顺序：小手机身份（填了名字才算设置）→ 全局基础身份（身份库里的「persona-default」，
// 否则第一个）→ 内置默认。剧情对话自己的身份绑定不受影响。

import { DEFAULT_IDENTITY, type ScopeIdentity } from './chatScope'

export type PhoneIdentity = { name: string; description: string; avatar?: string }

export const PHONE_IDENTITY_KEY = 'weijing.phoneIdentity'
export const PHONE_IDENTITY_ID = 'phone-identity'
export const EMPTY_PHONE_IDENTITY: PhoneIdentity = { name: '', description: '' }

export function normalizePhoneIdentity(value: unknown): PhoneIdentity {
  if (!value || typeof value !== 'object') return EMPTY_PHONE_IDENTITY
  const raw = value as Record<string, unknown>
  const name = typeof raw.name === 'string' ? raw.name.slice(0, 40) : ''
  const description = typeof raw.description === 'string' ? raw.description.slice(0, 2000) : ''
  const avatar = typeof raw.avatar === 'string' && raw.avatar ? raw.avatar : undefined
  return avatar ? { name, description, avatar } : { name, description }
}

export function readPhoneIdentity(storage: Pick<Storage, 'getItem'> = localStorage): PhoneIdentity {
  try { return normalizePhoneIdentity(JSON.parse(storage.getItem(PHONE_IDENTITY_KEY) || 'null')) } catch { return EMPTY_PHONE_IDENTITY }
}

export function writePhoneIdentity(value: PhoneIdentity, storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage): boolean {
  try {
    const next = normalizePhoneIdentity(value)
    if (!next.name && !next.description && !next.avatar) storage.removeItem(PHONE_IDENTITY_KEY)
    else storage.setItem(PHONE_IDENTITY_KEY, JSON.stringify(next))
    return true
  } catch { return false }
}

export const isPhoneIdentitySet = (value: PhoneIdentity | undefined) => Boolean(value?.name.trim())

/** 全局基础身份：身份库里的 persona-default，否则第一个，否则内置默认。不看当前剧情选了谁。 */
export function baseIdentity<T extends ScopeIdentity>(identities: readonly T[]): T | ScopeIdentity {
  return identities.find((item) => item.id === 'persona-default') || identities[0] || DEFAULT_IDENTITY
}

/** 小手机里「我」是谁。填了名字就用小手机身份（没填的头像/简介借基础身份），否则用全局基础身份。 */
export function resolvePhoneIdentity<T extends ScopeIdentity>(phone: PhoneIdentity | undefined, identities: readonly T[]): ScopeIdentity {
  const base = baseIdentity(identities)
  if (!phone || !isPhoneIdentitySet(phone)) return base
  return {
    id: PHONE_IDENTITY_ID,
    name: phone.name.trim(),
    description: phone.description.trim() || base.description,
    ...(phone.avatar || base.avatar ? { avatar: phone.avatar || base.avatar } : {}),
  }
}
