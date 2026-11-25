import { describe, expect, it } from 'vitest'
import { shortFailReason } from './phoneFailReason'

describe('shortFailReason', () => {
  it('turns a relay 503 JSON dump into a short line', () => {
    expect(shortFailReason('Protocol generation failed: protocol upstream 503: {"error":{"code":503,"details":[]}} (HTTP 451)')).toBe('模型那边忙（503），过会儿再试')
  })
  it('keeps short unknown errors', () => {
    expect(shortFailReason('出错了')).toBe('出错了')
  })
})
