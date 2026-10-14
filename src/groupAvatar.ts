/** 群头像：相册图片缩成 256 方图，或把成员头像拼成微信那样的九宫格。 */
const SIZE = 256

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image()
  // 远程头像按 CORS 读，读不到就退回首字，避免画布被污染导致整张拼图静默失败。
  if (!/^(data|blob):/.test(src)) image.crossOrigin = 'anonymous'
  image.onload = () => resolve(image)
  image.onerror = reject
  image.src = src
})

const drawCover = (ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, size: number) => {
  const side = Math.min(image.naturalWidth, image.naturalHeight)
  ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, x, y, size, size)
}

export async function squareAvatarFromFile(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = SIZE; canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    drawCover(ctx, image, 0, 0, SIZE)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally { URL.revokeObjectURL(url) }
}

/** 九宫格位置：1 张铺满，2—4 张两列，5—9 张三列；最后一行居中。 */
export function collageLayout(count: number, size = SIZE, gap = 6) {
  const n = Math.max(1, Math.min(9, count))
  if (n === 1) return [{ x: 0, y: 0, size }]
  const cols = n <= 4 ? 2 : 3
  const rows = Math.ceil(n / cols)
  const cell = (size - gap * (cols + 1)) / cols
  const top = (size - (rows * cell + (rows - 1) * gap)) / 2
  return Array.from({ length: n }, (_, index) => {
    const row = Math.floor(index / cols)
    const inRow = row === rows - 1 ? n - row * cols : cols
    const left = (size - (inRow * cell + (inRow - 1) * gap)) / 2
    return { x: left + (index - row * cols) * (cell + gap), y: top + row * (cell + gap), size: cell }
  })
}

export async function collageAvatar(members: Array<{ name: string; avatar?: string }>) {
  const list = members.slice(0, 9)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE; canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.fillStyle = '#e9e6ee'
  ctx.fillRect(0, 0, SIZE, SIZE)
  const cells = collageLayout(list.length)
  for (const [index, member] of list.entries()) {
    const cell = cells[index]
    try {
      if (!member.avatar) throw new Error('none')
      drawCover(ctx, await loadImage(member.avatar), cell.x, cell.y, cell.size)
    } catch {
      ctx.fillStyle = '#8f7fb0'
      ctx.fillRect(cell.x, cell.y, cell.size, cell.size)
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${Math.round(cell.size * 0.45)}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(member.name.slice(-1), cell.x + cell.size / 2, cell.y + cell.size / 2)
    }
  }
  try { return canvas.toDataURL('image/jpeg', 0.85) } catch {
    // 某张远程图把画布污染了：全部改用首字重拼一次。
    return collageAvatar(list.map((member) => ({ name: member.name })))
  }
}

/** 头像变化的轻量指纹：长度 + 头尾片段，避免把整段 data URL 拼进依赖。 */
export function phoneAvatarSignature(avatar?: string) {
  if (!avatar) return '-'
  return `${avatar.length}.${avatar.slice(-24)}.${avatar.slice(0, 48)}`
}
