import { useState } from 'react'
import Icon from './Icon'

// Category → pictogram. With 5000+ articles, uploading a photo per item
// is impractical, so every article gets an automatic coloured pictogram
// based on its category. A real image is only shown when the article has
// a `bild` URL (optional) — otherwise (the common case) the pictogram
// stands in. Icons are limited to the set in Icon.jsx; distinct colours
// carry most of the "at a glance" recognition.
const PIKTO = {
  'Dachziegel':       { icon: 'home',      color: '#e8821c' },
  'Dachbahnen':       { icon: 'refresh',   color: '#6b8cae' },
  'Dämmstoffe':       { icon: 'box',       color: '#c98b3f' },
  'Bauholz':          { icon: 'box',       color: '#8a6d3b' },
  'Klempnerblech':    { icon: 'box',       color: '#7a8a99' },
  'Dachentwässerung': { icon: 'arrowDown', color: '#4a90d9' },
  'Befestigung':      { icon: 'settings',  color: '#9aa3ad' },
  'PV-Montage':       { icon: 'sun',       color: '#f0b429' },
  'Werkzeuge':        { icon: 'settings',  color: '#d96b8f' },
  'Arbeitsschutz':    { icon: 'user',      color: '#4caf6e' },
  'Gerüstbau':        { icon: 'building',  color: '#7e7ae0' },
  'Dachfenster':      { icon: 'home',      color: '#3fb6c4' },
  'Absturzsicherung': { icon: 'alert',     color: '#e0524a' },
  'Abdichtung':       { icon: 'box',       color: '#4a90d9' },
  'Zubehör':          { icon: 'package',   color: '#9b6bd9' },
}
const FALLBACK = { icon: 'package', color: '#9aa3ad' }

export function piktogramm(kategorie) {
  return PIKTO[kategorie] ?? FALLBACK
}

// Fills its parent box (parent controls size/shape/rounding/overflow).
// Renders the real image when a valid URL is present, otherwise a tinted
// pictogram tile. A broken image URL falls back to the pictogram too.
export default function ArtikelBild({ artikel, iconSize = 22, className = '' }) {
  const [failed, setFailed] = useState(false)
  if (artikel?.bild && !failed) {
    return (
      <img src={artikel.bild} alt={artikel.name || ''}
           className={`w-full h-full object-cover ${className}`}
           onError={() => setFailed(true)} />
    )
  }
  const { icon, color } = piktogramm(artikel?.kategorie)
  return (
    <div className={`w-full h-full flex items-center justify-center ${className}`}
         style={{ background: `${color}1f` }}>
      <Icon name={icon} size={iconSize} color={color} />
    </div>
  )
}
