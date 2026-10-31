import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ArchiveHeading from './ArchiveHeading'

describe('archive message identity headers', () => {
  it('renders the mobile card with the real identity and no fictional QQ account', () => {
    const html = renderToStaticMarkup(<ArchiveHeading theme="mobile" name="用户名字" user />)
    expect(html).toContain('用户名字')
    expect(html).toContain('我的消息')
    expect(html).toContain('mobile-status')
    expect(html).not.toContain('3759908261')
    expect(html).not.toContain('archive-grade')
  })
  it('escapes identity text and uses the actual avatar without exposing an executable name', () => {
    const html = renderToStaticMarkup(<ArchiveHeading theme="academy" name={'<script>name</script>'} avatar="data:image/png;base64,eA==" user />)
    expect(html).toContain('&lt;script&gt;name&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('data:image/png;base64,eA==')
    expect(html).toContain('A+')
  })
  it('marks the record artwork decorative without adding nonfunctional playback buttons', () => {
    const html = renderToStaticMarkup(<ArchiveHeading theme="vinyl" name="角色名" user={false} />)
    expect(html).toContain('archive-disc')
    expect(html).toContain('角色名')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('archive-grade')
  })
})
