// Shared jsPDF header — logo (if any) + title + subtitle + divider —
// reused by every report generated from the Administration page.
export const loadImageEl = (url) => new Promise((resolve, reject) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = reject
  img.src = url
})

export const drawPdfHeader = async (doc, { logoUrl, title, subtitle }) => {
  const pageW = doc.internal.pageSize.getWidth()

  if (logoUrl) {
    try {
      const img = await loadImageEl(logoUrl)
      const maxW = 36, maxH = 18
      let w = maxW, h = (img.naturalHeight / img.naturalWidth) * w
      if (h > maxH) { h = maxH; w = (img.naturalWidth / img.naturalHeight) * h }
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', pageW - 14 - w, 14, w, h)
    } catch { /* logo couldn't be loaded — skip it, rest of the PDF still generates */ }
  }

  doc.setFontSize(20)
  doc.setTextColor(20)
  doc.text(title, 14, 22)
  if (subtitle) {
    doc.setFontSize(10)
    doc.setTextColor(140)
    doc.text(subtitle, 14, 29)
  }
  doc.setDrawColor(210)
  doc.line(14, 36, pageW - 14, 36)
  return 46
}
