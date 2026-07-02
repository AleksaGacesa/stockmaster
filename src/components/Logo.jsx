import Icon from './Icon'

const SIZES = {
  sm: { box: 36, icon: 18, radius: 'rounded-lg' },
  md: { box: 44, icon: 22, radius: 'rounded-xl' },
  lg: { box: 60, icon: 30, radius: 'rounded-2xl' },
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
          <Icon name="package" size={icon} color="#181c20" />
        </div>
      </div>
    </div>
  )
}
