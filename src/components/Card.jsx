export default function Card({ children, className = '', onClick, style }) {
  return (
    <div
      className={`bg-bg-1 border border-border rounded-xl transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:border-border-strong hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.25)]' : ''
      } ${className}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  )
}
