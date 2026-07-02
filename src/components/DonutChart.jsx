export default function DonutChart({ data, size = 140 }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const r = size / 2 - 12, cx = size / 2, cy = size / 2
  const circumference = 2 * Math.PI * r
  let offset = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(var(--bg-3))" strokeWidth="16" />
      {data.map((d, i) => {
        const dash = (d.value / total) * circumference
        const el = (
          <circle key={d.label} cx={cx} cy={cy} r={r} fill="none" stroke={d.color}
                  strokeWidth="16" strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`}
                  style={{ transition: 'stroke-dasharray 0.8s ease' }} />
        )
        offset += dash
        return el
      })}
    </svg>
  )
}
