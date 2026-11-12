/* v224：展开/收起长消息编辑器的图标：对角两个细 L 形角（右上 + 左下），圆头线帽。
   向外（expand）= 两个角朝外指向右上、左下；向内（collapse）= 两个角朝内。颜色跟 currentColor。 */
export function ExpandCornersIcon({ direction = 'out', size = 18 }: { direction?: 'out' | 'in', size?: number }) {
  const d = direction === 'out'
    ? 'M14 4.5h5.5V10M10 19.5H4.5V14'
    : 'M15.5 3.5V8.5h5M8.5 20.5V15.5h-5'
  return <svg className="expand-corners-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>
}
