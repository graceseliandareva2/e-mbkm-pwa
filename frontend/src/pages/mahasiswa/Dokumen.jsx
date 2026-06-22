import { useEffect, useState, useRef } from 'react'
import {
  Upload, FileText, Trash2, Eye, CheckCircle, Clock,
  XCircle, Lock, RotateCcw, Send, Download, X
} from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'

const BASE_URL = ''

const getStatusInfo = (status) => {
  switch (status) {
    
    case 'revisi_kaprodi':
    case 'revisi_dospem':
      return { label: 'Revisi', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: XCircle, canResubmit: true }
    case 'diverifikasi':
      return { label: 'Diverifikasi', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle, canResubmit: false }
    case 'disetujui_dospem':
      return { label: 'Diverifikasi', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle, canResubmit: false }
    case 'disetujui_kaprodi':
      return { label: 'Disetujui Kaprodi', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', icon: CheckCircle, canResubmit: false }
    default:
      return { label: 'Menunggu Review', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: Clock, canResubmit: false }
  }
}

function StatusBadge({ status }) {
  const info = getStatusInfo(status)
  const Icon = info.icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${info.color} ${info.bg} ${info.border}`}>
      <Icon className="w-3 h-3" />
      {info.label}
    </span>
  )
}

// ─── DetailModal ──────────────────────────────────────────────────────────────

function DetailModal({ doc, jenisLabel, onClose, onResubmit }) {
  const info         = getStatusInfo(doc.status)
  const fileUrl      = doc.path_file?.startsWith('http')
    ? doc.path_file
    : `${BASE_URL}/${doc.path_file}`
  const feedbackText = doc.status === 'revisi_kaprodi'
    ? doc.feedback_kaprodi
    : doc.status === 'revisi_dospem'
    ? doc.feedback_dospem
    : null

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col" style={{ height: '90vh' }}>

        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-gray-800 text-sm">{jenisLabel}</p>
              <StatusBadge status={doc.status} />
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{doc.nama_file}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {info.canResubmit && (
              <button
                onClick={() => { onClose(); onResubmit(doc) }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 rounded-lg text-xs font-semibold transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Submit Ulang
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {info.canResubmit && feedbackText && (
          <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex-shrink-0">
            <p className="text-xs font-semibold text-red-600 mb-0.5">Catatan Revisi:</p>
            <p className="text-sm text-red-800 leading-relaxed">{feedbackText}</p>
          </div>
        )}

        {info.canResubmit && !feedbackText && (
          <div className="px-5 py-2.5 bg-red-50 border-b border-red-100 flex-shrink-0">
            <p className="text-xs text-red-500">Dokumen ini perlu direvisi. Silakan submit ulang file yang sudah diperbaiki.</p>
          </div>
        )}

        {/* Preview area — PDF only, tidak perlu handle docx lagi */}
        <div className="flex-1 overflow-hidden bg-gray-50 flex flex-col rounded-b-2xl">
          <iframe
            src={fileUrl}
            className="w-full h-full"
            title={doc.nama_file}
          />
        </div>
      </div>
    </div>
  )
}

// ─── ResubmitModal ────────────────────────────────────────────────────────────

function ResubmitModal({ doc, onClose, onSuccess }) {
  const [file, setFile]             = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [dragging, setDragging]     = useState(false)
  const fileRef = useRef(null)

  const feedbackText = doc.status === 'revisi_kaprodi'
    ? doc.feedback_kaprodi
    : doc.feedback_dospem

  // ✅ Validasi hanya PDF
  const validateFile = (f) => {
    if (f.type !== 'application/pdf') {
      toast.error('File harus berupa PDF!')
      return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (!file) return toast.error('Pilih file terlebih dahulu!')
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await api.put(`/mahasiswa/dokumen/${doc.id}/resubmit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success('Dokumen berhasil disubmit ulang!')
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal submit ulang')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Submit Ulang Dokumen</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className={`rounded-xl p-3.5 border ${feedbackText ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
            <p className={`text-xs font-semibold mb-1 ${feedbackText ? 'text-red-600' : 'text-gray-500'}`}>
              Catatan Revisi:
            </p>
            <p className={`text-sm leading-relaxed ${feedbackText ? 'text-red-800' : 'text-gray-400 italic'}`}>
              {feedbackText || 'Tidak ada catatan khusus.'}
            </p>
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault(); setDragging(false)
              const f = e.dataTransfer.files[0]
              if (f && validateFile(f)) setFile(f)
            }}
            onClick={() => fileRef.current.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
              ${dragging ? 'border-blue-500 bg-blue-50' : file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}`}
          >
            {/* ✅ accept hanya .pdf */}
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg.,png" className="hidden"
              onChange={e => { const f = e.target.files[0]; if (f && validateFile(f)) setFile(f) }} />
            {file ? (
              <div>
                <p className="text-2xl mb-1">✅</p>
                <p className="font-semibold text-green-700 text-sm">{file.name}</p>
                <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                <button type="button" onClick={e => { e.stopPropagation(); setFile(null) }}
                  className="mt-2 text-xs text-red-500 hover:underline">Hapus file</button>
              </div>
            ) : (
              <div>
                <Upload className="w-7 h-7 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-600">Drag & drop atau klik pilih file</p>
                {/* ✅ Teks hint hanya PDF */}
                <p className="text-xs text-gray-400 mt-1">PDF</p>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Batal
            </button>
            <button onClick={handleSubmit} disabled={!file || submitting}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              <Send className="w-3.5 h-3.5" />
              {submitting ? 'Mengirim...' : 'Submit Ulang'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Konstanta ────────────────────────────────────────────────────────────────

const JENIS_OPTIONS = [
  { value: 'laporan_akhir', label: 'Laporan Akhir' },
  { value: 'ppt',           label: 'PPT' },
]

// ✅ Hanya PDF
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/jpg',
  'image/png',
]

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MahasiswaDokumen() {
  const [dokumen, setDokumen]         = useState([])
  const [pengajuan, setPengajuan]     = useState(null)
  const [loading, setLoading]         = useState(true)
  const [uploading, setUploading]     = useState(false)
  const [dragging, setDragging]       = useState(false)
  const [detailDoc, setDetailDoc]     = useState(null)
  const [resubmitDoc, setResubmitDoc] = useState(null)
  const [form, setForm]               = useState({ jenis: '', file: null })
  const fileRef = useRef(null)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    try {
      const [dokumenRes, pengajuanRes] = await Promise.allSettled([
        api.get('/mahasiswa/dokumen'),
        api.get('/mahasiswa/pengajuan'),
      ])
      if (dokumenRes.status === 'fulfilled') {
        const data = dokumenRes.value.data?.data ?? dokumenRes.value.data
        console.log('DATA DOKUMEN:', data) 
        setDokumen(Array.isArray(data) ? data : [])
      }
      if (pengajuanRes.status === 'fulfilled' && pengajuanRes.value.data?.id) {
        setPengajuan(pengajuanRes.value.data)
      }
    } catch { setDokumen([]) }
    finally { setLoading(false) }
  }

  // ✅ Validasi hanya PDF
  const validateFile = (file) => {
    if (!file) return false
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('File harus berupa PDF!')
      return false
    }
    return true
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!form.jenis) return toast.error('Pilih jenis dokumen terlebih dahulu!')
    if (!form.file)  return toast.error('File wajib dipilih!')
    if (!pengajuan?.periode_id) return toast.error('Data pengajuan tidak ditemukan!')

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', form.file)
      formData.append('jenis', form.jenis)
      formData.append('periode_id', pengajuan.periode_id)
      formData.append('pengajuan_id', pengajuan.id)
      await api.post('/mahasiswa/dokumen', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Dokumen berhasil diupload!')
      setForm({ jenis: '', file: null })
      fetchAll()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal upload dokumen')
    } finally { setUploading(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Hapus dokumen ini?')) return
    try {
      await api.delete(`/mahasiswa/dokumen/${id}`)
      toast.success('Dokumen dihapus!')
      fetchAll()
    } catch { toast.error('Gagal menghapus dokumen') }
  }

  const isDisabled = pengajuan?.status !== 'disetujui_kaprodi'

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (isDisabled) return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Upload Dokumen</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upload laporan dan dokumen pendukung Capstone Project</p>
      </div>
      <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200 shadow-sm">
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-gray-400" />
        </div>
        <p className="font-semibold text-gray-700">Upload Dokumen Belum Tersedia</p>
        <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
          Upload dokumen dapat dilakukan setelah pengajuan Capstone Project kamu disetujui oleh Kaprodi.
        </p>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Upload Dokumen</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upload laporan dan dokumen pendukung Capstone Project</p>
      </div>

      {/* Form upload */}
      <form onSubmit={handleUpload} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 border-b pb-3">Upload Dokumen Baru</h2>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Jenis Dokumen *</label>
          <select
            value={form.jenis}
            onChange={e => setForm(f => ({ ...f, jenis: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 bg-white text-gray-800"
          >
            <option value="">-- Pilih Jenis Dokumen --</option>
            {JENIS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault(); setDragging(false)
            const f = e.dataTransfer.files[0]
            if (f && validateFile(f)) setForm(prev => ({ ...prev, file: f }))
          }}
          onClick={() => fileRef.current.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
            ${dragging ? 'border-blue-500 bg-blue-50' : form.file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}`}
        >
         
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg.,png"
            onChange={e => { const f = e.target.files[0]; if (f && validateFile(f)) setForm(prev => ({ ...prev, file: f })) }}
            className="hidden" />
          {form.file ? (
            <div>
              <p className="text-2xl mb-1">✅</p>
              <p className="font-semibold text-green-700 text-sm">{form.file.name}</p>
              <p className="text-xs text-gray-400 mt-1">{(form.file.size / 1024).toFixed(1)} KB</p>
              <button type="button" onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, file: null })) }}
                className="mt-2 text-xs text-red-500 hover:underline">Hapus file</button>
            </div>
          ) : (
            <div>
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="font-medium text-gray-600 text-sm">
                {dragging ? 'Lepaskan file di sini' : 'Drag & drop atau klik untuk pilih file'}
              </p>
              {/* ✅ Teks hint hanya PDF */}
              <p className="text-xs text-gray-400 mt-1">PDF</p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={uploading || !form.file || !form.jenis}
          className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {uploading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {uploading ? 'Mengupload...' : 'Upload Dokumen'}
        </button>
      </form>

      {/* List dokumen */}
      <div className="space-y-3">
        <h2 className="font-semibold text-gray-700">Dokumen Terupload ({dokumen.length})</h2>
        {dokumen.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-gray-200">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Belum ada dokumen</p>
          </div>
        ) : dokumen.map(doc => {
          const info       = getStatusInfo(doc.status)
          const jenisLabel = JENIS_OPTIONS.find(o => o.value === doc.jenis)?.label || doc.jenis
          const canDelete  = doc.status === 'diupload'
          const feedbackText = doc.status === 'revisi_kaprodi'
            ? doc.feedback_kaprodi
            : doc.status === 'revisi_dospem'
            ? doc.feedback_dospem
            : null

          return (
            <div key={doc.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 flex items-start gap-3">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                  <FileText className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-gray-800 truncate">{jenisLabel}</p>
                    <StatusBadge status={doc.status} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {doc.nama_file} · {new Date(doc.created_at).toLocaleDateString('id-ID')}
                  </p>
                  {info.canResubmit && feedbackText && (
                    <p className="text-xs text-red-500 mt-1 line-clamp-1">
                      💬 {feedbackText}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setDetailDoc({ doc, jenisLabel })}
                    className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    title="Lihat dokumen"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {canDelete && (
                    <button onClick={() => handleDelete(doc.id)}
                      className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {detailDoc && (
        <DetailModal
          doc={detailDoc.doc}
          jenisLabel={detailDoc.jenisLabel}
          onClose={() => setDetailDoc(null)}
          onResubmit={(doc) => setResubmitDoc(doc)}
        />
      )}

      {resubmitDoc && (
        <ResubmitModal
          doc={resubmitDoc}
          onClose={() => setResubmitDoc(null)}
          onSuccess={fetchAll}
        />
      )}
    </div>
  )
}