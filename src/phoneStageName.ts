/**
 * 小手机里叫她用她现在的用户身份名；其它身份（苏禾、宁梦曦……）是她在戏里演的女主，只是角色名。
 */
const others = (names: string[], userName: string) => [...new Set(names.map((name) => name.trim()).filter((name) => name && name !== userName))]
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function phoneStageNameNote(names: string[], userName: string) {
  const stage = others(names, userName)
  if (!stage.length) return ''
  return `\n【称呼】${stage.join('、')}是${userName}在戏里演过的女主名字，不是她本人。小手机里叫她、@她一律用「${userName}」，不要写 @${stage[0]}；聊到剧情时可以说“她演的${stage[0]}”。`
}

/** 角色写成 @戏里名字 的，换成 @她现在的名字。 */
export function fixStageMentions(text: string, names: string[], userName: string) {
  const stage = others(names, userName).sort((a, b) => b.length - a.length)
  if (!stage.length) return text
  return text.replace(new RegExp(`[@＠](${stage.map(escape).join('|')})`, 'g'), `@${userName}`)
}
