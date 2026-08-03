// pages/mahasiswa/MahasiswaPengajuan.jsx
import { useEffect, useState, useCallback } from 'react'
import { CheckCircle, Clock, XCircle, AlertCircle, Eye } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { saveToQueue } from '../../utils/offlineQueue'
import { useSyncOnline } from '../../utils/useSyncOnline'
import { getCache, setCache } from '../../utils/offlineCache'
import useAuthStore from '../../store/authStore'
import { normalizeUrl } from '../../utils/normalizeUrl'

// ─────────────────────────── constants ───────────────────────────
const CACHE_KEY = 'pengajuan'
const DEFAULT_MIN_JAM = 48

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

const inputErrorClass =
  'w-full border border-red-400 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 ' +
  'focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-white ' +
  'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed'

// ── Validasi URL ────────────────────────────────────────────────
const isValidUrl = (str) => {
  if (!str || !str.trim()) return false
  try {
    const url = new URL(str.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const Field = ({ label, children, required }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
)

const toDateInputValue = (val) => (val ? String(val).slice(0, 10) : '')

const mapResponseToForm = (data, user) => ({
  email: data?.email || user?.email || '',
  nim: data?.nim || user?.nim || '',
  nama_lengkap: data?.nama_lengkap || user?.nama || '',
  dosen_pa_id: data?.dosen_pa_id || '',
  judul: data?.judul || '',
  penyelenggara: data?.penyelenggara || '',
  tanggal_mulai: toDateInputValue(data?.tanggal_mulai),
  tanggal_selesai: toDateInputValue(data?.tanggal_selesai),
  nama_pelatihan: data?.nama_pelatihan || '',
  link_pelatihan: data?.link_pelatihan || '',
  durasi_pelatihan_jam: data?.durasi_pelatihan_jam ?? '',
})

// ─────────────────────────── component ───────────────────────────
export default function MahasiswaPengajuan() {
  const { user } = useAuthStore()

  const [pengajuan, setPengajuan]     = useState(null)
  const [loading, setLoading]         = useState(true)
  const [submitting, setSubmitting]   = useState(false)
  const [showDetail, setShowDetail]   = useState(false)
  const [isEdit, setIsEdit]           = useState(false)
  const [form, setForm]               = useState(() => mapResponseToForm(null, user))
  const [linkError, setLinkError]     = useState(false)
  const [minJam, setMinJam]           = useState(DEFAULT_MIN_JAM)
  const [dosenPAList, setDosenPAList] = useState([])

  // ── Load cache dulu sebelum fetch ──────────────────────────────
  useEffect(() => {
    const cached = getCache(CACHE_KEY)
    if (cached?.id) {
      setPengajuan(cached)
      setForm(mapResponseToForm(cached, user))
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    api.get('/mahasiswa/periode-aktif')
      .then(res => {
        const aktif = res.data?.data?.[0]
        if (aktif?.min_jam_pengajuan) setMinJam(aktif.min_jam_pengajuan)
      })
      .catch(() => {})
  }, [])

  // ── Ambil daftar Dosen PA buat dropdown (users role='dosen', periode aktif) ──
  useEffect(() => {
    api.get('/mahasiswa/dosen-pa')
      .then(res => setDosenPAList(res.data?.data || []))
      .catch(() => {})
  }, [])

  // ── Fetch dari server ──────────────────────────────────────────
  const fetchPengajuan = useCallback(async () => {
    try {
      const res = await api.get('/mahasiswa/pengajuan')
      if (res.data?.id) {
        setPengajuan(res.data)
        setForm(mapResponseToForm(res.data, user))
        setCache(CACHE_KEY, res.data)
        if (res.data?.min_jam_pengajuan) setMinJam(res.data.min_jam_pengajuan)
      }
    } catch {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { fetchPengajuan() }, [fetchPengajuan])

  useSyncOnline(fetchPengajuan)

  // ── Blur handler: normalisasi dulu (http/https/www otomatis), baru validasi ──
  const handleLinkBlur = (value) => {
    const normalized = normalizeUrl(value)
    setForm(f => ({ ...f, link_pelatihan: normalized }))
    const filled = normalized.trim().length > 0
    setLinkError(filled && !isValidUrl(normalized))
  }

  const validate = (linkOverride) => {
    const link = linkOverride ?? form.link_pelatihan

    if (!form.judul.trim())             return 'Judul Capstone Project wajib diisi'
    if (!form.penyelenggara.trim())     return 'Penyelenggara wajib diisi'
    if (!form.nama_pelatihan.trim())    return 'Nama pelatihan wajib diisi'
    if (!link.trim())                   return 'Link pelatihan wajib diisi'
    if (!isValidUrl(link)) {
      setLinkError(true)
      return 'Link pelatihan harus berupa URL yang valid (contoh: https://www.coursera.org/...)'
    }
    setLinkError(false)

    const durasiJam = Number(form.durasi_pelatihan_jam) || 0
    if (durasiJam < minJam)
      return `Durasi pelatihan harus minimal ${minJam} jam (saat ini ${durasiJam} jam)`

    return null
  }

  const buildPayload = (linkOverride) => ({
    judul: form.judul,
    penyelenggara: form.penyelenggara,
    nama_pelatihan: form.nama_pelatihan,
    link_pelatihan: linkOverride ?? form.link_pelatihan,
    durasi_pelatihan_jam: Number(form.durasi_pelatihan_jam) || 0,
    tanggal_mulai: form.tanggal_mulai || null,
    tanggal_selesai: form.tanggal_selesai || null,
    dosen_pa_id: form.dosen_pa_id || null,
  })

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Normalisasi defensif -- jaga-jaga kalau user submit tanpa sempat blur dari field link
    const normalizedLink = normalizeUrl(form.link_pelatihan)
    if (normalizedLink !== form.link_pelatihan) {
      setForm(f => ({ ...f, link_pelatihan: normalizedLink }))
    }

    const err = validate(normalizedLink)
    if (err) return toast.error(err)

    const payload = buildPayload(normalizedLink)

    if (!navigator.onLine) {
      try {
        await saveToQueue({
          method: pengajuan && isEdit ? 'PUT' : 'POST',
          url: pengajuan && isEdit
            ? `/mahasiswa/pengajuan/${pengajuan.id}`
            : '/mahasiswa/pengajuan',
          data: payload,
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
        await api.put(`/mahasiswa/pengajuan/${pengajuan.id}`, payload)
        toast.success('Pengajuan berhasil diperbarui!')
        setIsEdit(false)
      } else {
        await api.post('/mahasiswa/pengajuan', payload)
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
  const statusCfg  = pengajuan ? (STATUS_CONFIG[pengajuan.status] || STATUS_CONFIG.menunggu) : null
  const StatusIcon = statusCfg?.icon
  const canEdit    = pengajuan?.status === 'revisi' || pengajuan?.status === 'ditolak'
  const durasiJam  = Number(form.durasi_pelatihan_jam) || 0

  const renderForm = (disabled = false) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Email" required>
          <input className={inputClass} type="email" value={form.email} disabled readOnly />
        </Field>
        <Field label="NIM" required>
          <input className={inputClass} value={form.nim} disabled readOnly />
        </Field>
      </div>
      <Field label="Nama Lengkap" required>
        <input className={inputClass} value={form.nama_lengkap} disabled readOnly />
      </Field>

      <Field label="Dosen Pembimbing Akademik">
        {disabled ? (
          <input
            className={inputClass}
            value={dosenPAList.find(d => d.id === form.dosen_pa_id)?.nama || pengajuan?.nama_dosen_pa || '-'}
            disabled readOnly
          />
        ) : (
          <select
            className={inputClass}
            value={form.dosen_pa_id}
            onChange={e => setForm({ ...form, dosen_pa_id: e.target.value })}
          >
            <option value="">-- Pilih Dosen PA (opsional) --</option>
            {dosenPAList.map(d => (
              <option key={d.id} value={d.id}>{d.nama}</option>
            ))}
          </select>
        )}
      </Field>

      {/* Detail Capstone Project -- field sesuai kontrak backend */}
      <Field label="Judul Capstone Project" required>
        <input className={inputClass} value={form.judul}
          onChange={e => setForm({ ...form, judul: e.target.value })} disabled={disabled}
          placeholder="Contoh: Sistem Informasi Manajemen MBKM Berbasis Web" />
      </Field>
      <Field label="Penyelenggara" required>
        <input className={inputClass} value={form.penyelenggara}
          onChange={e => setForm({ ...form, penyelenggara: e.target.value })} disabled={disabled}
          placeholder="Contoh: PT Contoh Teknologi Indonesia" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tanggal Mulai">
          <input className={inputClass} type="date" value={form.tanggal_mulai}
            onChange={e => setForm({ ...form, tanggal_mulai: e.target.value })} disabled={disabled} />
        </Field>
        <Field label="Tanggal Selesai">
          <input className={inputClass} type="date" value={form.tanggal_selesai}
            onChange={e => setForm({ ...form, tanggal_selesai: e.target.value })} disabled={disabled} />
        </Field>
      </div>

      {/* Pelatihan -- skema baru: 1 pengajuan = 1 pelatihan (field tunggal) */}
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Pelatihan / Bootcamp <span className="text-red-500 ml-0.5">*</span>
        </label>
        <p className="text-xs text-gray-500 -mt-1">
          Minimal durasi pelatihan <span className="font-semibold text-gray-700">{minJam} jam</span>.
        </p>

        <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50/50">
          <Field label="Nama Pelatihan / Bootcamp" required>
            <input className={inputClass} value={form.nama_pelatihan}
              onChange={e => setForm({ ...form, nama_pelatihan: e.target.value })} disabled={disabled} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Link Pelatihan" required>
              <input
                className={linkError ? inputErrorClass : inputClass}
                type="text"
                placeholder="https://www.contoh.com/kursus"
                value={form.link_pelatihan}
                onChange={e => {
                  setForm({ ...form, link_pelatihan: e.target.value })
                  if (linkError) setLinkError(false)
                }}
                onBlur={e => handleLinkBlur(e.target.value)}
                disabled={disabled}
              />
              {linkError && (
                <p className="text-xs text-red-500 mt-1">Link tidak valid. Gunakan URL lengkap, contoh: https://...</p>
              )}
            </Field>
            <Field label="Durasi (jam)" required>
              <input className={inputClass} type="number" min="1" value={form.durasi_pelatihan_jam}
                onChange={e => setForm({ ...form, durasi_pelatihan_jam: e.target.value })} disabled={disabled} />
            </Field>
          </div>
        </div>

        <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm font-semibold
          ${durasiJam >= minJam ? 'bg-green-50 border-green-200 text-green-700' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
          <span>Durasi Pelatihan</span>
          <span>{durasiJam} jam {durasiJam >= minJam ? '✓' : `(kurang ${minJam - durasiJam} jam)`}</span>
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
        <p className="text-sm text-gray-500 mt-1">Isi formulir berikut untuk mengajukan Capstone Project</p>
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
        <p className="text-sm text-gray-500 mt-1">Status pengajuan Capstone Project</p>
      </div>
      {!navigator.onLine && (
        <OfflineBanner message="Kamu sedang offline. Perubahan akan tersimpan lokal dan terkirim otomatis saat online." />
      )}

      {/* Headline Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <p className="font-semibold text-gray-800 truncate">
              {pengajuan.judul || '-'}
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
              <button onClick={() => { setIsEdit(false); setForm(mapResponseToForm(pengajuan, user)); setLinkError(false) }}
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