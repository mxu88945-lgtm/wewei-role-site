/**
 * v202：剧情美化卡自动切歌（「模型自己点就切歌播放吧，自动」）。
 * 只在一条回复刚生成完时调用：发送流程拿到最终文本后调用一次；v204 起，消息组件看到
 * 自己从「流式中」变成「流式结束」时再补调一次（handled 去重）。渲染历史消息从不调用。
 * 卡里点的歌在歌单里匹配到、且没在放 → 切过去放；匹配不到什么都不做（卡上会显示「点这里导入《X》」）。
 * v204：最终文本里模型漏写 </film> 也算（流式已结束，就是整条回复）。
 * iOS 拒绝无手势播放、play() 一直不落地、或 3 秒后还没放上 → 记进 autoplayBlockedId，卡片显示「点播放」。
 */
import { extractFilmCard } from './filmBlock'
import { findTrackByTitle, useMusicStore } from './musicStore'

const handled = new Set<string>()

export type FilmAutoplayResult = 'no-card' | 'done-before' | 'no-match' | 'already-playing' | 'requested'

/** 自动切歌后多久还没放上就当被拦下（毫秒）。 */
export const FILM_AUTOPLAY_CHECK_MS = 3000

export function autoPlayFilmSong(messageId: string | number, text: string): FilmAutoplayResult {
  // 不传 streaming：没闭合的 <film> 在最终文本里也会解析成卡（closed=false）。
  const card = extractFilmCard(text || '').card
  if (!card?.song?.title) return 'no-card'
  const key = `${messageId}|${card.song.title}|${card.heart}`
  if (handled.has(key)) return 'done-before'
  handled.add(key)
  const state = useMusicStore.getState()
  const match = findTrackByTitle(state.tracks, card.song.title, card.song.artist)
  if (!match) return 'no-match'
  if (state.now?.playing && state.now.name === match.name) return 'already-playing'
  state.requestPlay(match.id, true)
  const command = useMusicStore.getState().command
  // 3 秒后还没放上这首（播放器没接到 / play() 卡住 / 被拒），且这期间她没发别的播放指令 → 显示「点播放」。
  setTimeout(() => {
    const later = useMusicStore.getState()
    if (later.command !== command) return
    if (later.now?.playing && later.now.name === match.name) return
    later.setAutoplayBlocked(match.id)
  }, FILM_AUTOPLAY_CHECK_MS)
  return 'requested'
}

/** 测试用。 */
export function resetFilmAutoplayForTests() { handled.clear() }
