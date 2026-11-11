/**
 * v202：剧情美化卡自动切歌（「模型自己点就切歌播放吧，自动」）。
 * 只在一条回复刚生成完（流式结束、<film> 块已闭合）时由发送流程调用一次；
 * 渲染历史消息从不调用。卡里点的歌在歌单里匹配到、且没在放 → 切过去放；
 * 匹配不到什么都不做（卡上会显示「点这里导入《X》」）。iOS 拒绝无手势播放时，
 * MusicPlayer 会把那首记进 autoplayBlockedId，卡片显示「点播放」。
 */
import { extractFilmCard } from './filmBlock'
import { findTrackByTitle, useMusicStore } from './musicStore'

const handled = new Set<string>()

export type FilmAutoplayResult = 'no-card' | 'done-before' | 'no-match' | 'already-playing' | 'requested'

export function autoPlayFilmSong(messageId: string | number, text: string): FilmAutoplayResult {
  const card = extractFilmCard(text || '').card
  if (!card?.closed || !card.song?.title) return 'no-card'
  const key = `${messageId}|${card.song.title}`
  if (handled.has(key)) return 'done-before'
  handled.add(key)
  const state = useMusicStore.getState()
  const match = findTrackByTitle(state.tracks, card.song.title, card.song.artist)
  if (!match) return 'no-match'
  if (state.now?.playing && state.now.name === match.name) return 'already-playing'
  state.requestPlay(match.id, true)
  return 'requested'
}

/** 测试用。 */
export function resetFilmAutoplayForTests() { handled.clear() }
