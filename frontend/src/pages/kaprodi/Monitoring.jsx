import { useEffect, useState, useCallback, useMemo } from 'react'
import { Search, BarChart3, CheckCircle, XCircle, Clock, FileText, Eye, Award, GraduationCap, User, X, Download, ExternalLink } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import usePeriodeFilter from '../../hooks/usePeriodeFilter'
import BuktiPreview, { FileBuktiPreview } from '../../components/common/BuktiPreview'
const BASE_URL = ''

const STATUS_CONFIG = {
  diupload:          { label: 'Menunggu',      color: 'text-yellow-600', bg: 'bg-yellow-50',  border: 'border-yellow-200', icon: Clock },
  diajukan:          { label: 'Menunggu',      color: 'text-yellow-600', bg: 'bg-yellow-50',  border: 'border-yellow-200', icon: Clock },
  revisi_kaprodi:    { label: 'Revisi',        color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200',    icon: XCircle },
  disetujui_kaprodi: { label: 'Disetujui',     color: 'text-blue-600',   bg: 'bg-blue-50',    border: 'border-blue-200',   icon: Clock },
  disetujui_dospem:  { label: 'Disetujui Dospem', color: 'text-blue-600', bg: 'bg-blue-50',   border: 'border-blue-200',   icon: Clock },
  revisi_dospem:     { label: 'Revisi Dospem', color: 'text-orange-600', bg: 'bg-orange-50',  border: 'border-orange-200', icon: XCircle },
  diverifikasi:      { label: 'Diverifikasi',  color: 'text-green-600',  bg: 'bg-green-50',   border: 'border-green-200',  icon: CheckCircle },
  revisi:            { label: 'Revisi',        color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200',    icon: XCircle },
  ditolak:           { label: 'Ditolak',       color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200',    icon: XCircle },
}

const STATUS_BADGE_MAP = {
  diupload:          'bg-blue-100 text-blue-700',
  diverifikasi:      'bg-green-100 text-green-700',
  disetujui:         'bg-green-100 text-green-700',
  disetujui_kaprodi: 'bg-green-100 text-green-700',
  disetujui_dospem:  'bg-blue-100 text-blue-700',
  revisi:            'bg-red-100 text-red-700',
  revisi_kaprodi:    'bg-red-100 text-red-700',
  revisi_dospem:     'bg-orange-100 text-orange-700',
  ditolak:           'bg-red-100 text-red-700',
}

const STATUS_BADGE_LABEL = {
  diupload:          'Diupload',
  diverifikasi:      'Diverifikasi',
  disetujui:         'Disetujui',
  disetujui_kaprodi: 'Disetujui',
  disetujui_dospem:  'Disetujui Dospem',
  revisi:            'Revisi',
  revisi_kaprodi:    'Revisi',
  revisi_dospem:     'Revisi Dospem',
  ditolak:           'Ditolak',
}

// Format angka jam (desimal) jadi label "X jam Y menit" yang ringkas dibaca kaprodi/dosen
const formatJam = (jamDesimal) => {
  const totalMenit = Math.round((Number(jamDesimal) || 0) * 60)
  const j = Math.floor(totalMenit / 60)
  const m = totalMenit % 60
  if (j === 0 && m === 0) return '0 jam'
  if (m === 0) return `${j} jam`
  if (j === 0) return `${m} menit`
  return `${j} jam ${m} menit`
}

// Progress jam terverifikasi terhadap minimal jam yang ditentukan Kaprodi (per periode)
const ProgressJamCell = ({ jam, minJam }) => {
  const jamNum = Number(jam) || 0
  const min = Number(minJam) || 0
  const percent = min > 0 ? Math.min(100, Math.round((jamNum / min) * 100)) : 0
  const done = min > 0 && jamNum >= min

  return (
    <div className="flex flex-col items-center gap-1 min-w-[100px] mx-auto">
      <span className={`text-xs font-semibold ${done ? 'text-green-600' : 'text-gray-700'}`}>
        {formatJam(jamNum)}
        {min > 0 && <span className="text-gray-400 font-normal"> / {formatJam(min)}</span>}
      </span>
      {min > 0 && (
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${done ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  )
}

const StatusBadge = ({ status }) => {
  if (!status) return <span className="text-xs text-gray-300">Belum</span>
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE_MAP[status] || 'bg-gray-100 text-gray-600'}`}>
      {STATUS_BADGE_LABEL[status] || status}
    </span>
  )
}
const NilaiBadge = ({ nilai }) => {
  if (nilai === null || nilai === undefined) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-400">
        Belum Final
      </span>
    )
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-violet-50 text-violet-700 border border-violet-100">
      {nilai}
    </span>
  )
}

const LaporanModal = ({ row, onClose, onRefresh }) => {
  const [feedback, setFeedback]     = useState('')
  const [processing, setProcessing] = useState(false)

  const dok        = row.dokumen_laporan
  const statusKey  = dok?.status || 'diupload'
  const cfg        = STATUS_CONFIG[statusKey] || STATUS_CONFIG.diupload
  const StatusIcon = cfg.icon
  const canAksi    = statusKey === 'disetujui_dospem'

  const handleVerifikasi = async (status) => {
    setProcessing(true)
    try {
      await api.patch(`/kaprodi/dokumen/${dok.id}/verifikasi`, { status, feedback })
      toast.success(
        status === 'disetujui_kaprodi'
          ? 'Laporan disetujui, masuk ke antrian Dosen Pembimbing.'
          : 'Laporan diminta revisi.'
      )
      onClose()
      onRefresh()
    } catch {
      toast.error('Gagal memproses, coba lagi.')
    } finally {
      setProcessing(false)
    }
  }

  const fileUrl = dok?.cloudinary_url

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col" style={{ height: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-bold text-gray-800 text-sm truncate">{row.nama} — {row.nim}</p>
            <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${cfg.color} ${cfg.bg} ${cfg.border}`}>
              <StatusIcon className="w-3 h-3" />
              {cfg.label}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold ml-3 flex-shrink-0">×</button>
        </div>
        <div className="flex-1 overflow-hidden">
          <FileBuktiPreview path={fileUrl} filename={dok?.nama_file} />
        </div>
        {canAksi && (
          <div className="px-5 py-4 border-t border-gray-100 space-y-3 flex-shrink-0">
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5 text-left">
                Feedback <span className="font-normal text-gray-400">(opsional)</span>
              </p>
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                rows={2}
                placeholder="Tambahkan catatan untuk mahasiswa..."
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleVerifikasi('revisi_kaprodi')} disabled={processing}
                className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 transition-colors">
                <XCircle className="w-4 h-4" /> Revisi
              </button>
              <button onClick={() => handleVerifikasi('disetujui_kaprodi')} disabled={processing}
                className="flex-1 py-2.5 bg-green-50 hover:bg-green-100 text-green-600 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 transition-colors">
                <CheckCircle className="w-4 h-4" /> {processing ? 'Memproses...' : 'Setujui'}
              </button>
            </div>
          </div>
        )}
        {!canAksi && (
          <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
              <StatusIcon className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm font-medium">
                {statusKey === 'diverifikasi'
                  ? 'Laporan akhir telah diverifikasi'
                  : 'Menunggu persetujuan Dosen Pembimbing'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const PptCell = ({ doc }) => {
  const [preview, setPreview] = useState(false)
  if (!doc) return <span className="text-xs text-gray-300">Belum</span>
  const fileUrl = doc.cloudinary_url
  return (
    <>
      <button onClick={() => setPreview(true)}
        className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors mx-auto">
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/>
        </svg>
        <span className="text-xs font-semibold">PPT</span>
      </button>
      {preview && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPreview(false)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col" style={{ height: '90vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
              <p className="font-bold text-gray-800 text-sm">{doc.nama_file}</p>
              <button onClick={() => setPreview(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl">
              <FileBuktiPreview path={fileUrl} filename={doc.nama_file} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const LAPORAN_COLOR_MAP = {
  diupload:          'bg-yellow-50 hover:bg-yellow-100 text-yellow-600',
  diajukan:          'bg-yellow-50 hover:bg-yellow-100 text-yellow-600',
  disetujui_dospem:  'bg-yellow-50 hover:bg-yellow-100 text-yellow-600',
  revisi_kaprodi:    'bg-red-50 hover:bg-red-100 text-red-600',
  revisi:            'bg-red-50 hover:bg-red-100 text-red-600',
  disetujui_kaprodi: 'bg-green-50 hover:bg-green-100 text-green-600',
  diverifikasi:      'bg-green-50 hover:bg-green-100 text-green-600',
  revisi_dospem:     'bg-orange-50 hover:bg-orange-100 text-orange-600',
  ditolak:           'bg-red-50 hover:bg-red-100 text-red-600',
}

const LAPORAN_LABEL_MAP = {
  diupload:          'Menunggu',
  diajukan:          'Menunggu',
  disetujui_dospem:  'Menunggu',
  revisi_kaprodi:    'Revisi',
  revisi:            'Revisi',
  disetujui_kaprodi: 'Disetujui',
  diverifikasi:      'Diverifikasi',
  revisi_dospem:     'Revisi Dospem',
  ditolak:           'Ditolak',
}

const LaporanCell = ({ doc, row, onRefresh }) => {
  const [open, setOpen] = useState(false)
  if (!doc) return <span className="text-xs text-gray-300">Belum</span>
  const statusKey = doc.status || 'diupload'
  return (
    <>
      <button onClick={() => setOpen(true)}
        className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors mx-auto ${LAPORAN_COLOR_MAP[statusKey] || 'bg-gray-50 hover:bg-gray-100 text-gray-600'}`}>
        <FileText className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-xs font-semibold">{LAPORAN_LABEL_MAP[statusKey] || 'Laporan'}</span>
      </button>
      {open && <LaporanModal row={row} onClose={() => setOpen(false)} onRefresh={onRefresh} />}
    </>
  )
}

const LOGBOOK_PAGE_SIZE = 8

const LogbookBuktiCell = ({ log }) => {
  const [open, setOpen] = useState(false)

  if (!log.bukti_link) {
    return <span className="text-xs text-gray-300">-</span>
  }

  const isUploadedFile = !!log.cloudinary_public_id

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-semibold"
      >
        <Eye className="w-3.5 h-3.5" />
        Lihat
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col" style={{ height: '80vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
              <p className="font-bold text-gray-800 text-sm truncate">Bukti — {log.kegiatan}</p>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl">
              <BuktiPreview
                path={isUploadedFile ? log.bukti_link : null}
                link={!isUploadedFile ? log.bukti_link : null}
                filename={log.kegiatan}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const DetailMahasiswaModal = ({ row, onClose }) => {
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [logPage, setLogPage] = useState(1)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/kaprodi/monitoring/${row.pengajuan_id}`)
      setDetail(res.data.data)
    } catch {
      toast.error('Gagal memuat detail mahasiswa!')
    } finally {
      setLoading(false)
    }
  }, [row.pengajuan_id])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  const logbook = detail?.logbook || []

  const logTotalPages = useMemo(
    () => Math.ceil(logbook.length / LOGBOOK_PAGE_SIZE),
    [logbook.length]
  )

  const logPaginated = useMemo(
    () => logbook.slice((logPage - 1) * LOGBOOK_PAGE_SIZE, logPage * LOGBOOK_PAGE_SIZE),
    [logbook, logPage]
  )

  const minJamDetail = Number(detail?.min_jam_pengajuan) || 0
  const jamDetailDone = minJamDetail > 0 && Number(detail?.total_jam_terverifikasi) >= minJamDetail

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-800">{row.nama}</h2>
            <p className="text-xs text-gray-400 font-mono">{row.nim}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading || !detail ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="p-5 space-y-6">

              {/* Informasi Mahasiswa */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3">Informasi Mahasiswa</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { icon: User, label: 'NIM', value: detail.nim },
                    { icon: User, label: 'Nama', value: detail.nama },
                    { icon: GraduationCap, label: 'Program MBKM', value: detail.program_mbkm || '-' },
                    { icon: User, label: 'Dosen Pembimbing', value: detail.dosen_pembimbing || 'Belum ditentukan' },
                    { icon: Clock, label: 'Status MBKM', value: <StatusBadge status={detail.status_pengajuan} /> },
                    { icon: Clock, label: 'Total Jam Logbook Terverifikasi', value: (
                      <span className={jamDetailDone ? 'text-green-700 font-semibold' : ''}>
                        {formatJam(detail.total_jam_terverifikasi)}
                        {minJamDetail > 0 && ` / ${formatJam(minJamDetail)}`}
                      </span>
                    ) },
                  ].map((f, i) => (
                    <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5">
                      <p className="text-xs text-gray-400 mb-0.5">{f.label}</p>
                      <div className="text-sm font-medium text-gray-800">{f.value}</div>
                    </div>
                  ))}
                </div>
              </div>

             {/* Logbook*/}
<div>
  <h3 className="text-sm font-bold text-gray-700 mb-1">Logbook</h3>
  <p className="text-xs text-gray-400 mb-3">
    {detail.nim} - {detail.nama} · {formatJam(detail.total_jam_terverifikasi)}
    {minJamDetail > 0 && ` / ${formatJam(minJamDetail)}`} terverifikasi
  </p>
  {logbook.length === 0 ? (
    <p className="text-sm text-gray-400 italic">Belum ada entri logbook.</p>
  ) : (
    <>
      <div className="border border-gray-100 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Tanggal</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Jam</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Kegiatan</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Durasi</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Bukti</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logPaginated.map(l => (
              <tr key={l.id}>
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                  {new Date(l.tanggal).toLocaleDateString('id-ID')}
                </td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                  {l.jam_mulai?.slice(0, 5)}–{l.jam_selesai?.slice(0, 5)}
                </td>
                <td className="px-3 py-2 text-gray-800">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>{l.kegiatan}</span>
                    {l.nama_pelatihan && (
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                        {l.nama_pelatihan}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                  {l.durasi_menit != null ? `${Math.round(l.durasi_menit)} menit` : '-'}
                </td>
                <td className="px-3 py-2 text-center whitespace-nowrap">
                  <LogbookBuktiCell log={l} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {logTotalPages > 1 && (
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400">
            Halaman {logPage} dari {logTotalPages}
          </span>
          <div className="flex gap-1">
            <button onClick={() => setLogPage(p => Math.max(1, p - 1))} disabled={logPage === 1}
              className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              ‹ Prev
            </button>
            <button onClick={() => setLogPage(p => Math.min(logTotalPages, p + 1))} disabled={logPage === logTotalPages}
              className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              Next ›
            </button>
          </div>
        </div>
      )}
    </>
  )}
</div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function KaprodiMonitoring() {
  const [data, setData]                       = useState([])
  const [minJam, setMinJam]                   = useState(0)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [loading, setLoading]                 = useState(true)
  const [currentPage, setCurrentPage]         = useState(1)
  const [selectedRow, setSelectedRow]         = useState(null)
  const PAGE_SIZE = 10

  const {
    periodeId: selectedPeriode,
    periodeList: periode,
    setLocalPeriode,
  } = usePeriodeFilter('kaprodi')

 const fetchMonitoring = useCallback(async () => {
  if (!selectedPeriode) {
    setLoading(false)
    return
  }
  setLoading(true)
  try {
    const res = await api.get('/kaprodi/monitoring', { params: { periode_id: selectedPeriode } })
    setData(res.data.data || [])
    setMinJam(res.data.min_jam_pengajuan || 0)
  } catch {
    toast.error('Gagal memuat data monitoring!')
  } finally {
    setLoading(false)
  }
}, [selectedPeriode])

  useEffect(() => { if (selectedPeriode) fetchMonitoring() }, [selectedPeriode, fetchMonitoring])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return data.filter(m => {
      const cocokSearch = m.nama?.toLowerCase().includes(q) || m.nim?.toLowerCase().includes(q)
      const cocokStatus = !filterStatus || m.status_pengajuan === filterStatus
      return cocokSearch && cocokStatus
    })
  }, [data, search, filterStatus])

  const totalPages = useMemo(() => Math.ceil(filtered.length / PAGE_SIZE), [filtered.length])

  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  )

const stats = useMemo(() => ({
  total:           data.length,
  laporan_selesai: data.filter(m => m.dokumen_laporan?.status === 'diverifikasi').length,
  ppt_selesai:     data.filter(m => m.dokumen_ppt?.status === 'diverifikasi').length,
  lengkap:         data.filter(m => m.dokumen_lengkap).length,
}), [data])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Monitoring Dokumen</h1>
        <p className="text-gray-500 text-sm mt-1">Pantau progress pengumpulan dokumen mahasiswa</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Mahasiswa', val: stats.total,           color: 'bg-blue-500' },
          { label: 'Laporan Selesai', val: stats.laporan_selesai, color: 'bg-green-500' },
          { label: 'PPT Selesai',     val: stats.ppt_selesai,     color: 'bg-orange-500' },
          { label: 'Dokumen Lengkap', val: stats.lengkap,         color: 'bg-violet-500' },
        ].map(({ label, val, color }) => (
          <div key={label} className={`${color} rounded-2xl p-4 text-white`}>
            <p className="text-xs opacity-80">{label}</p>
            <p className="text-3xl font-bold mt-1">{val}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
            placeholder="Cari nama atau NIM..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
        </div>
        <select value={selectedPeriode} onChange={e => {
          setLocalPeriode(periode.find(p => String(p.id) === String(e.target.value)))
          setCurrentPage(1)
        }}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
          {periode.map(p => (
            <option key={p.id} value={p.id}>{p.nama_periode}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1) }}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
          <option value="">Semua Status</option>
          <option value="diajukan">Menunggu</option>
          <option value="disetujui_kaprodi">Disetujui</option>
          <option value="revisi">Revisi</option>
          <option value="ditolak">Ditolak</option>
        </select>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">Progress Dokumen Mahasiswa</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">No</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">NIM</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Nama</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Pengajuan</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Logbook</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Laporan</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase">PPT</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Nilai</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400 text-sm">
                  <BarChart3 className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  Belum ada data
                </td></tr>
              ) : paginated.map((m, i) => (
                <tr key={m.pengajuan_id || i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-500">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-700">{m.nim}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-800">{m.nama}</td>
                  <td className="px-6 py-4 text-center"><StatusBadge status={m.status_pengajuan} /></td>
                  <td className="px-6 py-4 text-center">
                    <ProgressJamCell jam={m.total_jam_terverifikasi} minJam={minJam} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <LaporanCell doc={m.dokumen_laporan} row={m} onRefresh={fetchMonitoring} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <PptCell doc={m.dokumen_ppt} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <NilaiBadge nilai={m.nilai_akhir} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button onClick={() => setSelectedRow(m)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-semibold transition-colors">
                      <Eye className="w-3.5 h-3.5" /> Lihat
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-3 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Menampilkan {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} dari {filtered.length} mahasiswa
          </span>
          <div className="flex items-center gap-1">
            {(() => {
              const GROUP = 5
              const groupIndex = Math.floor((currentPage - 1) / GROUP)
              const groupStart = groupIndex * GROUP + 1
              const groupEnd   = Math.min(groupStart + GROUP - 1, totalPages)
              const isFirstGroup = groupStart === 1
              const isLastGroup  = groupEnd === totalPages
              return (
                <>
                  <button
                    onClick={() => setCurrentPage(groupStart - GROUP)}
                    disabled={isFirstGroup}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ‹ Prev
                  </button>
                  {Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
                        page === currentPage
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(groupStart + GROUP)}
                    disabled={isLastGroup}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next ›
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {selectedRow && (
        <DetailMahasiswaModal row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  )
}