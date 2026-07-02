const SIZES = {
  sm: 'text-[9px]',
  lg: 'text-[10px]',
}

// Types itself out character by character, holds fully visible for a
// beat, then wipes itself out and loops — a small "live ad" flourish
// instead of a static caption. A blinking cursor sits right after the
// text and is only visible while the reveal is holding (it's inside
// the same clipped box, so it naturally appears/disappears with it).
export default function Tagline({ size = 'sm' }) {
  return (
    <div className={`${SIZES[size] ?? SIZES.sm} text-amber/80 font-semibold tracking-[0.14em] uppercase whitespace-nowrap inline-block animate-tagline-type`}>
      Schnell · Smart · Präzise<span className="animate-blink border-r-2 border-amber/70 ml-0.5" />
    </div>
  )
}
