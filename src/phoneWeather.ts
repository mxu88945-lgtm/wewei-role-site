import { joinPlace } from './phoneGroup'

/** 小手机顶部：实时本地时间 + 当地天气（定位 + Open-Meteo，无需密钥，缓存 30 分钟）。 */
export type Weather = { temp: number; code: number; high: number; low: number; place?: string; at: number }
export const CACHE_KEY = 'weijing.phoneWeather'
export const ENABLED_KEY = 'weijing.phoneWeatherEnabled'
export const TTL = 30 * 60 * 1000

export const readCache = (): Weather | null => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch { return null } }

/** 把定位换成“广东省潮州市湘桥区”这样的地名（免密钥；失败就只给天气）。 */
async function fetchPlace(latitude: number, longitude: number): Promise<string> {
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 8000)
    const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}&localityLanguage=zh`, { signal: controller.signal })
    window.clearTimeout(timer)
    if (!response.ok) return ''
    const data = await response.json()
    return joinPlace([data.principalSubdivision, data.city, data.locality])
  } catch { return '' }
}

export async function fetchWeather(): Promise<Weather> {
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('这台设备不支持定位')); return }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: TTL })
  })
  const { latitude, longitude } = position.coords
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
  const [response, place] = await Promise.all([fetch(url), fetchPlace(latitude, longitude)])
  if (!response.ok) throw new Error(`天气服务 ${response.status}`)
  const data = await response.json()
  return { temp: Math.round(data.current.temperature_2m), code: data.current.weather_code, high: Math.round(data.daily.temperature_2m_max[0]), low: Math.round(data.daily.temperature_2m_min[0]), ...(place ? { place } : {}), at: Date.now() }
}

/** v215：人格窗口也用定位和天气。只有她在小手机里开过天气才会去取，缓存 30 分钟内不重复取。 */
export async function refreshPhoneWeatherIfEnabled() {
  if (localStorage.getItem(ENABLED_KEY) !== '1') return
  const cached = readCache()
  if (cached && cached.place && Date.now() - cached.at < TTL) return
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(await fetchWeather())) } catch { /* 拿不到就只给时间 */ }
}

