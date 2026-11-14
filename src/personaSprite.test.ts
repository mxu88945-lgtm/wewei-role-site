import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addSpriteHearts, classifySpriteMood, makeSpriteHearts, SPRITE_DOUBLE_TAP_MS, SPRITE_HEART_CAP, SPRITE_LOVE_MS, normalizeSpriteState, SPRITE_MOODS, SPRITE_SETS, spriteAppearOf, spriteEnabled, spriteFile, spriteMoodScores, spritePosOf, spriteReplyTail, spriteSetFor, spriteSnapPos } from './personaSprite'

const file = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('v239 立绘表情打分', () => {
  it('maps each mood from typical replies', () => {
    expect(classifySpriteMood('早安，宝贝。今天也要开心。')).toBe('happy')
    expect(classifySpriteMood('*耳根有点红，别开脸* 被你夸得不好意思了。')).toBe('shy')
    expect(classifySpriteMood('爱你。过来，抱一下。')).toBe('love')
    expect(classifySpriteMood('（挑眉，似笑非笑）逗你的，乖乖。')).toBe('smug')
    expect(classifySpriteMood('不许熬夜。闭嘴，去睡。')).toBe('angry')
    expect(classifySpriteMood('我很委屈，也舍不得你。')).toBe('sad')
    expect(classifySpriteMood('*眼泪掉下来* 呜……')).toBe('cry')
    expect(classifySpriteMood('你居然真的？！')).toBe('surprised')
    expect(classifySpriteMood('嗯。知道了。')).toBe('cold')
  })

  it('takes the longest word at each position', () => {
    expect(classifySpriteMood('他冷笑一声。')).toBe('smug')
    expect(spriteMoodScores('冷笑').happy).toBe(0)
    expect(spriteMoodScores('心疼你').sad).toBeGreaterThan(0)
    expect(classifySpriteMood('哭了')).toBe('cry')
  })

  it('ignores 抱歉/小心/放心/怎么/为什么', () => {
    expect(classifySpriteMood('抱歉。小心点，放心吧。怎么了？为什么？')).toBe('cold')
    expect(spriteMoodScores('抱歉').love).toBe(0)
  })

  it('counts action text double and later sentences more', () => {
    // 台词开心，动作生气 → 动作赢
    expect(classifySpriteMood('开心。*皱眉*')).toBe('angry')
    // 同样分量，后一句权重 ×1.5
    expect(classifySpriteMood('我生气了。我很开心。')).toBe('happy')
    expect(classifySpriteMood('我很开心。我生气了。')).toBe('angry')
  })

  it('stays cold on weak signal and keeps previous on ties', () => {
    expect(classifySpriteMood('啊')).toBe('cold')
    expect(classifySpriteMood('')).toBe('cold')
    expect(classifySpriteMood('爱心 心动', 'shy')).toBe('love')
    // 同一句里两个 1.5 分：平分保留上一张
    expect(classifySpriteMood('脸红 委屈', 'sad')).toBe('sad')
    expect(classifySpriteMood('脸红 委屈', 'happy')).toBe('cold')
  })

  it('ignores status markers and html', () => {
    expect(classifySpriteMood('【状态：生气 哭 爱你】嗯。')).toBe('cold')
    expect(classifySpriteMood('<div class="爱你">嗯</div>')).toBe('cold')
  })
})

describe('v239 立绘工具', () => {
  it('reads only his trailing turn, skipping guests', () => {
    const list = [
      { role: 'assistant', text: '生气' },
      { role: 'user', text: '爱你' },
      { role: 'assistant', text: '早安' },
      { role: 'assistant', text: '哭', speakerId: 'guest:1' },
      { role: 'assistant', text: '开心' },
    ]
    expect(spriteReplyTail(list, (m) => m.text, (m) => Boolean(m.speakerId))).toBe('早安\n开心')
  })

  it('snaps to nearest edge and clamps height', () => {
    const box = { mainW: 390, mainH: 844, headerB: 60, baseBottom: 120, w: 80, h: 132 }
    expect(spriteSnapPos({ x: 20, y: 50 }, box)).toEqual({ side: 'left', y: 50 })
    expect(spriteSnapPos({ x: 300, y: -40 }, box)).toEqual({ side: 'right', y: 0 })
    expect(spriteSnapPos({ x: 300, y: 9999 }, box)).toEqual({ side: 'right', y: 844 - 120 - 60 - 132 })
  })

  it('registry: 谢聿衡 on by default, others have no sprite', () => {
    const xie = spriteSetFor('谢聿衡')
    expect(xie?.id).toBe('xieyuheng')
    expect(spriteSetFor('谢聿衡（总裁）')?.id).toBe('xieyuheng')
    expect(spriteSetFor('顾祁砚')).toBeNull()
    expect(spriteEnabled(xie, undefined)).toBe(true)
    expect(spriteEnabled(xie, { on: false })).toBe(false)
    expect(spriteEnabled(null, { on: true })).toBe(false)
    expect(spriteAppearOf(undefined)).toBe('mood')
    expect(spritePosOf(undefined)).toEqual({ side: 'right', y: 0 })
  })

  it('every registered sprite file exists and is precached', () => {
    const sw = file('../public/sw.js')
    for (const set of SPRITE_SETS) {
      const files = readdirSync(new URL(`../public/${set.folder}`, import.meta.url))
      for (const mood of SPRITE_MOODS) expect(files).toContain(spriteFile(set, mood).slice(set.folder.length))
    }
    for (const mood of SPRITE_MOODS) expect(sw).toContain(`'${mood}'`)
    expect(sw).toContain('sprites/xieyuheng/xie_${mood}.webp')
  })

  it('normalizes stored prefs', () => {
    expect(normalizeSpriteState(null)).toEqual({})
    expect(normalizeSpriteState({ a: { on: false, appear: 'always', pos: { side: 'left', y: 12.6 }, hidden: true, junk: 1 }, b: 'x' })).toEqual({ a: { on: false, appear: 'always', pos: { side: 'left', y: 13 }, hidden: true } })
  })

  it('stays out of the way: no backdrop-filter, pointer-events only on his body/tab, below composer', () => {
    const css = file('./persona-window.css')
    const block = css.slice(css.indexOf('/* v239 人格窗口 Q 版立绘'))
    expect(block.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/backdrop-filter/)
    expect(block).toMatch(/\.persona-sprite-stage \{[^}]*z-index: 30;[^}]*pointer-events: none;/)
    expect(block).toMatch(/\.persona-sprite-hit \{[^}]*pointer-events: auto;/)
    expect(block).toMatch(/html\[data-kb\] \.persona-sprite-stage \{ opacity: 0; \}/)
    expect(block).toMatch(/prefers-reduced-motion/)
    expect(file('./personaSprite.ts')).toContain("PERSONA_SPRITE_KEY = 'weijing.personaSprite'")
  })

  it('v240 hearts: 3–5 per tap around his head, capped, double tap hides', () => {
    for (const r of [0, 0.5, 0.999]) {
      const burst = makeSpriteHearts(() => r)
      expect(burst.length).toBeGreaterThanOrEqual(3)
      expect(burst.length).toBeLessThanOrEqual(5)
      for (const heart of burst) { expect(heart.x).toBeGreaterThanOrEqual(30); expect(heart.x).toBeLessThanOrEqual(70); expect(Math.abs(heart.dx)).toBeLessThanOrEqual(14) }
    }
    const ids = makeSpriteHearts().concat(makeSpriteHearts()).map((heart) => heart.id)
    expect(new Set(ids).size).toBe(ids.length)
    let alive = addSpriteHearts([], makeSpriteHearts())
    for (let i = 0; i < 6; i++) alive = addSpriteHearts(alive, makeSpriteHearts(() => 0.9))
    expect(alive.length).toBe(SPRITE_HEART_CAP)
    expect(SPRITE_DOUBLE_TAP_MS).toBe(300)
    expect(SPRITE_LOVE_MS).toBe(2000)
    const css = file('./persona-window.css')
    const block = css.slice(css.indexOf('/* v240 点他冒爱心'))
    expect(block).toMatch(/\.persona-sprite-hearts \{[^}]*pointer-events: none;/)
    expect(block).toMatch(/prefers-reduced-motion[\s\S]*persona-heart-fade/)
    const tsx = file('./PersonaSprite.tsx')
    expect(tsx).toContain('SPRITE_DOUBLE_TAP_MS')
    expect(tsx).toContain('if (d.moving) lastTapRef.current = 0')
    expect(file('./PersonaSettingsHome.tsx')).toContain('点他冒爱心，双击隐身')
  })
})
