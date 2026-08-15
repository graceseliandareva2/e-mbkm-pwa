import { useEffect, useState, useRef } from 'react'
import {
  Upload, FileText, Trash2, Eye, CheckCircle, Clock,
  XCircle, Lock, RotateCcw, Send, X, Plus
} from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { useSyncOnline } from '../../utils/useSyncOnline'
import { saveToQueue, getPendingCount } from '../../utils/offlineQueue'
import { FileBuktiPreview } from '../../components/common/BuktiPreview'

const LS_DOKUMEN   = 'cache_dokumen'
const LS_PENGAJUAN = 'cache_pengajuan_dokumen'

const JENIS_OPTIONS = [
  { value: 'laporan_akhir', label: 'Laporan Akhir' },
  { value: 'ppt',           label: 'PPT' },
]

const ALLOWED_TYPES = ['application/pdf']

const getStatusInfo = (status) => {
  switch (status) {
    case 'revisi_kaprodi':
    case 'revisi_dospem':
      return { label: 'Revisi', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: XCircle, canResubmit: true }
    case 'diverifikasi':
      return { label: 'Diverifikasi', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle, canResubmit: false }
    case 'disetujui_dospem':
      return { label: 'Menunggu Verifikasi Kaprodi', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', icon: Clock, canResubmit: false }
    case 'disetujui_kaprodi':
      return { label: 'Disetujui Kaprodi', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', icon: CheckCircle, canResubmit: false }
    default:
      return { label: 'Menunggu Review', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: Clock, canResubmit: false }
  }
}

const getFeedbackText = (doc) => {
  if (!doc) return null
  if (doc.jenis === 'laporan_akhir') {
    if (doc.status === 'revisi_kaprodi') return doc.feedback_kaprodi
    if (doc.status === 'revisi_dospem') return doc.feedback_dospem
    return null
  }
  return doc.status === 'revisi_dospem' ? doc.feedback : null
}
const getFileUrl = (doc) => {
  if (!doc) return null
  return doc.cloudinary_url || doc.path_file || null
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

function DetailModal({ doc, jenisLabel, onClose, onResubmit }) {
  if (!doc) return null

  const info = getStatusInfo(doc.status)
  const feedbackText = getFeedbackText(doc)

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
        <div className="flex-1 overflow-hidden bg-gray-50 flex flex-col rounded-b-2xl">
          <FileBuktiPreview path={getFileUrl(doc)} filename={doc.nama_file} />
        </div>
      </div>
    </div>
  )
}

// ResubmitModal

function ResubmitModal({ doc, onClose, onSuccess }) {
  const [file, setFile]             = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [dragging, setDragging]     = useState(false)
  const fileRef = useRef(null)

  if (!doc) return null

  const feedbackText = getFeedbackText(doc)
  const validateFile = (f) => {
    if (f.type !== 'application/pdf') {
      toast.error('File harus berupa PDF!')
      return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (!file) return toast.error('Pilih file terlebih dahulu!')
    if (!navigator.onLine) {
      return toast.error('Submit ulang memerlukan koneksi internet karena mengirim file.')
    }
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
          {!navigator.onLine && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3.5 py-2.5 text-xs text-yellow-700 font-medium">
              ⚠️ Kamu sedang offline. 
            </div>
          )}

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
            {/*accept hanya .pdf */}
            <input ref={fileRef} type="file" accept=".pdf" className="hidden"
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

// Main Component

export default function MahasiswaDokumen() {
  const [dokumen, setDokumen]         = useState([])
  const [pengajuan, setPengajuan]     = useState(null)
  const [loading, setLoading]         = useState(true)
  const [uploading, setUploading]     = useState(false)
  const [dragging, setDragging]       = useState(false)
  const [modalOpen, setModalOpen]     = useState(false)
  const [detailDoc, setDetailDoc]     = useState(null)
  const [resubmitDoc, setResubmitDoc] = useState(null)
  const [form, setForm]               = useState({ jenis: '', file: null })
  const [pendingCount, setPendingCount] = useState(0)
  const fileRef = useRef(null)

  useEffect(() => {
    try {
      const cachedDokumen   = localStorage.getItem(LS_DOKUMEN)
      const cachedPengajuan = localStorage.getItem(LS_PENGAJUAN)
      if (cachedDokumen) setDokumen(JSON.parse(cachedDokumen))
      if (cachedPengajuan) setPengajuan(JSON.parse(cachedPengajuan))
    } catch { /* ignore parse error */ }
  }, [])

  const fetchAll = async () => {
    try {
      const [dokumenRes, pengajuanRes] = await Promise.allSettled([
        api.get('/mahasiswa/dokumen'),
        api.get('/mahasiswa/pengajuan'),
      ])
      if (dokumenRes.status === 'fulfilled') {
        const data = dokumenRes.value.data?.data ?? dokumenRes.value.data
        const list = Array.isArray(data) ? data : []
        setDokumen(list)
        try { localStorage.setItem(LS_DOKUMEN, JSON.stringify(list)) } catch { /* ignore */ }
      }
      if (pengajuanRes.status === 'fulfilled' && pengajuanRes.value.data?.id) {
        const p = pengajuanRes.value.data
        setPengajuan(p)
        try { localStorage.setItem(LS_PENGAJUAN, JSON.stringify(p)) } catch { /* ignore */ }
      }
    } catch { setDokumen([]) }
    finally { setLoading(false) }
  }

  
  const refreshPendingCount = async () => {
    try {
      const count = await getPendingCount()
      setPendingCount(count)
    } catch (err) {
      console.error('[MahasiswaDokumen] Gagal ambil pending count:', err)
    }
  }

  
  useSyncOnline(async () => {
    await fetchAll()
    await refreshPendingCount()
  })

  useEffect(() => {
    fetchAll()
    refreshPendingCount()
  }, [])

  const resetForm = () => setForm({ jenis: '', file: null })

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
    if (!navigator.onLine) {
      try {
        await saveToQueue({
          method: 'POST',
          url: '/mahasiswa/dokumen',
          data: {
            jenis: form.jenis,
            periode_id: pengajuan.periode_id,
            pengajuan_id: pengajuan.id,
          },
          file: { blob: form.file, filename: form.file.name, fieldName: 'file' },
        })
        toast.success('Offline! Dokumen tersimpan lokal, akan otomatis terupload saat online.')
        setModalOpen(false)
        resetForm()
        refreshPendingCount()
      } catch {
        toast.error('Gagal menyimpan data offline')
      }
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', form.file)
      formData.append('jenis', form.jenis)
      formData.append('periode_id', pengajuan.periode_id)
      formData.append('pengajuan_id', pengajuan.id)
      await api.post('/mahasiswa/dokumen', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Dokumen berhasil diupload!')
      setModalOpen(false)
      resetForm()
      fetchAll()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal upload dokumen')
    } finally { setUploading(false) }
  }

  const handleDelete = async (id) => {
    if (!navigator.onLine) return toast.error('Hapus dokumen memerlukan koneksi internet.')
    if (!confirm('Hapus dokumen ini?')) return
    try {
      await api.delete(`/mahasiswa/dokumen/${id}`)
      toast.success('Dokumen dihapus!')
      fetchAll()
    } catch { toast.error('Gagal menghapus dokumen') }
  }

 
  const isDisabled = pengajuan?.status !== 'disetujui_kaprodi' || !pengajuan?.dosen_id
  const VERIFIED_STATUSES = ['diverifikasi']
  const activeDokumen = dokumen.filter(d => !VERIFIED_STATUSES.includes(d.status))
  const historyDokumen = dokumen.filter(d => VERIFIED_STATUSES.includes(d.status))

  const renderDokumenItem = (doc) => {
    const info       = getStatusInfo(doc.status)
    const jenisLabel = JENIS_OPTIONS.find(o => o.value === doc.jenis)?.label || doc.jenis
    const canDelete  = doc.status === 'diupload'
    const feedbackText = getFeedbackText(doc)

    return (
      <div key={doc.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (isDisabled) return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Upload Dokumen</h1>
      </div>
      <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200 shadow-sm">
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-gray-400" />
        </div>
        <p className="font-semibold text-gray-700">Upload Dokumen Belum Tersedia</p>
        <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
          {pengajuan?.status !== 'disetujui_kaprodi'
            ? 'Upload dokumen dapat dilakukan setelah pengajuan Capstone Project kamu disetujui oleh Kaprodi.'
            : 'Upload dokumen dapat dilakukan setelah kamu mendapatkan dosen pembimbing dari Kaprodi.'}
        </p>
        {!navigator.onLine && (
          <p className="text-xs text-yellow-600 mt-3 bg-yellow-50 border border-yellow-100 rounded-xl px-3 py-2">
            Kamu sedang offline. 
          </p>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Upload Dokumen</h1>
          <p className="text-sm text-gray-500 mt-0.5">Upload laporan dan dokumen pendukung Capstone Project</p>
        </div>
        <button onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700">
          <Plus className="w-4 h-4" />
          Tambah
        </button>
      </div>

      {/* Banner offline*/}
      {!navigator.onLine && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-700 font-medium">
          ⚠️ Kamu sedang offline.
        </div>
      )}

      {/* Banner dokumen pending sync dari antrian offline */}
      {pendingCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 font-medium flex items-center gap-2">
          <Clock className="w-4 h-4 flex-shrink-0" />
          {pendingCount} dokumen menunggu diupload. Akan otomatis tersinkronisasi saat kamu online.
        </div>
      )}

      {/* List dokumen aktif */}
      <div className="space-y-3">
        {activeDokumen.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">Belum ada dokumen</p>
            <p className="text-sm text-gray-400 mt-1">Upload laporan akhir atau PPT kamu di sini</p>
          </div>
        ) : activeDokumen.map(renderDokumenItem)}
      </div>

      {/* Riwayat / sudah diverifikasi */}
      {historyDokumen.length > 0 && (
        <>
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-px bg-gray-200" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Riwayat · Terverifikasi</p>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="space-y-3">
            {historyDokumen.map(renderDokumenItem)}
          </div>
        </>
      )}

      {/* Modal Upload */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
              <h2 className="font-bold text-gray-800">Upload Dokumen</h2>
              <button onClick={() => { setModalOpen(false); resetForm() }} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleUpload} className="p-5 space-y-4">
              {!navigator.onLine && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3.5 py-2.5 text-xs text-yellow-700 font-medium">
                  ⚠️ Offline 
                </div>
              )}

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
                {/* accept hanya .pdf */}
                <input ref={fileRef} type="file" accept=".pdf"
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
                    <p className="text-xs text-gray-400 mt-1">PDF</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setModalOpen(false); resetForm() }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Batal</button>
                <button
                  type="submit"
                  disabled={uploading || !form.file || !form.jenis}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {uploading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {uploading ? 'Mengupload...' : navigator.onLine ? 'Upload Dokumen' : 'Simpan Offline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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