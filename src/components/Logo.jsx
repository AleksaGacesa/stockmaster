const SIZES = {
  sm: { box: 36, icon: 21, radius: 'rounded-lg' },
  md: { box: 44, icon: 26, radius: 'rounded-xl' },
  lg: { box: 60, icon: 35, radius: 'rounded-2xl' },
}

// Werkheld mark: a shield (Held = hero/protection) holding a hammer
// (Werk = craft). Dark shield on the amber badge, hammer knocked out
// in white. Drawn as a self-contained SVG so it stays crisp at every
// size and matches the PWA icons.
function WerkheldGlyph({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="relative">
      <path d="M6 4.6 H18 V11 C18 15.5 15.2 18.8 12 20.4 C8.8 18.8 6 15.5 6 11 Z"
            fill="#181c20" />
      {/* hammer knocked out in white, tilted like the app icon */}
      <g transform="rotate(-28.6 12 11.6)">
        <rect x="8.3" y="7.0" width="7.4" height="2.4" rx="0.7" fill="#fff" />
        <rect x="11.0" y="9.0" width="2.0" height="7.2" rx="0.9" fill="#fff" />
      </g>
    </svg>
  )
}

// The animated pieces are split across nested elements on purpose —
// float (transform), pulse-glow (box-shadow) and ring-spin (transform)
// are separate Tailwind animation utilities, and stacking two that
// both animate `transform` on one element would just have the later
// class silently win since both set the same CSS property.
export default function Logo({ size = 'md', animated = true }) {
  const { box, icon, radius } = SIZES[size] ?? SIZES.md
  const ringInset = Math.max(Math.round(box * 0.09), 3)
  return (
    <div className={animated ? 'animate-float' : ''} style={{ width: box, height: box }}>
      <div className="relative w-full h-full">
        {/* Continuously rotating conic-gradient ring — the "always
            something happening" live-badge effect. */}
        {animated && (
          <div className={`absolute inset-0 ${radius} animate-ring-spin`}
               style={{ background: 'conic-gradient(from 0deg, #f0982e, #ffd27a, #c96a0f, #f0982e)' }} />
        )}
        <div className={`absolute ${radius} flex items-center justify-center overflow-hidden ${animated ? 'animate-pulse-glow' : ''}`}
             style={{
               inset: animated ? ringInset : 0,
               background: 'linear-gradient(135deg,#f0982e,#c96a0f)',
               boxShadow: '0 4px 14px rgba(232,130,28,0.35)',
             }}>
          {animated && (
            <div className="absolute inset-0 animate-shine"
                 style={{ background: 'linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.5) 50%, transparent 65%)', backgroundSize: '250% 100%' }} />
          )}
          <WerkheldGlyph size={icon} />
        </div>
      </div>
    </div>
  )
}
