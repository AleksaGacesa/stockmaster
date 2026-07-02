import Card from './Card'
import Icon from './Icon'

export default function QrScannerCard({ scanning, scanError, videoRef, canvasRef, onSearchFallback, onClose }) {
  return (
    <Card className="p-4 w-full max-w-md">
      <div className="flex justify-between items-center mb-3">
        <span className="font-semibold text-sm">QR-Code scannen</span>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-2">
          <Icon name="x" size={15} color="#9aa3ad" />
        </button>
      </div>
      <div className="relative aspect-[4/3] bg-bg-0 rounded-xl overflow-hidden mb-3">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover"
               style={{ display: scanning ? 'block' : 'none' }} />
        <canvas ref={canvasRef} className="hidden" />
        {!scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted">
            <Icon name="camera" size={28} color="#6b7480" />
            <p className="text-xs mt-2">Kamera wird gestartet…</p>
          </div>
        )}
        {scanning && (
          <div className="absolute border-2 border-amber rounded-xl pointer-events-none"
               style={{ inset: '15% 22%', boxShadow: '0 0 0 2000px rgba(0,0,0,0.4)' }} />
        )}
      </div>
      {scanError && <p className="text-red text-xs mb-2">{scanError}</p>}
      <button onClick={onSearchFallback}
              className="w-full bg-bg-2 border border-border text-secondary text-sm py-2.5 rounded-xl">
        Stattdessen suchen
      </button>
    </Card>
  )
}
