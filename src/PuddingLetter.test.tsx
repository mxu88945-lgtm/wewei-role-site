import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PuddingCapsule, PuddingLetter } from './PuddingLetter'

describe('v218 布丁来信 markup', () => {
  it('keeps the real name and avatar in the capsule, with the dog, and no kaomoji', () => {
    const html = renderToStaticMarkup(<PuddingCapsule name="傅承砚" avatar="data:image/png;base64,AA" user={false} />)
    expect(html).toContain('傅承砚')
    expect(html).toContain('src="data:image/png;base64,AA"')
    expect(html).toContain('pudding-dog.svg')
    expect(html).toContain('for-you')
    expect(html).not.toMatch(/USER|CHAR|ﻌ|ᴥ/)
  })
  it('puts the footer after the body and the actions last', () => {
    const html = renderToStaticMarkup(<PuddingLetter user actions={<div className="message-action-row" />}><p>正文</p></PuddingLetter>)
    expect(html).toContain('FROM ME')
    expect(html).toContain('pudding-bone.svg')
    expect(html.indexOf('archive-body')).toBeLessThan(html.indexOf('pudding-letter-foot'))
    expect(html.indexOf('pudding-letter-foot')).toBeLessThan(html.indexOf('message-action-row'))
  })
})
