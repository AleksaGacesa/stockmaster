// Shared bulk QR-label printing — used by Artikelübersicht (multi-select)
// and Bestellung detail (print labels for every position in one order).
// Opens the print window synchronously (before the async QR generation)
// so browsers don't treat it as a blocked popup.
export async function printQrLabels(items) {
  const list = items.filter(it => it?.nummer)
  if (!list.length) return

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write('<html><body style="font-family:Arial;padding:60px;text-align:center;color:#888">Etiketten werden erstellt…</body></html>')

  const sorted = [...list].sort((a, b) =>
    (a.nummer || '').localeCompare(b.nummer || '', undefined, { numeric: true }))

  const QRCode = await import('qrcode')
  const withUrls = await Promise.all(sorted.map(async it => ({
    ...it,
    url: await QRCode.toDataURL(it.nummer, { width: 300, margin: 1 }).catch(() => null),
  })))

  const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const cells = withUrls.filter(it => it.url).map(it => `
    <div class="label">
      <img src="${it.url}" />
      <div class="n">${esc(it.nummer)}</div>
      ${it.name ? `<div class="nm">${esc(it.name)}</div>` : ''}
    </div>`).join('')

  win.document.open()
  win.document.write(`<html><head><title>QR-Etiketten</title>
    <style>
      *{box-sizing:border-box}
      body{margin:0;font-family:Arial,Helvetica,sans-serif}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px}
      .label{border:1px dashed #999;border-radius:10px;padding:14px 8px;text-align:center;break-inside:avoid}
      img{width:130px;height:130px}
      .n{font-family:monospace;font-weight:700;font-size:14px;margin-top:8px}
      .nm{font-size:11px;color:#444;margin-top:2px;line-height:1.3}
      @media print{
        .label{border:none}
        .grid{gap:6px}
      }
    </style></head>
    <body>
      <div class="grid">${cells}</div>
      <script>window.onload=()=>window.print()<\/script>
    </body></html>`)
  win.document.close()
}
