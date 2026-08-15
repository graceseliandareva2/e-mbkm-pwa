import { useState } from 'react'
import {
  ExternalLink,
  FileText,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Download,
  RotateCw,
  Printer,
  Menu
} from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp']
const PDF_EXT = ['pdf']

const getFileExt = (url) => {
  if (!url || typeof url !== 'string') return ''

  try {
    const clean = url.split('?')[0].split('#')[0]
    const parts = clean.split('.')
    return parts.length > 1 ? parts.pop().toLowerCase() : ''
  } catch {
    return ''
  }
}

const getFileType = (url) => {
  if (!url) return 'unknown'

  const ext = getFileExt(url)

  if (IMAGE_EXT.includes(ext)) return 'image'
  if (PDF_EXT.includes(ext)) return 'pdf'

  if (/\/image\/upload\//i.test(url)) return 'image'

  if (/\/raw\/upload\//i.test(url) && ext === 'pdf') return 'pdf'

  return 'unknown'
}

const resolveFileUrl = (path) => {
  if (!path || typeof path !== 'string') return ''

  if (path.startsWith('http')) return path

  return `/uploads/${path.replace(/^.*uploads\//, '')}`
}

const toInlineCloudinaryUrl = (url) => {
  if (!url) return url
  if (!/res\.cloudinary\.com/i.test(url)) return url

  return url.replace(/\/fl_attachment(:[^/]*)?\//, '/')
}

const ZOOM_STEP = 0.2
const ZOOM_MIN = 0.4
const ZOOM_MAX = 2.5
const BASE_WIDTH = 700

function PdfBuktiPreview({ url, filename }) {
  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [error, setError] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const handlePrint = () => {
    const win = window.open(url, '_blank')
    if (win) {
      win.addEventListener('load', () => {
        win.focus()
        win.print()
      })
    }
  }

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename || 'dokumen.pdf'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(url, '_blank')
    } finally {
      setDownloading(false)
    }
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gray-50 p-6">
        <FileText className="w-10 h-10 text-gray-400" />
        <p className="text-sm text-gray-500">Gagal memuat preview PDF{filename ? `: ${filename}` : ''}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
        >
          <ExternalLink className="w-4 h-4" />
          Buka File
        </a>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col bg-neutral-800">
      <div className="flex items-center gap-1 sm:gap-3 px-2 sm:px-3 py-2 border-b border-neutral-700 bg-neutral-900 overflow-x-auto">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className={`p-1.5 rounded hover:bg-neutral-700 shrink-0 ${sidebarOpen ? 'bg-neutral-700 text-white' : 'text-neutral-300'}`}
          aria-label="Buka daftar halaman"
        >
          <Menu className="w-4 h-4" />
        </button>

        <span className="text-xs sm:text-sm text-neutral-200 truncate max-w-[90px] sm:max-w-[220px] shrink-0">
          {filename || 'Dokumen.pdf'}
        </span>

        {numPages > 1 && (
          <div className="flex items-center gap-1 shrink-0 border-l border-neutral-700 pl-1 sm:pl-3 ml-auto sm:ml-0">
            <button
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              disabled={pageNumber <= 1}
              className="p-1.5 rounded hover:bg-neutral-700 text-neutral-300 disabled:opacity-30"
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs sm:text-sm text-neutral-200 whitespace-nowrap px-1">
              {pageNumber} / {numPages}
            </span>
            <button
              onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
              disabled={pageNumber >= numPages}
              className="p-1.5 rounded hover:bg-neutral-700 text-neutral-300 disabled:opacity-30"
              aria-label="Halaman berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0 border-l border-neutral-700 pl-1 sm:pl-3 ml-auto">
          <button
            onClick={() => setScale((s) => Math.max(ZOOM_MIN, +(s - ZOOM_STEP).toFixed(2)))}
            disabled={scale <= ZOOM_MIN}
            className="p-1.5 rounded hover:bg-neutral-700 text-neutral-300 disabled:opacity-30"
            aria-label="Perkecil"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs sm:text-sm text-neutral-200 w-10 text-center shrink-0">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(ZOOM_MAX, +(s + ZOOM_STEP).toFixed(2)))}
            disabled={scale >= ZOOM_MAX}
            className="p-1.5 rounded hover:bg-neutral-700 text-neutral-300 disabled:opacity-30"
            aria-label="Perbesar"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0 border-l border-neutral-700 pl-1 sm:pl-3">
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-1.5 rounded hover:bg-neutral-700 text-neutral-300"
            aria-label="Putar"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={handlePrint}
            className="p-1.5 rounded hover:bg-neutral-700 text-neutral-300"
            aria-label="Print"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="p-1.5 rounded hover:bg-neutral-700 text-neutral-300 disabled:opacity-40"
            aria-label="Download"
          >
            <Download className="w-4 h-4" />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded hover:bg-neutral-700 text-neutral-300"
            aria-label="Buka di tab baru"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          onLoadError={() => setError(true)}
          loading={
            <p className="text-sm text-neutral-400 py-10">Memuat PDF...</p>
          }
          className="contents"
        >
          {sidebarOpen && (
            <div className="w-28 sm:w-36 shrink-0 border-r border-neutral-700 bg-neutral-900 overflow-y-auto p-2 space-y-3">
              {Array.from({ length: numPages || 0 }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPageNumber(p)}
                  className={`w-full rounded overflow-hidden border-2 ${
                    p === pageNumber ? 'border-blue-500' : 'border-transparent hover:border-neutral-600'
                  }`}
                >
                  <Page
                    pageNumber={p}
                    width={112}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    loading=""
                  />
                  <span className="block text-center text-[11px] text-neutral-400 bg-neutral-800 py-0.5">
                    {p}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-auto flex justify-center p-2">
            <Page
              pageNumber={pageNumber}
              rotate={rotation}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              width={Math.min(window.innerWidth - 32, BASE_WIDTH) * scale}
            />
          </div>
        </Document>
      </div>
    </div>
  )
}

export function FileBuktiPreview({
  path,
  filename = 'Preview Bukti'
}) {
  if (!path) return null

  const url = resolveFileUrl(path)
  const type = getFileType(url)

  if (type === 'image') {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 overflow-auto">
        <img
          src={url}
          alt={filename}
          className="max-w-full max-h-full object-contain"
        />
      </div>
    )
  }

  if (type === 'pdf') {
    return (
      <PdfBuktiPreview url={toInlineCloudinaryUrl(url)} filename={filename} />
    )
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gray-50 p-6">
      <FileText className="w-10 h-10 text-gray-400" />

      <p className="text-sm text-gray-500">
        Preview tidak tersedia
      </p>

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
      >
        <ExternalLink className="w-4 h-4" />
        Buka File
      </a>
    </div>
  )
}

export function LinkBukti({ url }) {
  if (!url) return null

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-blue-600 hover:underline break-all"
      >
        {url}
      </a>
    </div>
  )
}

export default function BuktiPreview({
  path,
  link,
  filename,
  emptyText = 'Tidak ada bukti'
}) {
  if (path) {
    return (
      <FileBuktiPreview
        path={path}
        filename={filename}
      />
    )
  }

  if (link) {
    return <LinkBukti url={link} />
  }

  return (
    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
      {emptyText}
    </div>
  )
}