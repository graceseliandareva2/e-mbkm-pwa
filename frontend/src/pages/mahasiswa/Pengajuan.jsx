// pages/mahasiswa/MahasiswaPengajuan.jsx
import { useEffect, useState, useCallback } from 'react'
import { CheckCircle, Clock, XCircle, AlertCircle, Plus, Trash2, Eye } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { saveToQueue } from '../../utils/offlineQueue'
import { useSyncOnline } from '../../utils/useSyncOnline'
import { getCache, setCache } from '../../utils/offlineCache'   // ← BARU

// ─────────────────────────── constants ───────────────────────────
const CACHE_KEY = 'pengajuan'   

const STATUS_CONFIG = {
  menunggu:          { label: 'Menunggu Review',  color: 'text-yellow-600', bg: 'bg-yellow-50',  border: 'border-yellow-200', icon: Clock },
  diajukan:          { label: 'Menunggu Review',  color: 'text-yellow-600', bg: 'bg-yellow-50',  border: 'border-yellow-200', icon: Clock },
  disetujui_kaprodi: { label: 'Disetujui',        color: 'text-green-600',  bg: 'bg-green-50',   border: 'border-green-200',  icon: CheckCircle },
  ditolak:           { label: 'Ditolak',          color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200',    icon: XCircle },
  revisi:            { label: 'Perlu Revisi',     color: 'text-purple-600', bg: 'bg-purple-50',  border: 'border-purple-200', icon: AlertCircle },
}

const inputClass =
  'w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 ' +
  'focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white ' +
  'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed'

const Field = ({ label, children, required }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
)

const EMPTY_FORM = {
  email: '',
  nim: '',
  nama_lengkap: '',
  dosen_pembimbing_akademik: '',
  pelatihan: [{ nama: '', link: '', durasi_jam: '' }],
}

const getPelatihanArray = (pelatihan) => {
  try {
    if (!pelatihan) return []
    return typeof pelatihan === 'string' ? JSON.parse(pelatihan) : pelatihan
  } catch { return [] }
}

const mapResponseToForm = (data) => ({
  email: data.email || '',
  nim: data.nim || '',
  nama_lengkap: data.nama_lengkap || '',
  dosen_pembimbing_akademik: data.dosen_pembimbing_akademik || '',
  pelatihan: (() => {
    const pel = getPelatihanArray(data.pelatihan)
    return pel.length ? pel : [{ nama: '', link: '', durasi_jam: '' }]
  })(),
})

// ─────────────────────────── component ───────────────────────────
export default function MahasiswaPengajuan() {
  const [pengajuan, setPengajuan]   = useState(null)
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [isEdit, setIsEdit]         = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)

  // ── Load cache dulu sebelum fetch ──────────────────────────────
  useEffect(() => {
    const cached = getCache(CACHE_KEY)      // ← BARU
    if (cached?.id) {
      setPengajuan(cached)
      setForm(mapResponseToForm(cached))
      setLoading(false)   // tampilkan langsung dari cache, jangan spinner dulu
    }
  }, [])

  // ── Fetch dari server ──────────────────────────────────────────
  const fetchPengajuan = useCallback(async () => {
    try {
      const res = await api.get('/mahasiswa/pengajuan')
      if (res.data?.id) {
        setPengajuan(res.data)
        setForm(mapResponseToForm(res.data))
        setCache(CACHE_KEY, res.data)        // ← BARU: simpan ke cache
      }
    } catch {
      // Saat offline, tetap pakai state yang sudah diisi dari cache di atas
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPengajuan() }, [fetchPengajuan])

  // ── Auto-sync saat kembali online ─────────────────────────────
  useSyncOnline(fetchPengajuan)

  // ── Pelatihan helpers ─────────────────────────────────────────
  const addPelatihan = () => {
    if (form.pelatihan.length >= 3) return
    setForm({ ...form, pelatihan: [...form.pelatihan, { nama: '', link: '', durasi_jam: '' }] })
  }

  const removePelatihan = (idx) => {
    setForm({ ...form, pelatihan: form.pelatihan.filter((_, i) => i !== idx) })
  }

  const updatePelatihan = (idx, field, value) => {
    setForm({ ...form, pelatihan: form.pelatihan.map((p, i) => i === idx ? { ...p, [field]: value } : p) })
  }

  // ── Validasi ──────────────────────────────────────────────────
  const validate = () => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@itbss\.ac\.id$/
    if (!emailRegex.test(form.email))
      return 'Email harus menggunakan email kampus (@itbss.ac.id)'
    if (!form.nim.trim())           return 'NIM wajib diisi'
    if (!form.nama_lengkap.trim())  return 'Nama lengkap wajib diisi'
    if (!form.dosen_pembimbing_akademik.trim()) return 'Dosen pembimbing akademik wajib diisi'
    const totalJam = form.pelatihan.reduce((sum, p) => sum + (Number(p.durasi_jam) || 0), 0)
    if (totalJam < 48)
      return `Total waktu pembelajaran harus minimal 48 jam (saat ini ${totalJam} jam)`
    const pelatihan1 = form.pelatihan[0]
    if (!pelatihan1?.nama?.trim() || !pelatihan1?.link?.trim() || !pelatihan1?.durasi_jam)
      return 'Pelatihan pertama (nama, link, dan durasi) wajib diisi'
    return null
  }

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    const err = validate()
    if (err) return toast.error(err)

    // Offline path
    if (!navigator.onLine) {
      try {
        await saveToQueue({
          method: pengajuan && isEdit ? 'PUT' : 'POST',
          url: pengajuan && isEdit
            ? `/mahasiswa/pengajuan/${pengajuan.id}`
            : '/mahasiswa/pengajuan',
          data: form,
        })
        toast.success('Offline! Pengajuan tersimpan lokal, akan otomatis terkirim saat online.')
        setIsEdit(false)
      } catch {
        toast.error('Gagal menyimpan data offline')
      }
      return
    }

    // Online path
    setSubmitting(true)
    try {
      if (pengajuan && isEdit) {
        await api.put(`/mahasiswa/pengajuan/${pengajuan.id}`, form)
        toast.success('Pengajuan berhasil diperbarui!')
        setIsEdit(false)
      } else {
        await api.post('/mahasiswa/pengajuan', form)
        toast.success('Pengajuan berhasil dikirim!')
      }
      fetchPengajuan()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan pengajuan')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render helpers ────────────────────────────────────────────
  const totalJam   = form.pelatihan.reduce((sum, p) => sum + (Number(p.durasi_jam) || 0), 0)
  const statusCfg  = pengajuan ? (STATUS_CONFIG[pengajuan.status] || STATUS_CONFIG.menunggu) : null
  const StatusIcon = statusCfg?.icon
  const canEdit    = pengajuan?.status === 'revisi' || pengajuan?.status === 'ditolak'

  const renderForm = (disabled = false) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Email" required>
          <input className={inputClass} type="email" value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} disabled={disabled} />
        </Field>
        <Field label="NIM" required>
          <input className={inputClass} value={form.nim}
            onChange={e => setForm({ ...form, nim: e.target.value })} disabled={disabled} />
        </Field>
      </div>
      <Field label="Nama Lengkap" required>
        <input className={inputClass} value={form.nama_lengkap}
          onChange={e => setForm({ ...form, nama_lengkap: e.target.value })} disabled={disabled} />
      </Field>
      <Field label="Dosen Pembimbing Akademik" required>
        <input className={inputClass} value={form.dosen_pembimbing_akademik}
          onChange={e => setForm({ ...form, dosen_pembimbing_akademik: e.target.value })} disabled={disabled} />
      </Field>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Pelatihan / Bootcamp <span className="text-red-500 ml-0.5">*</span>
          </label>
          {!disabled && form.pelatihan.length < 3 && (
            <button type="button" onClick={addPelatihan}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800">
              <Plus className="w-3.5 h-3.5" /> Tambah Pelatihan
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 -mt-1">
          Minimal total waktu pembelajaran <span className="font-semibold text-gray-700">48 jam</span>.
        </p>

        {form.pelatihan.map((p, idx) => (
          <div key={idx} className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-gray-600">
                Pelatihan {idx + 1}{idx === 0 ? ' (Utama)' : ' (Tambahan)'}
              </span>
              {!disabled && idx > 0 && (
                <button type="button" onClick={() => removePelatihan(idx)} className="text-red-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <Field label="Nama Pelatihan / Bootcamp" required={idx === 0}>
              <input className={inputClass} value={p.nama}
                onChange={e => updatePelatihan(idx, 'nama', e.target.value)} disabled={disabled} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Link Pelatihan" required={idx === 0}>
                <input className={inputClass} value={p.link}
                  onChange={e => updatePelatihan(idx, 'link', e.target.value)} disabled={disabled} />
              </Field>
              <Field label="Durasi (jam)" required={idx === 0}>
                <input className={inputClass} type="number" min="1" value={p.durasi_jam}
                  onChange={e => updatePelatihan(idx, 'durasi_jam', e.target.value)} disabled={disabled} />
              </Field>
            </div>
          </div>
        ))}

        <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm font-semibold
          ${totalJam >= 48 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
          <span>Total Waktu Pembelajaran</span>
          <span>{totalJam} jam {totalJam >= 48 ? '✓' : `(kurang ${48 - totalJam} jam)`}</span>
        </div>
      </div>
    </div>
  )

  // ── Offline banner ────────────────────────────────────────────
  const OfflineBanner = ({ message }) => (
    <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-700 font-medium">
      ⚠️ {message}
    </div>
  )

  // ── Loading ───────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ── Form baru (belum pernah mengajukan) ───────────────────────
  if (!pengajuan) return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Pengajuan Capstone Project</h1>
        <p className="text-sm text-gray-500 mt-1">Isi formulir berikut untuk mengajukan Capstone Project kamu.</p>
      </div>
      {!navigator.onLine && (
        <OfflineBanner message="Kamu sedang offline. Data akan tersimpan lokal dan terkirim otomatis saat online." />
      )}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 border-b pb-3">Form Pengajuan Baru</h2>
        {renderForm(false)}
        <div className="pt-2">
          <button type="submit" disabled={submitting}
            className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {submitting ? 'Menyimpan...' : navigator.onLine ? 'Kirim Pengajuan' : 'Simpan Offline'}
          </button>
        </div>
      </form>
    </div>
  )

  // ── Sudah ada pengajuan ───────────────────────────────────────
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Pengajuan Capstone Project</h1>
        <p className="text-sm text-gray-500 mt-1">Status pengajuan Capstone Project kamu.</p>
      </div>
      {!navigator.onLine && (
        <OfflineBanner message="Kamu sedang offline. Perubahan akan tersimpan lokal dan terkirim otomatis saat online." />
      )}

      {/* Headline Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <p className="font-semibold text-gray-800 truncate">
              {getPelatihanArray(pengajuan.pelatihan)[0]?.nama || '-'}
            </p>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold flex-shrink-0
              ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {statusCfg.label}
            </div>
          </div>
          <button onClick={() => { setShowDetail(!showDetail); setIsEdit(false) }}
            className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${showDetail ? 'text-blue-600 bg-blue-100' : 'text-blue-600 bg-blue-50 hover:bg-blue-100'}`}>
            <Eye className="w-4 h-4" />
          </button>
        </div>
        {pengajuan.catatan_kaprodi && (
          <div className="mt-3 p-3 bg-purple-50 rounded-xl border border-purple-100">
            <p className="text-xs font-semibold text-purple-500 mb-1">Catatan dari Kaprodi:</p>
            <p className="text-sm text-purple-800">{pengajuan.catatan_kaprodi}</p>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {showDetail && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="font-semibold text-gray-800">Detail Pengajuan</h2>
            {canEdit && !isEdit && (
              <button onClick={() => setIsEdit(true)}
                className="text-sm font-semibold text-blue-600 hover:text-blue-800">
                Edit Pengajuan
              </button>
            )}
            {isEdit && (
              <button onClick={() => { setIsEdit(false); setForm(mapResponseToForm(pengajuan)) }}
                className="text-sm font-semibold text-gray-500 hover:text-gray-700">
                Batal
              </button>
            )}
          </div>

          {isEdit ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {renderForm(false)}
              <div className="pt-2">
                <button type="submit" disabled={submitting}
                  className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {submitting ? 'Menyimpan...' : navigator.onLine ? 'Perbarui Pengajuan' : 'Simpan Offline'}
                </button>
              </div>
            </form>
          ) : (
            renderForm(true)
          )}
        </div>
      )}
    </div>
  )
}