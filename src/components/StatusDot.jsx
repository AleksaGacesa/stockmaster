// A small glowing status indicator — used alongside status/stock
// badges everywhere so state reads at a glance, not just from text color.
export default function StatusDot({ color, pulse = false, size = 7 }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {pulse && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
              style={{ background: color }} />
      )}
      <span className="relative inline-flex rounded-full w-full h-full"
            style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
    </span>
  )
}
