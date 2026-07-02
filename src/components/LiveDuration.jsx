import { useState, useEffect } from 'react'

const pad = (n) => String(n).padStart(2, '0')

// A genuinely ticking stopwatch (updates every second via its own
// interval), not just a duration recomputed on the next re-render —
// this is the "sat koji se pomera" for a running project. `since`
// is any Date-parseable timestamp; a small pulsing dot signals it's
// live.
export default function LiveDuration({ since, color = '#4a90d9', className = '' }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsedMs = Math.max(now - new Date(since).getTime(), 0)
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const label = days > 0
    ? `${days}T ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono tabular-nums ${className}`}>
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: color }} />
        <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: color }} />
      </span>
      {label}
    </span>
  )
}
