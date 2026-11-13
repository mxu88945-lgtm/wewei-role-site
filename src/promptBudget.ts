/**
 * v236：粗略估算 token（不是计费数）。中日韩字按 1 个 token，其余字符约 3.5 个算 1 个。
 * Claude / GPT 的中文大约 0.7–1.2 token/字，这里取偏保守的整数，只用来比较前后与各块占比。
 */
export function estimateTokens(text: string | number): number {
  if (typeof text === 'number') return text
  let cjk = 0, other = 0
  for (const char of text) {
    if (/[\u3000-\u303f\u3400-\u9fff\uff00-\uffef\u2e80-\u2fdf]/.test(char)) cjk++
    else other++
  }
  return Math.round(cjk + other / 3.5)
}
