import { useEffect, useState, useRef } from 'react'
import { Plus, BookOpen, Clock, Trash2, MessageSquare, CheckCircle, Lock, Upload, X, FileText, Eye, Pencil } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { saveToQueue } from '../../utils/offlineQueue'
import { useSyncOnline } from '../../utils/useSyncOnline'

const BASE_URL = ''

// ✅ localStorage keys
const LS_PENGAJUAN = 'cache_pengajuan'
const LS_LOGBOOKS  = 'cache_logbooks'

const STATUS_CONFIG = {
  draft:        { label: 'Draft',        color: 'text-gray-500',   bg: 'bg-gray-50',    border: 'border-gray-200' },
  disubmit:     { label: 'Menunggu',     color: 'text-yellow-600', bg: 'bg-yellow-50',  border: 'border-yellow-200' },
  diverifikasi: { label: 'Diverifikasi', color: 'text-green-600',  bg: 'bg-green-50',   border: 'border-green-200' },
  revisi:       { label: 'Revisi',       color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200' },
}

const MAX_FILE_SIZE = 20 * 1024 * 1024

const formatDurasi = (menit) => {
  const totalMenit = Math.round(Number(menit))
  const j = Math.floor(totalMenit / 60)
  const m = totalMenit % 60
  if (m === 0) return `${j} jam`
  if (j === 0) return `${m} menit`
  return `${j} jam ${m} menit`
}

export default function MahasiswaLogbook() {
  const [logbooks, setLogbooks] = useState([])
  const [pengajuan, setPengajuan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [form, setForm] = useState({ tanggal: '', kegiatan: '', deskripsi: '', jam: '', menit: '0', bukti: null })
  const [previewPdf, setPreviewPdf] = useState(null)
  const [editLog, setEditLog] = useState(null)
  const [editForm, setEditForm] = useState({ kegiatan: '', deskripsi: '', jam: '', menit: '0', bukti: null, hapusBukti: false })
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editDragging, setEditDragging] = useState(false)
  const [buktiType, setBuktiType] = useState('file')
  const [buktiLink, setBuktiLink] = useState('')
  const [editBuktiType, setEditBuktiType] = useState('file')
  const [editBuktiLink, setEditBuktiLink] = useState('')
  const fileRef = useRef(null)
  const editFileRef = useRef(null)

  // ✅ Load dari cache localStorage saat pertama mount (sebelum fetch)
  useEffect(() => {
    try {
      const cachedPengajuan = localStorage.getItem(LS_PENGAJUAN)
      const cachedLogbooks  = localStorage.getItem(LS_LOGBOOKS)
      if (cachedPengajuan) setPengajuan(JSON.parse(cachedPengajuan))
      if (cachedLogbooks)  setLogbooks(JSON.parse(cachedLogbooks))
    } catch { /* ignore parse error */ }
  }, [])

  const fetchAll = async () => {
    try {
      const [logbookRes, pengajuanRes] = await Promise.allSettled([
        api.get('/mahasiswa/logbook'),
        api.get('/mahasiswa/pengajuan'),
      ])

      if (logbookRes.status === 'fulfilled') {
        const data = logbookRes.value.data?.data ?? logbookRes.value.data
        const list = Array.isArray(data) ? data : []
        setLogbooks(list)
        // ✅ Simpan ke cache
        try { localStorage.setItem(LS_LOGBOOKS, JSON.stringify(list)) } catch { /* ignore */ }
      }

      if (pengajuanRes.status === 'fulfilled' && pengajuanRes.value.data?.id) {
        const p = pengajuanRes.value.data
        setPengajuan(p)
        // ✅ Simpan ke cache
        try { localStorage.setItem(LS_PENGAJUAN, JSON.stringify(p)) } catch { /* ignore */ }
      }
    } catch { setLogbooks([]) }
    finally { setLoading(false) }
  }

  useSyncOnline(fetchAll)

  useEffect(() => {
    fetchAll().finally(() => setLoading(false))
  }, [])

  const resetForm = () => {
    setForm({ tanggal: '', kegiatan: '', deskripsi: '', jam: '', menit: '0', bukti: null })
    setBuktiType('file')
    setBuktiLink('')
  }

  const handleFileChange = (file) => {
    if (!file) return
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
    if (!allowed.includes(file.type)) { toast.error('File harus berupa PDF atau gambar (JPG/PNG)!'); return }
    if (file.size > MAX_FILE_SIZE) { toast.error('Ukuran file maksimal 20 MB!'); return }
    setForm(f => ({ ...f, bukti: file }))
  }

  const handleEditFileChange = (file) => {
    if (!file) return
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
    if (!allowed.includes(file.type)) { toast.error('File harus berupa PDF atau gambar (JPG/PNG)!'); return }
    if (file.size > MAX_FILE_SIZE) { toast.error('Ukuran file maksimal 20 MB!'); return }
    setEditForm(f => ({ ...f, bukti: file, hapusBukti: false }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // FIX 1: tambah validasi deskripsi
    if (!form.tanggal || !form.kegiatan || !form.deskripsi?.trim()) return toast.error('Tanggal, kegiatan, dan deskripsi wajib diisi!')
    const totalMenit = (parseInt(form.jam) || 0) * 60 + (parseInt(form.menit) || 0)
    if (totalMenit <= 0) return toast.error('Durasi harus lebih dari 0!')

    if (!navigator.onLine) {
      if (form.bukti) {
        toast.error('File bukti tidak bisa disimpan offline. Hapus file dulu, upload bukti saat online.')
        return
      }
      try {
        await saveToQueue({
          method: 'POST',
          url: '/mahasiswa/logbook',
          data: {
            tanggal: form.tanggal,
            kegiatan: form.kegiatan,
            deskripsi: form.deskripsi,
            jam: totalMenit,
            periode_id: pengajuan.periode_id,
            pengajuan_id: pengajuan.id,
          }
        })
        toast.success('Offline! Logbook tersimpan lokal, akan otomatis terkirim saat online.')
        setModalOpen(false)
        resetForm()
      } catch {
        toast.error('Gagal menyimpan data offline')
      }
      return
    }

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('tanggal', form.tanggal)
      formData.append('kegiatan', form.kegiatan)
      formData.append('deskripsi', form.deskripsi)
      formData.append('jam', totalMenit)
      formData.append('periode_id', pengajuan.periode_id)
      formData.append('pengajuan_id', pengajuan.id)
      if (buktiType === 'file' && form.bukti) formData.append('bukti', form.bukti)
      if (buktiType === 'link' && buktiLink) formData.append('bukti_link', buktiLink)
      await api.post('/mahasiswa/logbook', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Logbook berhasil ditambahkan!')
      setModalOpen(false)
      resetForm()
      fetchAll()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan logbook')
    } finally { setSubmitting(false) }
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    // FIX 4: tambah validasi deskripsi di edit
    if (!editForm.kegiatan || !editForm.deskripsi?.trim()) return toast.error('Judul kegiatan dan deskripsi wajib diisi!')
    const totalMenit = (parseInt(editForm.jam) || 0) * 60 + (parseInt(editForm.menit) || 0)
    if (totalMenit <= 0) return toast.error('Durasi harus lebih dari 0!')
    setEditSubmitting(true)
    try {
      if (editForm.bukti || editForm.hapusBukti || (editBuktiType === 'link' && editBuktiLink)) {
        const formData = new FormData()
        formData.append('tanggal', editLog.tanggal)
        formData.append('kegiatan', editForm.kegiatan)
        formData.append('deskripsi', editForm.deskripsi)
        formData.append('jam', String(totalMenit))
        formData.append('hasil', editLog.hasil || '')
        formData.append('kendala', editLog.kendala || '')
        formData.append('rencana_selanjutnya', editLog.rencana_selanjutnya || '')
        if (editForm.hapusBukti) formData.append('hapus_bukti', '1')
        if (editForm.bukti) formData.append('bukti', editForm.bukti)
        if (editBuktiType === 'link' && editBuktiLink) formData.append('bukti_link', editBuktiLink)
        await api.put(`/mahasiswa/logbook/${editLog.id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      } else {
        await api.put(`/mahasiswa/logbook/${editLog.id}`, {
          tanggal: editLog.tanggal,
          kegiatan: editForm.kegiatan,
          deskripsi: editForm.deskripsi,
          jam: String(totalMenit),
          hasil: editLog.hasil || null,
          kendala: editLog.kendala || null,
          rencana_selanjutnya: editLog.rencana_selanjutnya || null,
        })
      }
      toast.success('Logbook berhasil diperbarui!')
      setEditLog(null)
      fetchAll()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal memperbarui logbook')
    } finally { setEditSubmitting(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Hapus entri logbook ini?')) return
    try {
      await api.delete(`/mahasiswa/logbook/${id}`)
      toast.success('Logbook dihapus!')
      fetchAll()
    } catch { toast.error('Gagal menghapus logbook') }
  }

  const totalMenitSemua = logbooks.reduce((sum, l) => sum + Number(l.jam || 0), 0)
  const TARGET_MENIT = 48 * 60
  const progress = Math.min((totalMenitSemua / TARGET_MENIT) * 100, 100)
  const isDisabled = pengajuan?.status !== 'disetujui_kaprodi'

  const previewDurasi = () => {
    const totalMenit = (parseInt(form.jam) || 0) * 60 + (parseInt(form.menit) || 0)
    if (totalMenit <= 0) return null
    return formatDurasi(totalMenit)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (isDisabled) return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Logbook Kegiatan</h1>
        <p className="text-sm text-gray-500 mt-0.5">Catat kegiatan harian Capstone Project kamu</p>
      </div>
      <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200 shadow-sm">
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-gray-400" />
        </div>
        <p className="font-semibold text-gray-700">Logbook Belum Tersedia</p>
        <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
          Logbook dapat diisi setelah pengajuan Capstone Project kamu disetujui oleh Kaprodi.
        </p>
        {/* ✅ Tunjukkan info offline jika memang sedang offline */}
        {!navigator.onLine && (
          <p className="text-xs text-yellow-600 mt-3 bg-yellow-50 border border-yellow-100 rounded-xl px-3 py-2">
            Kamu sedang offline. Data pengajuan tidak ditemukan di cache lokal.
          </p>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Logbook Kegiatan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Catat kegiatan harian Capstone Project kamu</p>
        </div>
        <button onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700">
          <Plus className="w-4 h-4" />
          Tambah
        </button>
      </div>

      {/* Banner offline */}
      {!navigator.onLine && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-700 font-medium">
          ⚠️ Kamu sedang offline. Menampilkan data tersimpan terakhir. Logbook (tanpa file) bisa tetap ditambah dan akan terkirim otomatis saat online.
        </div>
      )}

      {/* Progress */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-gray-800">Total Jam</span>
          </div>
          <span className="font-bold text-blue-600">{formatDurasi(totalMenitSemua)} / 48 jam</span>
        </div>
        <div className="bg-gray-100 rounded-full h-3">
          <div className="bg-blue-500 h-3 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {totalMenitSemua >= TARGET_MENIT ? '✅ Target terpenuhi!' : `Kurang ${formatDurasi(TARGET_MENIT - totalMenitSemua)} lagi`}
        </p>
      </div>

      {/* List */}
      <div className="space-y-3">
        {logbooks.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200">
            <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">Belum ada logbook</p>
            <p className="text-sm text-gray-400 mt-1">Klik tombol Tambah untuk mulai mencatat</p>
          </div>
        ) : logbooks.map((log) => {
          const statusCfg = STATUS_CONFIG[log.status] || STATUS_CONFIG.disubmit
          const isExpanded = expanded === log.id
          return (
            <div key={log.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpanded(isExpanded ? null : log.id)}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-800 text-sm line-clamp-1">{log.kegiatan}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}>
                        {statusCfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(log.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {' · '}{formatDurasi(log.jam)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {log.status === 'draft' && (
                    <button onClick={e => { e.stopPropagation(); handleDelete(log.id) }}
                      className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {log.status === 'revisi' && (
                    <button onClick={e => {
                      e.stopPropagation()
                      const totalMenit = Math.round(Number(log.jam))
                      setEditLog(log)
                      setEditForm({
                        kegiatan: log.kegiatan,
                        deskripsi: log.deskripsi || '',
                        jam: String(Math.floor(totalMenit / 60)),
                        menit: String(totalMenit % 60),
                        bukti: null,
                        hapusBukti: false,
                      })
                      setEditBuktiType(log.bukti_link ? 'link' : 'file')
                      setEditBuktiLink(log.bukti_link || '')
                    }} className="p-1.5 text-blue-600 bg-blue-50 rounded-lg">
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : log.id) }}
                    className={`p-1.5 rounded-lg ${isExpanded ? 'text-blue-600 bg-blue-100' : 'text-blue-600 bg-blue-50'}`}>
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100">
                  <div className="px-6 py-4 space-y-4 max-w-4xl mx-auto">
                    {log.deskripsi && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Deskripsi</p>
                        <p className="text-sm text-gray-700 text-justify">{log.deskripsi}</p>
                      </div>
                    )}
                    {log.hasil && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Hasil</p>
                        <p className="text-sm text-gray-700">{log.hasil}</p>
                      </div>
                    )}
                    {log.kendala && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Kendala</p>
                        <p className="text-sm text-gray-700">{log.kendala}</p>
                      </div>
                    )}
                    {log.rencana_selanjutnya && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Rencana Selanjutnya</p>
                        <p className="text-sm text-gray-700">{log.rencana_selanjutnya}</p>
                      </div>
                    )}
                    {log.bukti_path && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Bukti</p>
                        <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: '420px' }}>
                          {/\.(jpg|jpeg|png)$/i.test(log.bukti_path) ? (
                            <img
                              src={`/uploads/${log.bukti_path.replace(/^.*uploads\//, '')}`}
                              className="w-full h-full object-contain bg-gray-50"
                              alt="Bukti kegiatan"
                            />
                          ) : (
                            <iframe
                              src={`/uploads/${log.bukti_path.replace(/^.*uploads\//, '')}#toolbar=1&navpanes=0`}
                              className="w-full h-full"
                              title="Bukti PDF"
                              type="application/pdf"
                            />
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-2">{log.bukti_path.split('/').pop()}</p>
                      </div>
                    )}
                    {log.bukti_link && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Bukti (Link)</p>
                        <a
                          href={log.bukti_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2.5"
                        >
                          🔗 <span className="truncate max-w-xs">{log.bukti_link}</span>
                        </a>
                      </div>
                    )}
                    {log.feedback_dosen && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                          </div>
                          <p className="text-xs font-semibold text-purple-700">Feedback Dosen Pembimbing</p>
                          {log.verified_at && (
                            <p className="text-xs text-gray-400 ml-auto">
                              {new Date(log.verified_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                        <div className="bg-purple-50 border border-purple-100 rounded-xl px-3.5 py-3">
                          <p className="text-sm text-purple-900 leading-relaxed">{log.feedback_dosen}</p>
                        </div>
                      </div>
                    )}
                    {log.status === 'diverifikasi' && (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="w-4 h-4 flex-shrink-0" />
                        <p className="text-xs font-medium">Logbook telah diverifikasi oleh dosen pembimbing</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal Tambah */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
              <h2 className="font-bold text-gray-800">Tambah Logbook</h2>
              <button onClick={() => { setModalOpen(false); resetForm() }} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {!navigator.onLine && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3.5 py-2.5 text-xs text-yellow-700 font-medium">
                  ⚠️ Offline — data tersimpan lokal, file bukti tidak bisa dilampirkan.
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tanggal *</label>
                <input type="date" value={form.tanggal}
                  onChange={e => setForm({ ...form, tanggal: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Judul Kegiatan *</label>
                <input type="text" value={form.kegiatan}
                  onChange={e => setForm({ ...form, kegiatan: e.target.value })}
                  placeholder="Contoh: Implementasi fitur login"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              {/* FIX 1: gunakan form & setForm, bukan editForm & setEditForm */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Deskripsi Kegiatan *
                </label>
                <textarea value={form.deskripsi}
                  onChange={e => setForm({ ...form, deskripsi: e.target.value })}
                  rows={3}
                  required
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Durasi *</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                   <input type="number" min="0" max="23" step="1" value={form.jam === '' ? '0' : form.jam}
  onChange={e => setForm({ ...form, jam: e.target.value })}
  onFocus={e => e.target.select()}
  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 pr-12" />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">jam</span>
                  </div>
                  <div className="flex-1 relative">
  <input type="number" min="0" max="59" step="1" value={form.menit}
    onChange={e => setForm({ ...form, menit: e.target.value })}
    onFocus={e => e.target.select()}
    placeholder="0"
    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 pr-16" />
  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">menit</span>
</div>
                </div>
                {previewDurasi() && <p className="text-xs text-blue-500 font-medium mt-1.5">Durasi: {previewDurasi()}</p>}
              </div>

              {navigator.onLine && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Bukti Kegiatan <span className="text-gray-400 normal-case font-normal">(opsional)</span>
                  </label>
                  <div className="flex gap-2 mb-3">
                    <button type="button" onClick={() => setBuktiType('file')}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all
                        ${buktiType === 'file' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'}`}>
                      📎 Upload File
                    </button>
                    <button type="button" onClick={() => setBuktiType('link')}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all
                        ${buktiType === 'link' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'}`}>
                      🔗 Link URL
                    </button>
                  </div>
                  {buktiType === 'file' ? (
                    <div
                      onDragOver={e => { e.preventDefault(); setDragging(true) }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={e => { e.preventDefault(); setDragging(false); handleFileChange(e.dataTransfer.files[0]) }}
                      onClick={() => fileRef.current.click()}
                      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
                        ${dragging ? 'border-blue-500 bg-blue-50' : form.bukti ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}`}>
                      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => handleFileChange(e.target.files[0])} className="hidden" />
                      {form.bukti ? (
                        <div>
                          <p className="text-xl mb-1">✅</p>
                          <p className="font-semibold text-green-700 text-sm">{form.bukti.name}</p>
                          <p className="text-xs text-gray-400 mt-1">{(form.bukti.size / 1024 / 1024).toFixed(2)} MB</p>
                          <button type="button" onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, bukti: null })) }}
                            className="mt-2 text-xs text-red-500 hover:underline">Hapus file</button>
                        </div>
                      ) : (
                        <div>
                          <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1.5" />
                          <p className="text-sm text-gray-500">{dragging ? 'Lepaskan file di sini' : 'Drag & drop atau klik untuk pilih file'}</p>
                          <p className="text-xs text-gray-400 mt-1">PDF / JPG / PNG · Maks 20 MB</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <input type="url" value={buktiLink} onChange={e => setBuktiLink(e.target.value)}
                      placeholder="paste link here"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setModalOpen(false); resetForm() }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Batal</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {submitting ? 'Menyimpan...' : navigator.onLine ? 'Simpan' : 'Simpan Offline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Logbook */}
      {editLog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
              <h2 className="font-bold text-gray-800">Edit Logbook</h2>
              <button onClick={() => setEditLog(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Judul Kegiatan *</label>
                <input type="text" value={editForm.kegiatan}
                  onChange={e => setEditForm({ ...editForm, kegiatan: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              {/* FIX 3: label deskripsi jadi wajib + tambah required */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Deskripsi *
                </label>
                <textarea value={editForm.deskripsi}
                  onChange={e => setEditForm({ ...editForm, deskripsi: e.target.value })}
                  rows={3}
                  required
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Durasi *</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input type="number" min="0" max="23" value={editForm.jam === '' ? '0' : editForm.jam}
  onChange={e => setEditForm({ ...editForm, jam: e.target.value })}
  onFocus={e => e.target.select()}
  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 pr-12" />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">jam</span>
                  </div>
                  <div className="flex-1 relative">
                    <input type="number" min="0" max="59" value={editForm.menit}
                      onChange={e => setEditForm({ ...editForm, menit: e.target.value })}
                       onFocus={e => e.target.select()}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 pr-16" />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">menit</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Bukti <span className="text-gray-400 normal-case font-normal">(opsional · PDF / JPG / PNG · maks 20 MB)</span>
                </label>
                <div className="flex gap-2 mb-3">
                  <button type="button" onClick={() => { setEditBuktiType('file'); setEditBuktiLink('') }}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all
                      ${editBuktiType === 'file' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'}`}>
                    📎 Upload File
                  </button>
                  <button type="button" onClick={() => { setEditBuktiType('link'); setEditForm(f => ({ ...f, bukti: null, hapusBukti: false })) }}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all
                      ${editBuktiType === 'link' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'}`}>
                    🔗 Link URL
                  </button>
                </div>

                {editBuktiType === 'file' ? (
                  <>
                    {editLog.bukti_path && !editForm.hapusBukti && !editForm.bukti ? (
                      <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-600" />
                          <p className="text-sm text-blue-700 truncate max-w-[200px]">{editLog.bukti_path.split('/').pop()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => editFileRef.current.click()}
                            className="text-xs text-blue-600 hover:underline font-medium">Ganti</button>
                          <button type="button" onClick={() => setEditForm(f => ({ ...f, hapusBukti: true }))}
                            className="text-xs text-red-500 hover:underline font-medium">Hapus</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onDragOver={e => { e.preventDefault(); setEditDragging(true) }}
                        onDragLeave={() => setEditDragging(false)}
                        onDrop={e => { e.preventDefault(); setEditDragging(false); handleEditFileChange(e.dataTransfer.files[0]) }}
                        onClick={() => editFileRef.current.click()}
                        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
                          ${editDragging ? 'border-blue-500 bg-blue-50' : editForm.bukti ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}`}>
                        {editForm.bukti ? (
                          <div>
                            <p className="text-xl mb-1">✅</p>
                            <p className="font-semibold text-green-700 text-sm">{editForm.bukti.name}</p>
                            <p className="text-xs text-gray-400 mt-1">{(editForm.bukti.size / 1024 / 1024).toFixed(2)} MB</p>
                            <button type="button" onClick={e => { e.stopPropagation(); setEditForm(f => ({ ...f, bukti: null, hapusBukti: false })) }}
                              className="mt-2 text-xs text-red-500 hover:underline">Hapus file</button>
                          </div>
                        ) : (
                          <div>
                            <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1.5" />
                            <p className="text-sm text-gray-500">{editDragging ? 'Lepaskan file di sini' : 'Drag & drop atau klik untuk pilih file'}</p>
                            <p className="text-xs text-gray-400 mt-1">PDF / JPG / PNG · Maks 20 MB</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <input type="url" value={editBuktiLink} onChange={e => setEditBuktiLink(e.target.value)}
                    placeholder="paste link here"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
                )}

                <input ref={editFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => handleEditFileChange(e.target.files[0])} className="hidden" />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditLog(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Batal</button>
                <button type="submit" disabled={editSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {editSubmitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {editSubmitting ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewPdf && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col" style={{ height: '90vh' }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0">
              <p className="font-bold text-gray-800">Preview Bukti PDF</p>
              <button onClick={() => setPreviewPdf(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl">
              <iframe src={previewPdf} className="w-full h-full" title="Preview PDF" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}