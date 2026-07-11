import { fetchApiModels, type ApiModel } from './chatApi'

type MemoryChannelNameMap = Record<string, string>

function activeCharacterId() {
  try {
    const value = localStorage.getItem('weijing.activeCharacter')
    return value ? String(JSON.parse(value)) : 'default'
  } catch {
    return 'default'
  }
}

function readMemoryChannelNames(): MemoryChannelNameMap {
  try {
    const value = localStorage.getItem('weijing.memoryChannelNames')
    const parsed = value ? JSON.parse(value) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as MemoryChannelNameMap : {}
  } catch {
    return {}
  }
}

function getMemoryChannelName() {
  return readMemoryChannelNames()[activeCharacterId()] || ''
}

function saveMemoryChannelName(value: string) {
  const names = readMemoryChannelNames()
  names[activeCharacterId()] = value
  localStorage.setItem('weijing.memoryChannelNames', JSON.stringify(names))
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function updateStatus(section: HTMLElement, channelName: string) {
  const statusText = section.querySelector<HTMLElement>('.api-status small')
  if (!statusText) return
  if (!statusText.dataset.baseText) statusText.dataset.baseText = statusText.textContent || ''
  const next = channelName.trim()
    ? `${statusText.dataset.baseText} · 渠道：${channelName.trim()}`
    : statusText.dataset.baseText
  if (statusText.textContent !== next) statusText.textContent = next
}

function openModelPicker(models: ApiModel[], currentModel: string, onSelect: (model: string) => void) {
  document.querySelector('.memory-model-picker-layer')?.remove()

  const layer = document.createElement('div')
  layer.className = 'api-model-picker-layer memory-model-picker-layer'
  layer.innerHTML = `
    <button class="api-model-picker-backdrop" type="button" aria-label="关闭模型列表"></button>
    <section class="api-model-picker" aria-label="选择记忆总结模型">
      <header>
        <div><small>记忆总结 API</small><strong>选择模型</strong></div>
        <button type="button" aria-label="关闭">×</button>
      </header>
      <input class="api-model-search" type="search" placeholder="搜索模型名称" autocomplete="off" />
      <div class="api-model-list"></div>
    </section>
  `

  const close = () => layer.remove()
  layer.querySelector<HTMLButtonElement>('.api-model-picker-backdrop')?.addEventListener('click', close)
  layer.querySelector<HTMLButtonElement>('.api-model-picker > header button')?.addEventListener('click', close)

  const search = layer.querySelector<HTMLInputElement>('.api-model-search')!
  const list = layer.querySelector<HTMLDivElement>('.api-model-list')!

  const render = () => {
    const query = search.value.trim().toLocaleLowerCase()
    const filtered = models.filter((model) => !query || model.id.toLocaleLowerCase().includes(query) || model.ownedBy?.toLocaleLowerCase().includes(query))
    list.replaceChildren()

    if (!filtered.length) {
      const empty = document.createElement('div')
      empty.className = 'api-model-empty'
      empty.textContent = '没有找到匹配的模型'
      list.append(empty)
      return
    }

    for (const model of filtered) {
      const button = document.createElement('button')
      button.type = 'button'
      if (model.id === currentModel) button.className = 'active'
      const copy = document.createElement('div')
      const name = document.createElement('strong')
      name.textContent = model.id
      copy.append(name)
      if (model.ownedBy) {
        const owner = document.createElement('small')
        owner.textContent = model.ownedBy
        copy.append(owner)
      }
      const mark = document.createElement('i')
      mark.textContent = model.id === currentModel ? '✓' : '›'
      button.append(copy, mark)
      button.addEventListener('click', () => {
        onSelect(model.id)
        close()
      })
      list.append(button)
    }
  }

  search.addEventListener('input', render)
  render()
  document.body.append(layer)
  window.setTimeout(() => search.focus(), 50)
}

function enhanceMemoryApiPage() {
  const header = Array.from(document.querySelectorAll<HTMLElement>('.page-header h1')).find((item) => item.textContent?.trim() === '记忆总结 API')
  const section = header?.closest('.page-header')?.nextElementSibling
  if (!(section instanceof HTMLElement)) return

  const labels = Array.from(section.querySelectorAll<HTMLLabelElement>('label'))
  const modelLabel = labels.find((label) => label.textContent?.trim().startsWith('模型名称'))
  const modelInput = modelLabel?.querySelector<HTMLInputElement>('input')
  const baseLabel = labels.find((label) => label.textContent?.trim().startsWith('Base URL'))
  const baseInput = baseLabel?.querySelector<HTMLInputElement>('input')
  const keyInput = labels.find((label) => label.textContent?.trim().startsWith('API Key'))?.querySelector<HTMLInputElement>('input')
  if (!modelLabel || !modelInput || !baseLabel || !baseInput || !keyInput) return

  let channelLabel = section.querySelector<HTMLLabelElement>('.memory-api-channel-label')
  if (!channelLabel) {
    channelLabel = document.createElement('label')
    channelLabel.className = 'memory-api-channel-label'
    channelLabel.append('渠道商名称')

    const channelInput = document.createElement('input')
    channelInput.type = 'text'
    channelInput.placeholder = '例如：DS、个人次 cli、依韵小克'
    channelInput.autocomplete = 'off'
    channelInput.value = getMemoryChannelName()
    channelInput.addEventListener('input', () => {
      saveMemoryChannelName(channelInput.value)
      updateStatus(section, channelInput.value)
    })
    channelLabel.append(channelInput)
    baseLabel.insertAdjacentElement('beforebegin', channelLabel)
  }

  const channelInput = channelLabel.querySelector<HTMLInputElement>('input')
  if (channelInput && document.activeElement !== channelInput && channelInput.value !== getMemoryChannelName()) {
    channelInput.value = getMemoryChannelName()
  }
  updateStatus(section, channelInput?.value || '')

  if (modelLabel.dataset.modelPickerReady === 'true') return
  modelLabel.dataset.modelPickerReady = 'true'
  modelLabel.classList.add('memory-api-model-label')

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'memory-api-fetch-models'
  button.textContent = '获取模型'

  const message = document.createElement('small')
  message.className = 'api-model-message memory-api-model-message'
  modelLabel.insertAdjacentElement('afterend', message)
  modelLabel.append(button)

  button.addEventListener('click', async () => {
    button.disabled = true
    button.textContent = '获取中…'
    message.classList.remove('error')
    message.textContent = '正在请求模型列表…'
    try {
      const models = await fetchApiModels({ baseUrl: baseInput.value, apiKey: keyInput.value })
      if (!models.length) throw new Error('接口返回成功，但没有可用模型')
      message.textContent = `已获取 ${models.length} 个模型`
      openModelPicker(models, modelInput.value, (model) => setReactInputValue(modelInput, model))
    } catch (error) {
      message.classList.add('error')
      message.textContent = error instanceof Error ? error.message : '获取模型失败'
    } finally {
      button.disabled = false
      button.textContent = '获取模型'
    }
  })
}

window.setInterval(enhanceMemoryApiPage, 350)
enhanceMemoryApiPage()
