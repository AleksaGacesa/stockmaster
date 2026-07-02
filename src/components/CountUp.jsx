import { useState, useEffect } from 'react'

// Animates from 0 to `value` with an ease-out curve whenever `value`
// changes (including on first mount) — turns a static number into a
// small "counting up" reveal instead of snapping straight to it.
export default function CountUp({ value, duration = 900, format }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const to = Number(value) || 0
    let raf
    const start = performance.now()
    const step = (ts) => {
      const progress = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(to * eased)
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return format ? format(display) : Math.round(display)
}
