import { useEffect, useState } from 'react'
import { shortPlace, weatherLabel } from './phoneGroup'
import { CACHE_KEY, ENABLED_KEY, TTL, fetchWeather, readCache, type Weather } from './phoneWeather'

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
    if (!force && cached && cached.place && Date.now() - cached.at < TTL) { setWeather(cached); return }
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
        ? <><span className="phone-status-icon">{label.icon}</span><span><b>{weather.temp}°</b><small>{weather.place ? `${shortPlace(weather.place)} · ` : ''}{label.text} · {weather.low}°/{weather.high}°</small></span></>
        : <span className="phone-status-connect">{status === 'loading' ? '获取中…' : '📍 连接天气'}</span>}
    </button>
    {status === 'error' && <p className="phone-status-error">{error}</p>}
  </section>
}
