import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addAlbumPhotos, agencyPrompt, albumTurnLine, applyLockPhotoTags, normalizeAlbum, parseAlbumCode, parseAlbumTags, parseLockPhotoTags } from './personaAgency'
import { personaReplyText } from './personaWindowPresentation'

const img = (id: string) => ({ id, dataUrl: 'data:image/jpeg;base64,AAA', width: 10, height: 10 })
const page = readFileSync(new URL('./PersonaWindowPage.tsx', import.meta.url), 'utf8')

describe('v267 persona home + private-room album', () => {
  it('opens on the home page and can get back to it from the sidebar', () => {
    expect(page).toContain('const [homeOpen, setHomeOpen] = useState(true)')
    expect(page).toContain('<PersonaHome ')
    expect(page).toContain('setHomeOpen(true)')
  })
  it('no longer shows the recall receipt in chat', () => {
    expect(page).not.toContain('<PersonaRecallReceipt')
  })
  it('parses album tags with optional lock, codes and lock moves', () => {
    expect(parseAlbumTags('好看 [存相册:那天的海]')).toEqual([{ caption: '那天的海', locked: false }])
    expect(parseAlbumTags('[存相册:只给我看|锁]')).toEqual([{ caption: '只给我看', locked: true }])
    expect(parseAlbumTags('[存相册]')).toEqual([{ caption: '', locked: false }])
    expect(parseAlbumCode('[相册密码:0520]')).toBe('0520')
    expect(parseAlbumCode('[相册密码:12]')).toBeNull()
    expect(parseLockPhotoTags('[锁照片:海] [解锁照片:猫]')).toEqual([{ lock: true, key: '海' }, { lock: false, key: '猫' }])
  })
  it('adds photos once, locks his hidden ones, and moves existing ones', () => {
    let album = addAlbumPhotos([], [img('a'), img('b')], ['海', '猫'], 'char', 1, true)
    expect(album.map((p) => [p.caption, p.locked])).toEqual([['海', true], ['猫', true]])
    album = addAlbumPhotos(album, [img('a')], ['again'], 'char', 2)
    expect(album).toHaveLength(2)
    album = applyLockPhotoTags(album, [{ lock: false, key: '猫' }])
    expect(album.find((p) => p.caption === '猫')?.locked).toBeUndefined()
    expect(normalizeAlbum(album)).toHaveLength(2)
    expect(normalizeAlbum([{ dataUrl: 'javascript:x' }])).toHaveLength(0)
  })
  it('tells him about her new photos and his own code only when there are locked photos', () => {
    const mine = addAlbumPhotos([], [img('c')], ['我们'], 'user', 1)
    expect(albumTurnLine(mine)).toContain('「我们」')
    expect(albumTurnLine(mine.map((p) => ({ ...p, seen: true })))).toBe('')
    const locked = addAlbumPhotos([], [img('d')], ['秘密'], 'char', 1, true)
    expect(albumTurnLine(locked, '0520')).toContain('「0520」')
    expect(albumTurnLine(locked)).toContain('还没设密码')
    expect(agencyPrompt({ room: true })).toContain('[相册密码:')
    expect(agencyPrompt({ room: false })).toBe('')
  })
  it('hides every album tag from the chat text', () => {
    expect(personaReplyText('好呀[存相册:海|锁][相册密码:0520][锁照片:海]')).toBe('好呀')
  })
})
