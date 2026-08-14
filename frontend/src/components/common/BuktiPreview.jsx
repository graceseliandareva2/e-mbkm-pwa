import { useState } from 'react'
import { ExternalLink, FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Worker PDF.js - wajib di-set sekali di awal, pakai versi yang sama dengan pdfjs-dist
// yang otomatis terinstall lewat react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

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

  // Cloudinary image
  if (/\/image\/upload\//i.test(url)) return 'image'

  // Cloudinary raw pdf
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

// Komponen khusus render PDF pakai PDF.js (canvas), bukan iframe,
// supaya tampilannya konsisten di mobile & desktop.
function PdfBuktiPreview({ url, filename }) {
  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [error, setError] = useState(false)

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
    <div className="w-full h-full flex flex-col bg-gray-100">
      <div className="flex-1 overflow-auto flex justify-center p-2">
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          onLoadError={() => setError(true)}
          loading={
            <p className="text-sm text-gray-400 py-10">Memuat PDF...</p>
          }
        >
          <Page
            pageNumber={pageNumber}
            renderAnnotationLayer={false}
            renderTextLayer={false}
            width={Math.min(window.innerWidth - 32, 700)}
          />
        </Document>
      </div>

      {numPages > 1 && (
        <div className="flex items-center justify-center gap-4 py-2 border-t bg-white">
          <button
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="p-1 disabled:opacity-30"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm text-gray-600">
            {pageNumber} / {numPages}
          </span>
          <button
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="p-1 disabled:opacity-30"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
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

  // File selain pdf/gambar (misal .docx, .zip) yang tetap disimpan di Cloudinary
  // -> tidak bisa di-embed, jadi kasih tombol buka. URL Cloudinary tidak
  // ditampilkan sebagai teks ke user, cuma dipakai sebagai href.
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

// Dipakai untuk SEMUA link yang diinput manual oleh user (YouTube, Pinterest,
// Google Docs/Drive, GitHub, website apapun) -> selalu hyperlink polos,
// tidak pernah di-iframe, tidak ada tombol "Buka Link".
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
  // Upload file (Cloudinary) -> selalu preview in-app
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