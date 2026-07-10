const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

async function returnToChat() {
  sessionStorage.removeItem('weijing.returnToChat')
  for (let index = 0; index < 5; index += 1) {
    const continueButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('继续共演'))
    if (continueButton) { continueButton.click(); return }
    const chatNav = Array.from(document.querySelectorAll<HTMLButtonElement>('.bottom-nav button')).find((button) => button.textContent?.includes('共演'))
    if (chatNav) { chatNav.click(); return }
    const back = document.querySelector<HTMLButtonElement>('.page-header .icon-button')
    if (!back) return
    back.click()
    await sleep(100)
  }
}

export function installNavigationFix() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const back = target.closest<HTMLButtonElement>('.page-header .icon-button')
    if (!back || sessionStorage.getItem('weijing.returnToChat') !== '1') return
    event.preventDefault()
    event.stopPropagation()
    returnToChat()
  }, true)
}
