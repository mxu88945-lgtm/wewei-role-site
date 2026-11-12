/* v224：输入框“展开长消息”按钮只在文字溢出时出现：
   输入框已经长到自动增高的上限，内容还需要滚动（scrollHeight > clientHeight + 1）。 */

export const COMPOSER_MIN_HEIGHT = 34
export const COMPOSER_MAX_HEIGHT = 180

/** 内容比可见区域高出超过 1px，就算溢出（留 1px 容差，避免小数像素抖动）。 */
export function composerOverflows(scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight > clientHeight + 1
}

type AutoGrowTextarea = { style: { height: string }, readonly scrollHeight: number, readonly clientHeight: number }

/** 让输入框随内容长高（不超过上限），并返回此时文字是否溢出需要滚动。 */
export function fitComposer(textarea: AutoGrowTextarea, min = COMPOSER_MIN_HEIGHT, max = COMPOSER_MAX_HEIGHT): boolean {
  textarea.style.height = 'auto'
  const contentHeight = textarea.scrollHeight
  textarea.style.height = `${Math.min(Math.max(contentHeight, min), max)}px`
  return composerOverflows(textarea.scrollHeight, textarea.clientHeight)
}
