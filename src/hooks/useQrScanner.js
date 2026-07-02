import { useState, useRef, useCallback, useEffect } from 'react'
import jsQR from 'jsqr'

// Shared camera + jsQR polling loop used by BewegungPage and
// InventurPage. `onFound` is called with the matched article; if the
// scanned code doesn't match any article, scanError is set instead.
export function useQrScanner(articles, onFound) {
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef    = useRef(null)

  const stopScan = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setScanning(false)
  }, [])

  const tick = useCallback(() => {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick); return
    }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height)
    if (code?.data) {
      stopScan()
      const found = articles.find(a => a.nummer === code.data || String(a.id) === code.data)
      if (found) onFound(found)
      else setScanError(`Kein Artikel mit Code "${code.data}" gefunden.`)
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [articles, stopScan, onFound])

  const startScan = useCallback(async () => {
    setScanError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setScanning(true)
      rafRef.current = requestAnimationFrame(tick)
    } catch { setScanError('Kamerazugriff nicht möglich.') }
  }, [tick])

  useEffect(() => () => stopScan(), [stopScan])

  return { scanning, scanError, setScanError, videoRef, canvasRef, startScan, stopScan }
}
