import { describe, expect, it } from 'vitest'
import { acceptSensorBundle, DEFAULT_SENSE_SETTINGS, labelForEvent, mergeSensorEvents, permissionMessage, sensorEventPrompt } from './senseInteraction'

describe('sense interaction', () => {
  it('defaults all sensing switches off', () => expect(DEFAULT_SENSE_SETTINGS).toEqual({ enabled: false, blow: false, shake: false, rotation: false, longPress: false }))
  it('merges events inside three seconds and formats a hidden prompt', () => {
    const bundle = mergeSensorEvents([{ event: 'device_shaken', timestamp: 1000 }, { event: 'device_rotated', direction: 'left', timestamp: 3200 }], 4000)!
    expect(bundle.events).toHaveLength(2)
    expect(sensorEventPrompt(bundle)).toContain('<sensor_event>')
    expect(labelForEvent(bundle.events[0])).toBe('（你晃了晃手机）')
  })
  it('blocks reactions while replying and for twenty seconds', () => {
    const state = { lastReactionAt: 0, replyBusy: false }
    const bundle = { events: [{ event: 'user_blowing' }], at: 1000 }
    expect(acceptSensorBundle(bundle, state, 1000)).toBe(true)
    expect(acceptSensorBundle(bundle, state, 5000)).toBe(false)
    state.replyBusy = true
    expect(acceptSensorBundle(bundle, state, 25000)).toBe(false)
  })
  it('turns permission rejection into plain language', () => expect(permissionMessage(new Error('permission denied'))).toContain('请在 iPhone 设置里允许'))
})
