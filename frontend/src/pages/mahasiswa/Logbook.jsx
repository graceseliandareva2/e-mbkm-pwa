import { useEffect, useState, useRef } from 'react'
import { Plus, BookOpen, Trash2, MessageSquare, CheckCircle, Lock, Upload, X, FileText, Eye, Pencil, ExternalLink, AlertTriangle } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { saveToQueue } from '../../utils/offlineQueue'
import { useSyncOnline } from '../../utils/useSyncOnline'
import BuktiPreview, {
  FileBuktiPreview,
  LinkBukti
} from '../../components/common/BuktiPreview'
import { normalizeUrl } from '../../utils/normalizeUrl'
import { getCache, setCache } from '../../utils/offlineCache'
const BASE_URL = ''

const CK_PENGAJUAN = 'pengajuan'
const CK_LOGBOOKS  = 'logbooks'
const CK_PELATIHAN = 'pelatihan'

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
const hitungDurasiMenit = (mulai, selesai) => {
  if (!mulai || !selesai) return null
  const [h1, m1] = mulai.split(':').map(Number)
  const [h2, m2] = selesai.split(':').map(Number)
  const total = (h2 * 60 + m2) - (h1 * 60 + m1)
  return total > 0 ? total : null
}

export default function MahasiswaLogbook() {
  const [logbooks, setLogbooks] = useState([])
  const [pengajuan, setPengajuan] = useState(null)
  const [pelatihanList, setPelatihanList] = useState([])
  const [selectedPelatihanId, setSelectedPelatihanId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [form, setForm] = useState({
    tanggal: '', topik: '', tugas: '', hasil: '', kendala: '',
    link_dokumentasi_drive: '', jam_mulai: '', jam_selesai: '', bukti: null
  })
  const [previewPdf, setPreviewPdf] = useState(null)
  const [editLog, setEditLog] = useState(null)
  const [editForm, setEditForm] = useState({
    topik: '', tugas: '', hasil: '', kendala: '', link_dokumentasi_drive: '',
    jam_mulai: '', jam_selesai: '', bukti: null, hapusBukti: false
  })
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editDragging, setEditDragging] = useState(false)
  const [buktiType, setBuktiType] = useState('file')
  const [buktiLink, setBuktiLink] = useState('')
  const [editBuktiType, setEditBuktiType] = useState('file')
  const [editBuktiLink, setEditBuktiLink] = useState('')
  const fileRef = useRef(null)
  const editFileRef = useRef(null)

  useEffect(() => {
    try {
      const cachedPengajuan = getCache(CK_PENGAJUAN)
      const cachedLogbooks  = getCache(CK_LOGBOOKS)
      const cachedPelatihan = getCache(CK_PELATIHAN)
      if (cachedPengajuan) setPengajuan(cachedPengajuan)
      if (cachedLogbooks)  setLogbooks(cachedLogbooks)
      if (cachedPelatihan) {
        setPelatihanList(cachedPelatihan)
        if (cachedPelatihan.length > 0) setSelectedPelatihanId(prev => prev ?? cachedPelatihan[0].id)
      }
    } catch { /*  */ }
  }, [])

  const fetchAll = async () => {
    try {
      const [logbookRes, pengajuanRes, pelatihanRes] = await Promise.allSettled([
        api.get('/mahasiswa/logbook'),
        api.get('/mahasiswa/pengajuan'),
        api.get('/mahasiswa/pelatihan'),
      ])

      if (logbookRes.status === 'fulfilled') {
        const data = logbookRes.value.data?.data ?? logbookRes.value.data
        const list = Array.isArray(data) ? data : []
        setLogbooks(list)
        setCache(CK_LOGBOOKS, list)
      }

      if (pengajuanRes.status === 'fulfilled' && pengajuanRes.value.data?.id) {
        const p = pengajuanRes.value.data
        setPengajuan(p)
        setCache(CK_PENGAJUAN, p)
      }

      let pelatihanData = null
      if (pelatihanRes.status === 'fulfilled') {
        pelatihanData = pelatihanRes.value.data?.data ?? pelatihanRes.value.data
      } else if (pengajuanRes.status === 'fulfilled' && pengajuanRes.value.data?.pelatihan_list) {
        pelatihanData = pengajuanRes.value.data.pelatihan_list
      }
      if (Array.isArray(pelatihanData)) {
        setPelatihanList(pelatihanData)
        setCache(CK_PELATIHAN, pelatihanData)
        setSelectedPelatihanId(prev => {
          if (prev && pelatihanData.some(p => p.id === prev)) return prev
          return pelatihanData.length > 0 ? pelatihanData[0].id : null
        })
      }
    } catch { setLogbooks([]) }
    finally { setLoading(false) }
  }

  useSyncOnline(fetchAll)

  useEffect(() => {
    fetchAll().finally(() => setLoading(false))
  }, [])

  const resetForm = () => {
    setForm({
      tanggal: '', topik: '', tugas: '', hasil: '', kendala: '',
      link_dokumentasi_drive: '', jam_mulai: '', jam_selesai: '', bukti: null
    })
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

    const normalizedBuktiLink = buktiType === 'link' ? normalizeUrl(buktiLink) : buktiLink
    if (buktiType === 'link' && normalizedBuktiLink !== buktiLink) {
      setBuktiLink(normalizedBuktiLink)
    }

    const normalizedLinkDokumentasi = normalizeUrl(form.link_dokumentasi_drive)
    if (normalizedLinkDokumentasi !== form.link_dokumentasi_drive) {
      setForm(f => ({ ...f, link_dokumentasi_drive: normalizedLinkDokumentasi }))
    }

    if (!form.tanggal || !form.topik || !form.tugas || !form.hasil?.trim() || !form.jam_mulai || !form.jam_selesai) {
      return toast.error('Tanggal, jam mulai/selesai, topik, tugas/proyek, dan hasil wajib diisi!')
    }
    if (!normalizedLinkDokumentasi?.trim()) {
      return toast.error('Link Dokumentasi (Drive) wajib diisi!')
    }
    if (!hitungDurasiMenit(form.jam_mulai, form.jam_selesai)) {
      return toast.error('Jam selesai harus setelah jam mulai!')
    }
    if (pelatihanList.length > 1 && !selectedPelatihanId) {
      return toast.error('Pilih pelatihan terlebih dahulu!')
    }
    const hasBukti = (buktiType === 'file' && !!form.bukti) || (buktiType === 'link' && !!normalizedBuktiLink?.trim())
    if (!hasBukti) {
      return toast.error('Bukti kegiatan wajib diisi (upload file atau link)!')
    }

    if (submitting) return
    setSubmitting(true)

    if (!navigator.onLine) {
      try {
        await saveToQueue({
          method: 'POST',
          url: '/mahasiswa/logbook',
          data: {
            tanggal: form.tanggal,
            topik: form.topik,
            tugas: form.tugas,
            hasil: form.hasil,
            kendala: form.kendala || undefined,
            link_dokumentasi_drive: normalizedLinkDokumentasi,
            jam_mulai: form.jam_mulai,
            jam_selesai: form.jam_selesai,
            pelatihan_id: selectedPelatihanId || undefined,
            bukti_link: buktiType === 'link' ? normalizedBuktiLink : undefined,
          },
          file: buktiType === 'file' && form.bukti
            ? { blob: form.bukti, filename: form.bukti.name, fieldName: 'bukti' }
            : undefined,
        })
        toast.success('Offline! Logbook akan otomatis terkirim saat online.')
        setModalOpen(false)
        resetForm()
      } catch {
        toast.error('Gagal menyimpan data offline')
      } finally {
        setSubmitting(false)
      }
      return
    }

    try {
      const formData = new FormData()
      formData.append('tanggal', form.tanggal)
      formData.append('topik', form.topik)
      formData.append('tugas', form.tugas)
      formData.append('hasil', form.hasil)
      if (form.kendala) formData.append('kendala', form.kendala)
      formData.append('link_dokumentasi_drive', normalizedLinkDokumentasi)
      formData.append('jam_mulai', form.jam_mulai)
      formData.append('jam_selesai', form.jam_selesai)
      if (selectedPelatihanId) formData.append('pelatihan_id', selectedPelatihanId)
      if (buktiType === 'file' && form.bukti) formData.append('bukti', form.bukti)
      if (buktiType === 'link' && normalizedBuktiLink) formData.append('bukti_link', normalizedBuktiLink)
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

    const normalizedEditBuktiLink = editBuktiType === 'link' ? normalizeUrl(editBuktiLink) : editBuktiLink
    if (editBuktiType === 'link' && normalizedEditBuktiLink !== editBuktiLink) {
      setEditBuktiLink(normalizedEditBuktiLink)
    }

    const normalizedEditLinkDokumentasi = normalizeUrl(editForm.link_dokumentasi_drive)
    if (normalizedEditLinkDokumentasi !== editForm.link_dokumentasi_drive) {
      setEditForm(f => ({ ...f, link_dokumentasi_drive: normalizedEditLinkDokumentasi }))
    }

    if (!editForm.topik || !editForm.tugas || !editForm.hasil?.trim() || !editForm.jam_mulai || !editForm.jam_selesai) {
      return toast.error('Jam mulai/selesai, topik, tugas/proyek, dan hasil wajib diisi!')
    }
    if (!normalizedEditLinkDokumentasi?.trim()) {
      return toast.error('Link Dokumentasi (Drive) wajib diisi!')
    }
    if (!hitungDurasiMenit(editForm.jam_mulai, editForm.jam_selesai)) {
      return toast.error('Jam selesai harus setelah jam mulai!')
    }
    const hasBuktiSetelahEdit = !!editForm.bukti
      || (editBuktiType === 'link' && !!normalizedEditBuktiLink?.trim())
      || (!editForm.hapusBukti && (!!editLog.cloudinary_public_id || !!editLog.bukti_link))
    if (!hasBuktiSetelahEdit) {
      return toast.error('Bukti kegiatan wajib diisi (upload file atau link)!')
    }
    setEditSubmitting(true)
    try {
      if (editForm.bukti || editForm.hapusBukti || (editBuktiType === 'link' && normalizedEditBuktiLink)) {
        const formData = new FormData()
        formData.append('tanggal', editLog.tanggal)
        formData.append('topik', editForm.topik)
        formData.append('tugas', editForm.tugas)
        formData.append('hasil', editForm.hasil)
        if (editForm.kendala) formData.append('kendala', editForm.kendala)
        formData.append('link_dokumentasi_drive', normalizedEditLinkDokumentasi)
        formData.append('jam_mulai', editForm.jam_mulai)
        formData.append('jam_selesai', editForm.jam_selesai)
        if (editForm.hapusBukti) formData.append('hapus_bukti', '1')
        if (editForm.bukti) formData.append('bukti', editForm.bukti)
        if (editBuktiType === 'link' && normalizedEditBuktiLink) formData.append('bukti_link', normalizedEditBuktiLink)
        await api.put(`/mahasiswa/logbook/${editLog.id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      } else {
        await api.put(`/mahasiswa/logbook/${editLog.id}`, {
          tanggal: editLog.tanggal,
          topik: editForm.topik,
          tugas: editForm.tugas,
          hasil: editForm.hasil,
          kendala: editForm.kendala || undefined,
          link_dokumentasi_drive: normalizedEditLinkDokumentasi,
          jam_mulai: editForm.jam_mulai,
          jam_selesai: editForm.jam_selesai,
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

  const isDisabled = pengajuan?.status !== 'disetujui_kaprodi' || !pengajuan?.dosen_id

  const activeLogbooks = logbooks.filter(l => l.status !== 'diverifikasi')
  const historyLogbooks = logbooks.filter(l => l.status === 'diverifikasi')

  const previewDurasi = () => {
    const totalMenit = hitungDurasiMenit(form.jam_mulai, form.jam_selesai)
    if (!totalMenit) return null
    return formatDurasi(totalMenit)
  }

  const renderLogItem = (log) => {
    const statusCfg = STATUS_CONFIG[log.status] || STATUS_CONFIG.disubmit
    const isExpanded = expanded === log.id
    const isFileUpload = !!log.cloudinary_public_id
    const isLinkOnly = !isFileUpload && !!log.bukti_link

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
                <p className="font-semibold text-gray-800 text-sm line-clamp-1">{log.topik}</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}>
                  {statusCfg.label}
                </span>
                {pelatihanList.length > 1 && log.nama_pelatihan && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 text-blue-600 bg-blue-50 border-blue-200">
                    {log.nama_pelatihan}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(log.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}{log.jam_mulai?.slice(0, 5)}–{log.jam_selesai?.slice(0, 5)}
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
                setEditLog(log)
                setEditForm({
                  topik: log.topik || '',
                  tugas: log.tugas || '',
                  hasil: log.hasil || '',
                  kendala: log.kendala || '',
                  link_dokumentasi_drive: log.link_dokumentasi_drive || '',
                  jam_mulai: log.jam_mulai ? log.jam_mulai.slice(0, 5) : '',
                  jam_selesai: log.jam_selesai ? log.jam_selesai.slice(0, 5) : '',
                  bukti: null,
                  hapusBukti: false,
                })
                setEditBuktiType(log.cloudinary_public_id ? 'file' : (log.bukti_link ? 'link' : 'file'))
                setEditBuktiLink(log.cloudinary_public_id ? '' : (log.bukti_link || ''))
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
              {log.tugas && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Tugas/Proyek</p>
                  <p className="text-sm text-gray-700 text-justify">{log.tugas}</p>
                </div>
              )}
              {log.hasil && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Hasil</p>
                  <p className="text-sm text-gray-700 text-justify">{log.hasil}</p>
                </div>
              )}
              {log.kendala && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Kendala</p>
                  <p className="text-sm text-gray-700 text-justify">{log.kendala}</p>
                </div>
              )}
              {log.link_dokumentasi_drive && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Link Dokumentasi</p>
                  <a href={log.link_dokumentasi_drive} target="_blank" rel="noreferrer"
                    className="text-sm text-blue-600 hover:underline break-all">{log.link_dokumentasi_drive}</a>
                </div>
              )}
              {log.bukti_link && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Bukti
                  </p>

                  <div
                    className={`rounded-xl overflow-hidden border border-gray-200 ${
                      isLinkOnly ? '' : 'h-[420px]'
                    }`}
                  >
                    <BuktiPreview
                      path={isFileUpload ? log.bukti_link : null}
                      link={isFileUpload ? null : log.bukti_link}
                      filename={log.topik}
                    />
                  </div>
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
          {pengajuan?.status !== 'disetujui_kaprodi'
            ? 'Logbook dapat diisi setelah pengajuan Capstone Project kamu disetujui oleh Kaprodi.'
            : 'Logbook dapat diisi setelah kamu mendapatkan dosen pembimbing dari Kaprodi.'}
        </p>
        {!navigator.onLine && (
          <p className="text-xs text-yellow-600 mt-3 bg-yellow-50 border border-yellow-100 rounded-xl px-3 py-2 flex items-center justify-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Kamu sedang offline.</span>
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
        <div className="flex items-center gap-2">
          <button onClick={() => window.open('/api/mahasiswa/logbook/export-pdf', '_blank')}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50">
            <FileText className="w-4 h-4" />
            Export PDF
          </button>
          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700">
            <Plus className="w-4 h-4" />
            Tambah
          </button>
        </div>
      </div>

      {/* Banner offline */}
      {!navigator.onLine && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-700 font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Kamu sedang offline.</span>
        </div>
      )}

      {/* List aktif */}
      <div className="space-y-3">
        {activeLogbooks.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200">
            <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">Belum ada logbook</p>
            <p className="text-sm text-gray-400 mt-1">Tambahkan kegiatan harian Capstone Project kamu</p>
          </div>
        ) : activeLogbooks.map(renderLogItem)}
      </div>

      {/* Riwayat / sudah diverifikasi */}
      {historyLogbooks.length > 0 && (
        <>
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-px bg-gray-200" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Riwayat · Terverifikasi</p>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="space-y-3">
            {historyLogbooks.map(renderLogItem)}
          </div>
        </>
      )}

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
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3.5 py-2.5 text-xs text-yellow-700 font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Offline — data & bukti akan otomatis terupload saat online.</span>
                </div>
              )}
              {pelatihanList.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Pelatihan *</label>
                  <select
                    value={selectedPelatihanId || ''}
                    onChange={e => setSelectedPelatihanId(e.target.value)}
                    required
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                  >
                    {pelatihanList.map(p => (
                      <option key={p.id} value={p.id}>{p.nama}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tanggal *</label>
                <input type="date" value={form.tanggal}
                  onChange={e => setForm({ ...form, tanggal: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Topik yang Dipelajari *</label>
                <input type="text" value={form.topik}
                  onChange={e => setForm({ ...form, topik: e.target.value })}
                  placeholder="Contoh: React Hooks & State Management"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tugas/Proyek yang Dikerjakan *</label>
                <textarea value={form.tugas}
                  onChange={e => setForm({ ...form, tugas: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Hasil *</label>
                <textarea value={form.hasil}
                  onChange={e => setForm({ ...form, hasil: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Kendala <span className="text-gray-400 normal-case font-normal">(opsional)</span></label>
                <textarea value={form.kendala}
                  onChange={e => setForm({ ...form, kendala: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 resize-none" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Jam Mulai &amp; Selesai *</label>
                <div className="flex gap-2 items-center">
                  <input type="time" value={form.jam_mulai}
                    onChange={e => setForm({ ...form, jam_mulai: e.target.value })}
                    className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
                  <span className="text-gray-400 text-sm flex-shrink-0">s/d</span>
                  <input type="time" value={form.jam_selesai}
                    onChange={e => setForm({ ...form, jam_selesai: e.target.value })}
                    className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                {previewDurasi() && <p className="text-xs text-blue-500 font-medium mt-1.5">Durasi: {previewDurasi()}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Link Dokumentasi (Drive) *</label>
                <input type="text" value={form.link_dokumentasi_drive}
                  onChange={e => setForm({ ...form, link_dokumentasi_drive: e.target.value })}
                  placeholder="https://drive.google.com/..."
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Bukti Kegiatan *
                </label>
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setBuktiType('file')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold border transition-all
                      ${
                        buktiType === 'file'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'
                      }`}
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload File</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBuktiType('link')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold border transition-all
                      ${
                        buktiType === 'link'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'
                      }`}
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Link URL</span>
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
                        <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-1" />
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
                  <input type="text" value={buktiLink} onChange={e => setBuktiLink(e.target.value)}
                    onBlur={e => setBuktiLink(normalizeUrl(e.target.value))}
                    placeholder="paste link here"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
                )}
              </div>

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
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Topik yang Dipelajari *</label>
                <input type="text" value={editForm.topik}
                  onChange={e => setEditForm({ ...editForm, topik: e.target.value })}
                  placeholder="Contoh: React Hooks & State Management"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tugas/Proyek yang Dikerjakan *</label>
                <textarea value={editForm.tugas}
                  onChange={e => setEditForm({ ...editForm, tugas: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Hasil *</label>
                <textarea value={editForm.hasil}
                  onChange={e => setEditForm({ ...editForm, hasil: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Kendala <span className="text-gray-400 normal-case font-normal">(opsional)</span></label>
                <textarea value={editForm.kendala}
                  onChange={e => setEditForm({ ...editForm, kendala: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 resize-none" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Jam Mulai &amp; Selesai *</label>
                <div className="flex gap-2 items-center">
                  <input type="time" value={editForm.jam_mulai}
                    onChange={e => setEditForm({ ...editForm, jam_mulai: e.target.value })}
                    className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
                  <span className="text-gray-400 text-sm flex-shrink-0">s/d</span>
                  <input type="time" value={editForm.jam_selesai}
                    onChange={e => setEditForm({ ...editForm, jam_selesai: e.target.value })}
                    className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                {hitungDurasiMenit(editForm.jam_mulai, editForm.jam_selesai) && (
                  <p className="text-xs text-blue-500 font-medium mt-1.5">
                    Durasi: {formatDurasi(hitungDurasiMenit(editForm.jam_mulai, editForm.jam_selesai))}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Link Dokumentasi (Drive) *</label>
                <input type="text" value={editForm.link_dokumentasi_drive}
                  onChange={e => setEditForm({ ...editForm, link_dokumentasi_drive: e.target.value })}
                  placeholder="https://drive.google.com/..."
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Bukti * <span className="text-gray-400 normal-case font-normal">(PDF / JPG / PNG · maks 20 MB)</span>
                </label>
                <div className="flex gap-2 mb-3">
                  <button type="button" onClick={() => { setEditBuktiType('file'); setEditBuktiLink('') }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold border transition-all
                      ${editBuktiType === 'file' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'}`}>
                    <Upload className="w-4 h-4" />
                    <span>Upload File</span>
                  </button>
                  <button type="button" onClick={() => { setEditBuktiType('link'); setEditForm(f => ({ ...f, bukti: null, hapusBukti: false })) }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold border transition-all
                      ${editBuktiType === 'link' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'}`}>
                    <ExternalLink className="w-4 h-4" />
                    <span>Link URL</span>
                  </button>
                </div>

                {editBuktiType === 'file' ? (
                  <>
                    {editLog.cloudinary_public_id && !editForm.hapusBukti && !editForm.bukti ? (
                      <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-600" />
                          <p className="text-sm text-blue-700 truncate max-w-[200px]">{editLog.bukti_link.split('/').pop()}</p>
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
                            <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-1" />
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
                  <input type="text" value={editBuktiLink} onChange={e => setEditBuktiLink(e.target.value)}
                    onBlur={e => setEditBuktiLink(normalizeUrl(e.target.value))}
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