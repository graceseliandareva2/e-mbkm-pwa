import { useEffect, useState, useCallback } from 'react'
import { Search, BarChart3, CheckCircle, XCircle, Clock, FileText } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import usePeriodeStore from '../../store/periodeStore'

const BASE_URL = ''
const MIN_JAM = 48

const STATUS_CONFIG = {
  diupload:          { label: 'Menunggu',      color: 'text-yellow-600', bg: 'bg-yellow-50',  border: 'border-yellow-200', icon: Clock },
  diajukan:          { label: 'Menunggu',      color: 'text-yellow-600', bg: 'bg-yellow-50',  border: 'border-yellow-200', icon: Clock },
  revisi_kaprodi:    { label: 'Revisi',        color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200',    icon: XCircle },
  disetujui_kaprodi: { label: 'Disetujui',     color: 'text-blue-600',   bg: 'bg-blue-50',    border: 'border-blue-200',   icon: Clock },
  revisi_dospem:     { label: 'Revisi Dospem', color: 'text-orange-600', bg: 'bg-orange-50',  border: 'border-orange-200', icon: XCircle },
  diverifikasi:      { label: 'Diverifikasi',  color: 'text-green-600',  bg: 'bg-green-50',   border: 'border-green-200',  icon: CheckCircle },
  revisi:            { label: 'Revisi',        color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200',    icon: XCircle },
  ditolak:           { label: 'Ditolak',       color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200',    icon: XCircle },
}

const StatusBadge = ({ status }) => {
  const map = {
    diupload:          'bg-blue-100 text-blue-700',
    diverifikasi:      'bg-green-100 text-green-700',
    disetujui:         'bg-green-100 text-green-700',
    disetujui_kaprodi: 'bg-green-100 text-green-700',
    revisi:            'bg-red-100 text-red-700',
    revisi_kaprodi:    'bg-red-100 text-red-700',
    ditolak:           'bg-red-100 text-red-700',
  }
  const label = {
    diupload:          'Diupload',
    diverifikasi:      'Diverifikasi',
    disetujui:         'Disetujui',
    disetujui_kaprodi: 'Disetujui',
    revisi:            'Revisi',
    revisi_kaprodi:    'Revisi',
    ditolak:           'Ditolak',
  }
  if (!status) return <span className="text-xs text-gray-300">Belum</span>
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {label[status] || status}
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
  const canAksi    = ['diupload', 'diajukan'].includes(statusKey)

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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold ml-3 flex-shrink-0">✕</button>
        </div>
        <div className="flex-1 overflow-hidden">
          <iframe src={`${BASE_URL}/${dok.path_file}`} className="w-full h-full" title={dok.nama_file} />
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
            {statusKey === 'revisi_kaprodi' && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm font-medium">Menunggu revisi dari mahasiswa</p>
              </div>
            )}
            {statusKey === 'disetujui_kaprodi' && (
              <div className="flex items-center gap-2 text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm font-medium">Sudah disetujui, menunggu verifikasi Dosen Pembimbing</p>
              </div>
            )}
            {statusKey === 'revisi_dospem' && (
              <div className="flex items-center gap-2 text-orange-600 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm font-medium">Dosen Pembimbing meminta revisi dari mahasiswa</p>
              </div>
            )}
            {statusKey === 'diverifikasi' && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm font-medium">Laporan akhir telah diverifikasi oleh Dosen Pembimbing</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const PptCell = ({ doc }) => {
  const [preview, setPreview] = useState(false)
  if (!doc) return <span className="text-xs text-gray-300">Belum</span>
  const fileUrl = `${BASE_URL}/${doc.path_file}`
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
              <button onClick={() => setPreview(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl">
              <iframe src={fileUrl} className="w-full h-full" title="Preview PPT" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const LaporanCell = ({ doc, row, onRefresh }) => {
  const [open, setOpen] = useState(false)
  if (!doc) return <span className="text-xs text-gray-300">Belum</span>
  const statusKey = doc.status || 'diupload'
  const colorMap = {
    diupload:          'bg-blue-50 hover:bg-blue-100 text-blue-600',
    diajukan:          'bg-yellow-50 hover:bg-yellow-100 text-yellow-600',
    revisi_kaprodi:    'bg-red-50 hover:bg-red-100 text-red-600',
    revisi:            'bg-red-50 hover:bg-red-100 text-red-600',
    disetujui_kaprodi: 'bg-green-50 hover:bg-green-100 text-green-600',
    diverifikasi:      'bg-green-50 hover:bg-green-100 text-green-600',
    revisi_dospem:     'bg-orange-50 hover:bg-orange-100 text-orange-600',
    ditolak:           'bg-red-50 hover:bg-red-100 text-red-600',
  }
  const labelMap = {
    diupload:          'Laporan',
    diajukan:          'Menunggu',
    revisi_kaprodi:    'Revisi',
    revisi:            'Revisi',
    disetujui_kaprodi: 'Disetujui',
    diverifikasi:      'Diverifikasi',
    revisi_dospem:     'Revisi Dospem',
    ditolak:           'Ditolak',
  }
  return (
    <>
      <button onClick={() => setOpen(true)}
        className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors mx-auto ${colorMap[statusKey] || 'bg-gray-50 hover:bg-gray-100 text-gray-600'}`}>
        <FileText className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-xs font-semibold">{labelMap[statusKey] || 'Laporan'}</span>
      </button>
      {open && <LaporanModal row={row} onClose={() => setOpen(false)} onRefresh={onRefresh} />}
    </>
  )
}

export default function KaprodiMonitoring() {
  const [data, setData]                       = useState([])
  const [periode, setPeriode]                 = useState([])
  const [selectedPeriode, setSelectedPeriode] = useState('')
  const [search, setSearch]                   = useState('')
  const [loading, setLoading]                 = useState(true)
  const [currentPage, setCurrentPage]         = useState(1)
  const PAGE_SIZE = 10

  const { selectedPeriodeKaprodi } = usePeriodeStore()

  const fetchMonitoring = useCallback(async () => {
    if (!selectedPeriode) return
    setLoading(true)
    try {
      const res = await api.get('/kaprodi/monitoring', { params: { periode_id: selectedPeriode } })
      setData(res.data.data || [])
    } catch {
      toast.error('Gagal memuat data monitoring!')
    } finally {
      setLoading(false)
    }
  }, [selectedPeriode])

  useEffect(() => { fetchPeriode() }, [])
  useEffect(() => { if (selectedPeriode) fetchMonitoring() }, [selectedPeriode, fetchMonitoring])

  useEffect(() => {
    if (selectedPeriodeKaprodi && periode.some(p => p.id === selectedPeriodeKaprodi.id)) {
      setSelectedPeriode(selectedPeriodeKaprodi.id)
    }
  }, [selectedPeriodeKaprodi])

  const fetchPeriode = async () => {
    try {
      const res = await api.get('/kaprodi/periode')
      const periodeData = res.data.data || []
      setPeriode(periodeData)
      const dariProfile = selectedPeriodeKaprodi && periodeData.find(p => p.id === selectedPeriodeKaprodi.id)
      const aktif = periodeData.find(p => p.is_active)
      const defaultPeriode = dariProfile || aktif || periodeData[0]
      if (defaultPeriode) setSelectedPeriode(defaultPeriode.id)
    } catch {
      toast.error('Gagal memuat periode!')
    }
  }

  const filtered = data.filter(m =>
    m.nama?.toLowerCase().includes(search.toLowerCase()) ||
    m.nim?.toLowerCase().includes(search.toLowerCase())
  )
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const stats = {
    total:           data.length,
    laporan_selesai: data.filter(m => m.dokumen_laporan !== null).length,
    ppt_selesai:     data.filter(m => m.dokumen_ppt !== null).length,
    lengkap:         data.filter(m =>
      (m.total_jam_terverifikasi || 0) >= MIN_JAM &&
      m.dokumen_laporan !== null &&
      m.dokumen_ppt !== null
    ).length,
  }

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
        <select value={selectedPeriode} onChange={e => { setSelectedPeriode(e.target.value); setCurrentPage(1) }}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
          {periode.map(p => (
            <option key={p.id} value={p.id}>{p.nama_periode}</option>
          ))}
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                  <BarChart3 className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  Belum ada data
                </td></tr>
              ) : paginated.map((m, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-500">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-700">{m.nim}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-800">{m.nama}</td>
                  <td className="px-6 py-4 text-center"><StatusBadge status={m.status_pengajuan} /></td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-sm font-semibold text-gray-700">{m.jumlah_logbook || 0}</span>
                    <span className="text-xs text-gray-400 ml-1">entri</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <LaporanCell doc={m.dokumen_laporan} row={m} onRefresh={fetchMonitoring} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <PptCell doc={m.dokumen_ppt} />
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
    </div>
  )
}