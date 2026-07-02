import { useLanguage } from '../hooks/useLanguage'
import Icon from './Icon'
import StatusDot from './StatusDot'

export default function StockBadge({ menge, mindestbestand }) {
  const { t } = useLanguage()
  let classes, label, color, icon, pulse = false
  if (menge <= 0) {
    classes = 'bg-red-dim text-red'
    label = t('stock_unavailable')
    color = '#e0524a'; icon = 'x'; pulse = true
  } else if (menge < mindestbestand) {
    classes = 'bg-red-dim text-red'
    label = t('stock_low')
    color = '#e0524a'; icon = 'alert'; pulse = true
  } else if (menge < mindestbestand * 1.5) {
    classes = 'bg-amber-dim text-amber'
    label = t('stock_tight')
    color = '#e8821c'; icon = 'alert'
  } else {
    classes = 'bg-green-dim text-green'
    label = t('stock_sufficient')
    color = '#4caf6e'; icon = 'check'
  }

  return (
    <span className={`${classes} text-xs font-semibold pl-1.5 pr-2 py-1 rounded-md whitespace-nowrap inline-flex items-center gap-1.5`}>
      <StatusDot color={color} pulse={pulse} size={6} />
      <Icon name={icon} size={12} color={color} />
      {label}
    </span>
  )
}
