/**
 * v200 剧情美化卡·胶片轮播：
 * - FilmFrame：胶片框。有自己上传的图就每 4 秒淡入换下一张（只有屏幕上的卡走表），点一下立刻换；
 *   右下角小圆点标当前第几张；没上传图时保持 v199 的完整头像 + 模糊底图。
 *   长按约 500ms 或点左上角「🎞 换图」打开管理面板。
 * - FilmGalleryManager：全局只挂一个的管理面板（缩略图、添加、删除、左右移动）。
 * 不用 backdrop-filter；文件选择不设 accept（iOS 会把文件置灰）。
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  MAX_FILM_IMAGES, addFilmImages, clampFilmIndex, compressFilmImage, ensureFilmGallery, filmImageId, moveFilmImage,
  nextFilmIndex, removeFilmImage, useFilmGallery, useFilmGalleryStore, watchFilmFrame, type FilmImage,
} from './filmGallery'

const LONG_PRESS_MS = 500
const cssUrl = (src: string) => `url("${src.replace(/"/g, '%22')}")`

function Slide({ src, fade }: { src: string; fade?: boolean }) {
  return <div className={`film-slide${fade ? ' film-slide-in' : ''}`} aria-hidden="true">
    <i className="film-frame-bg" style={{ backgroundImage: cssUrl(src) }} />
    <img src={src} alt="" decoding="async" draggable={false} />
  </div>
}

export function FilmFrame({ characterId, characterName, avatar, sceneTitle }: { characterId?: string; characterName: string; avatar?: string; sceneTitle?: string }) {
  const images = useFilmGallery(characterId)
  const [view, setView] = useState({ index: 0, prev: -1 })
  const frameRef = useRef<HTMLDivElement>(null)
  const lastChangeRef = useRef(0)
  const pressRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; x: number; y: number; fired: boolean }>({ timer: null, x: 0, y: 0, fired: false })
  const count = images.length
  const index = clampFilmIndex(view.index, count)

  useEffect(() => { if (characterId) ensureFilmGallery(characterId) }, [characterId])

  const advance = () => {
    lastChangeRef.current = Date.now()
    setView((state) => {
      const cur = clampFilmIndex(state.index, count)
      return { prev: cur, index: nextFilmIndex(cur, count) }
    })
  }
  const advanceRef = useRef(advance)
  advanceRef.current = advance

  // 只有 2 张以上才需要走表；共享的 IntersectionObserver + 单个计时器，屏幕外的卡不动。
  useEffect(() => {
    const el = frameRef.current
    if (!el || count < 2) return
    return watchFilmFrame(el, () => {
      if (Date.now() - lastChangeRef.current < 2500) return // 刚点过就等下一拍
      advanceRef.current()
    })
  }, [count])

  const openManager = () => { if (characterId) useFilmGalleryStore.getState().openManager(characterId, characterName) }
  const clearPress = () => { if (pressRef.current.timer) clearTimeout(pressRef.current.timer); pressRef.current.timer = null }
  const onPointerDown = (event: ReactPointerEvent) => {
    if (!characterId) return
    clearPress()
    pressRef.current = { x: event.clientX, y: event.clientY, fired: false, timer: setTimeout(() => { pressRef.current.fired = true; pressRef.current.timer = null; openManager() }, LONG_PRESS_MS) }
  }
  const onPointerMove = (event: ReactPointerEvent) => {
    if (pressRef.current.timer && Math.hypot(event.clientX - pressRef.current.x, event.clientY - pressRef.current.y) > 10) clearPress()
  }
  useEffect(() => clearPress, [])
  const onClick = () => {
    if (pressRef.current.fired) { pressRef.current.fired = false; return }
    if (count > 1) advance()
  }

  const current: FilmImage | undefined = images[index]
  const prev = view.prev >= 0 && view.prev !== index ? images[view.prev] : undefined
  const empty = !current && !avatar

  return <div
    ref={frameRef}
    className={`film-frame${empty ? ' film-frame-empty' : ''}${characterId ? ' film-frame-editable' : ''}`}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={clearPress}
    onPointerCancel={clearPress}
    onPointerLeave={clearPress}
    onContextMenu={(event) => { if (characterId) event.preventDefault() }}
    onClick={onClick}
  >
    {current
      ? <>{prev && <Slide key={`p-${prev.id}`} src={prev.src} />}<Slide key={`c-${current.id}`} src={current.src} fade={Boolean(prev)} /></>
      : avatar ? <><i className="film-frame-bg" style={{ backgroundImage: cssUrl(avatar) }} aria-hidden="true" /><img src={avatar} alt="" loading="lazy" decoding="async" draggable={false} /></> : <span>SCENE</span>}
    {sceneTitle && <span className="film-frame-title">{sceneTitle}</span>}
    {characterId && <button type="button" className="film-frame-edit" aria-label="换胶片图" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); openManager() }}>🎞 换图</button>}
    {count > 1 && <span className="film-dots" aria-label={`第 ${index + 1} / ${count} 张`}>
      {images.map((image, i) => <i key={image.id} className={i === index ? 'on' : ''} />)}
    </span>}
  </div>
}

export function FilmGalleryManager() {
  const manager = useFilmGalleryStore((state) => state.manager)
  const images = useFilmGallery(manager?.id)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (manager) { ensureFilmGallery(manager.id); setMsg('') } }, [manager])
  if (!manager) return null
  const { id, name } = manager
  const store = useFilmGalleryStore.getState()
  const save = async (list: FilmImage[]) => {
    try { await store.save(id, list) } catch (error) { setMsg(`保存失败：${(error as Error).message}`) }
  }

  async function onFiles(files: FileList | null) {
    const picked = Array.from(files || []).filter((file) => !file.type || file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(file.name))
    if (!picked.length) { setMsg(files?.length ? '没有选到图片' : ''); return }
    const room = MAX_FILM_IMAGES - images.length
    if (room <= 0) { setMsg(`最多 ${MAX_FILM_IMAGES} 张，先删掉几张`); return }
    setBusy(true); setMsg('正在压缩…')
    const added: FilmImage[] = []
    let failed = 0
    for (const file of picked.slice(0, room)) {
      try { added.push({ id: filmImageId(), src: await compressFilmImage(file) }) } catch { failed += 1 }
    }
    // 压缩期间列表可能变了，以最新的为准再合并
    const latest = useFilmGalleryStore.getState().galleries[id] || images
    const { list, dropped } = addFilmImages(latest, added)
    await save(list)
    const skipped = dropped + Math.max(0, picked.length - room)
    setMsg([failed ? `${failed} 张读不出来` : '', skipped ? `超出 ${MAX_FILM_IMAGES} 张的 ${skipped} 张没加` : ''].filter(Boolean).join('，'))
    setBusy(false)
  }

  return createPortal(<div className="film-gallery-layer" role="dialog" aria-modal="true" aria-label="胶片图">
    <button type="button" className="film-gallery-backdrop" aria-label="关闭" onClick={() => store.closeManager()} />
    <section className="film-gallery-sheet">
      {/* 不设 accept：iOS 上会把文件置灰 */}
      <input ref={fileRef} type="file" multiple hidden onChange={(event) => { void onFiles(event.target.files); event.target.value = '' }} />
      <div className="film-gallery-head"><strong>🎞 {name}的胶片图</strong><button type="button" aria-label="关闭" onClick={() => store.closeManager()}>×</button></div>
      <p className="film-gallery-note">最多 {MAX_FILM_IMAGES} 张，每 4 秒轮换一张，点胶片框可立刻换下一张。没有图时显示头像。图只存在这台手机里，完整备份会一起导出。</p>
      <div className="film-gallery-grid">
        {images.map((image, i) => <div key={image.id} className="film-gallery-item">
          <img src={image.src} alt={`第 ${i + 1} 张`} decoding="async" />
          <span className="film-gallery-no">{i + 1}</span>
          <div className="film-gallery-actions">
            <button type="button" aria-label="左移" disabled={i === 0} onClick={() => void save(moveFilmImage(images, image.id, -1))}>‹</button>
            <button type="button" className="danger" aria-label="删除" onClick={() => { if (window.confirm('删除这张胶片图？')) void save(removeFilmImage(images, image.id)) }}>×</button>
            <button type="button" aria-label="右移" disabled={i === images.length - 1} onClick={() => void save(moveFilmImage(images, image.id, 1))}>›</button>
          </div>
        </div>)}
        {images.length < MAX_FILM_IMAGES && <button type="button" className="film-gallery-add" disabled={busy} onClick={() => fileRef.current?.click()}>
          <b>＋</b><small>{busy ? '处理中…' : `添加（${images.length}/${MAX_FILM_IMAGES}）`}</small>
        </button>}
      </div>
      {msg && <p className="film-gallery-msg" role="status">{msg}</p>}
    </section>
  </div>, document.body)
}
