import { useEffect, useState } from 'react'
import { weatherLabel } from './phoneGroup'

/** 小手机顶部：实时本地时间 + 当地天气（定位 + Open-Meteo，无需密钥，缓存 30 分钟）。 */
type Weather = { temp: number; code: number; high: number; low: number; place?: string; at: number }
const CACHE_KEY = 'weijing.phoneWeather'
const ENABLED_KEY = 'weijing.phoneWeatherEnabled'
const TTL = 30 * 60 * 1000

const readCache = (): Weather | null => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch { return null } }

async function fetchWeather(): Promise<Weather> {
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('这台设备不支持定位')); return }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: TTL })
  })
  const { latitude, longitude } = position.coords
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`天气服务 ${response.status}`)
  const data = await response.json()
  return { temp: Math.round(data.current.temperature_2m), code: data.current.weather_code, high: Math.round(data.daily.temperature_2m_max[0]), low: Math.round(data.daily.temperature_2m_min[0]), at: Date.now() }
}

export default function PhoneStatusWidget() {
  const [now, setNow] = useState(() => new Date())
  const [weather, setWeather] = useState<Weather | null>(readCache)
  const [enabled, setEnabled] = useState(() => localStorage.getItem(ENABLED_KEY) === '1')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  const load = async (force = false) => {
    const cached = readCache()
    if (!force && cached && Date.now() - cached.at < TTL) { setWeather(cached); return }
    setStatus('loading')
    try {
      const next = await fetchWeather()
      localStorage.setItem(CACHE_KEY, JSON.stringify(next))
      localStorage.setItem(ENABLED_KEY, '1')
      setEnabled(true); setWeather(next); setStatus('idle'); setError('')
    } catch (reason) {
      const denied = (reason as GeolocationPositionError)?.code === 1
      setError(denied ? '没有定位权限：去 iPhone 设置 → 隐私 → 定位服务 → Safari 网站 打开' : (reason instanceof Error ? reason.message : '天气获取失败'))
      setStatus('error')
    }
  }

  useEffect(() => { if (enabled) void load() }, [enabled])

  const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const date = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
  const label = weather ? weatherLabel(weather.code) : null

  return <section className="phone-status-widget" aria-label="本地时间与天气">
    <div className="phone-status-time"><strong>{time}</strong><small>{date}</small></div>
    <button type="button" className="phone-status-weather" onClick={() => void load(true)} disabled={status === 'loading'} aria-label="刷新天气">
      {weather && label
        ? <><span className="phone-status-icon">{label.icon}</span><span><b>{weather.temp}°</b><small>{label.text} · {weather.low}°/{weather.high}°</small></span></>
        : <span className="phone-status-connect">{status === 'loading' ? '获取中…' : '📍 连接天气'}</span>}
    </button>
    {status === 'error' && <p className="phone-status-error">{error}</p>}
  </section>
}
