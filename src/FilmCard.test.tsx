import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import FilmCard from './FilmCard'
import { parseFilmBody } from './filmBlock'

describe('FilmCard', () => {
  it('renders gramophone, film frame, caption, npc files and the unsaid line', () => {
    const card = parseFilmBody('歌：晴天 - 周杰伦\n幕：雨夜长街｜路灯下\n题：Only for two.｜只下给两个人\n人：沈确｜管家｜中立｜高｜跟了他十年\n人：林晚｜旧人｜敌对｜低\n心声：别走太快')!
    const html = renderToStaticMarkup(<FilmCard card={card} speakerName="顾祁砚" seed="x" />)
    expect(html).toContain('GRAMOPHONE')
    expect(html).toContain('晴天')
    expect(html).toContain('film-frame-empty')
    expect(html).toContain('ARCHIVE · No.')
    expect(html).toContain('只下给两个人')
    expect(html).toContain('NPC 02')
    expect(html).toContain('STANCE')
    expect(html).toContain('film-danger-3')
    expect(html).toContain('别走太快')
  })

  it('renders a partial card without npc or heart sections', () => {
    const card = parseFilmBody('幕：天台')!
    const html = renderToStaticMarkup(<FilmCard card={card} avatar="data:image/png;base64,AA" speakerName="他" seed="y" />)
    expect(html).toContain('天台')
    expect(html).toContain('<img')
    expect(html).not.toContain('film-npc')
    expect(html).not.toContain('film-heart')
  })
})

describe('FilmCard gallery entry (v200)', () => {
  it('shows the 换图 button when the card knows its character and keeps the avatar when no images exist', () => {
    const card = parseFilmBody('幕：天台')!
    const html = renderToStaticMarkup(<FilmCard card={card} avatar="data:image/png;base64,AA" characterId="c1" speakerName="他" seed="z" />)
    expect(html).toContain('🎞 换图')
    expect(html).toContain('film-frame-bg')
    expect(html).not.toContain('film-dots')
  })
})
