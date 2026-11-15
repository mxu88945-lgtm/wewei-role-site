import { Component, type ErrorInfo, type ReactNode } from 'react'
import { isSafeMode, reloadApp } from './safeMode'

/**
 * v245：渲染出错时不再整页白屏。
 * - fullScreen：最外层，显示「出错了 · 重新加载 / 安全模式」。
 * - 否则（可选功能：立绘、开场模板、播放器）：出错就安静地不显示这一块。
 */
type Props = { children: ReactNode; fullScreen?: boolean; name?: string }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[惟境] ${this.props.name || '页面'} 出错`, error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (!this.props.fullScreen) return null
    const safe = isSafeMode()
    return <div className="app-crash-screen" role="alert">
      <strong>出错了</strong>
      <p>聊天记录都还在，没有被删。</p>
      <small>{String(error.message || error).slice(0, 200)}</small>
      <button type="button" onClick={() => reloadApp()}>重新加载</button>
      {safe
        ? <button type="button" onClick={() => reloadApp(false)}>退出安全模式并重新加载</button>
        : <button type="button" onClick={() => reloadApp(true)}>安全模式（不加载立绘、开场模板、歌词）</button>}
    </div>
  }
}
