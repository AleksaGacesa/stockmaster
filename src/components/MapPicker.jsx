import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { useLanguage } from '../hooks/useLanguage'

// Full-screen modal with an OpenStreetMap map (Leaflet — free, no API
// key) on which the boss pins the montage site. Clicking (or "use my
// location") drops the pin; the circle previews the check-in radius.
// Leaflet is lazy-loaded so the ~150KB library never touches the
// bundle of users who don't open the picker.
export default function MapPicker({ lat, lng, radius = 150, onPick, onClose }) {
  const { t } = useLanguage()
  const boxRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const circleRef = useRef(null)
  const LRef = useRef(null)
  const [picked, setPicked] = useState(lat != null ? { lat, lng } : null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let disposed = false
    Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([mod]) => {
      if (disposed || !boxRef.current) return
      const L = mod.default ?? mod
      LRef.current = L
      const start = lat != null ? [lat, lng] : [51.163, 10.447] // DE center
      const map = L.map(boxRef.current).setView(start, lat != null ? 15 : 6)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map)
      const setPin = (la, ln) => {
        setPicked({ lat: la, lng: ln })
        if (markerRef.current) markerRef.current.setLatLng([la, ln])
        else markerRef.current = L.circleMarker([la, ln], { radius: 7, color: '#e8821c', fillColor: '#e8821c', fillOpacity: 0.9 }).addTo(map)
        if (circleRef.current) circleRef.current.setLatLng([la, ln])
        else circleRef.current = L.circle([la, ln], { radius, color: '#e8821c', fillColor: '#e8821c', fillOpacity: 0.12, weight: 1.5 }).addTo(map)
      }
      if (lat != null) setPin(lat, lng)
      map.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng))
      mapRef.current = map
      setReady(true)
    })
    return () => { disposed = true; mapRef.current?.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const useMyLocation = () => {
    navigator.geolocation?.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords
      mapRef.current?.setView([latitude, longitude], 16)
      // Reuse the map's click path so pin + circle stay in sync.
      mapRef.current?.fire('click', { latlng: { lat: latitude, lng: longitude } })
    })
  }

  const confirm = () => {
    if (picked) onPick(Math.round(picked.lat * 1e6) / 1e6, Math.round(picked.lng * 1e6) / 1e6)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-3"
         onClick={onClose}>
      <div className="bg-bg-1 border border-border rounded-2xl w-full max-w-2xl overflow-hidden"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Icon name="mapPin" size={15} color="#e8821c" /> {t('map_title')}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2">
            <Icon name="x" size={15} color="#9aa3ad" />
          </button>
        </div>
        <div ref={boxRef} className="h-[55vh] w-full bg-bg-2">
          {!ready && (
            <div className="h-full flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border flex-wrap">
          <button onClick={useMyLocation}
                  className="flex items-center gap-1.5 text-xs bg-bg-2 border border-border px-3 py-2 rounded-lg text-secondary hover:bg-bg-3 transition-colors">
            <Icon name="mapPin" size={13} color="currentColor" /> {t('map_my_location')}
          </button>
          <span className="text-[11px] text-muted flex-1">
            {picked
              ? `${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}`
              : t('map_click_hint')}
          </span>
          <button onClick={confirm} disabled={!picked}
                  className="text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#f0982e,#c96a0f)', color: '#181c20' }}>
            {t('map_confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
