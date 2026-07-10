import { openChatDrawer } from './chatDrawer'

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
let bypass = false

function findButton(text: string, root: ParentNode = document) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes(text))
}

async function returnToDrawer(back: HTMLButtonElement) {
  sessionStorage.removeItem('weijing.drawerReturn')
  bypass = true
  back.click()
  await sleep(90)

  // 全局设置子页先回到“更多”，再回主页；角色子页先回角色详情。
  for (let index = 0; index < 5 && !document.querySelector('.chat-page'); index += 1) {
    const continueButton = findButton('继续共演')
    if (continueButton) {
      continueButton.click()
      await sleep(100)
      break
    }
    const homeChat = document.querySelector<HTMLButtonElement>('[data-home-route="chat"]')
    if (homeChat) {
      homeChat.click()
      await sleep(100)
      break
    }
    const pageBack = document.querySelector<HTMLButtonElement>('.page-header .icon-button')
    if (!pageBack) break
    pageBack.click()
    await sleep(90)
  }

  bypass = false
  if (document.querySelector('.chat-page')) window.setTimeout(openChatDrawer, 80)
}

export function installNavigationFix() {
  document.addEventListener('click', (event) => {
    if (bypass) return
    const target = event.target as HTMLElement
    const back = target.closest<HTMLButtonElement>('.page-header .icon-button')
    if (!back || sessionStorage.getItem('weijing.drawerReturn') !== '1') return
    event.preventDefault()
    event.stopPropagation()
    returnToDrawer(back)
  }, true)
}
