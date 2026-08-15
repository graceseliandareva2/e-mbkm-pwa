import { useEffect, useState, useCallback } from 'react'
import { Search, BarChart3, Clock, FileText, Eye, GraduationCap, User, X, Download } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import usePeriodeFilter from '../../hooks/usePeriodeFilter'
import BuktiPreview, { FileBuktiPreview } from '../../components/common/BuktiPreview'

const ROUTE_LIST     = '/staff/mahasiswa-mbkm'  
const ROUTE_LOGBOOK  = '/staff/logbook'       
const ROUTE_DOKUMEN  = '/staff/dokumen'         
const ROUTE_NILAI    = '/staff/nilai'           

const STATUS_CONFIG = {
  diupload:          { label: 'Diupload',      color: 'text-yellow-600', bg: 'bg-yellow-50',  border: 'border-yellow-200' },
  diajukan:          { label: 'Menunggu',      color: 'text-yellow-600', bg: 'bg-yellow-50',  border: 'border-yellow-200' },
  revisi_kaprodi:    { label: 'Revisi Kaprodi', color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200' },
  revisi_dospem:     { label: 'Revisi Dospem', color: 'text-orange-600', bg: 'bg-orange-50',  border: 'border-orange-200' },
  disetujui_kaprodi: { label: 'Disetujui Kaprodi', color: 'text-blue-600', bg: 'bg-blue-50',  border: 'border-blue-200' },
  disetujui_dospem:  { label: 'Disetujui Dospem', color: 'text-blue-600', bg: 'bg-blue-50',   border: 'border-blue-200' },
  diverifikasi:      { label: 'Diverifikasi',  color: 'text-green-600',  bg: 'bg-green-50',   border: 'border-green-200' },
}

const StatusBadge = ({ status }) => {
  if (!status) return <span className="text-xs text-gray-300">Belum</span>
  const cfg = STATUS_CONFIG[status] || { label: status, color: 'text-gray-600', bg: 'bg-gray-100', border: 'border-gray-200' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

const PreviewModal = ({ preview, onClose }) => {
  if (!preview) return null
  const { title, subtitle, path, link, filename } = preview

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col" style={{ height: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0">
          <div className="min-w-0">
            <p className="font-bold text-gray-800 text-sm truncate">{title}</p>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden bg-gray-50 flex flex-col rounded-b-2xl">
          {path ? (
            <FileBuktiPreview path={path} filename={filename} />
          ) : (
            <BuktiPreview link={link} filename={filename} />
          )}
        </div>
      </div>
    </div>
  )
}

const DokumenSection = ({ dok, label, onPreview }) => {
  if (!dok) return <p className="text-sm text-gray-400 italic">{label} belum diupload.</p>
  const fileUrl = dok.cloudinary_url
  return (
    <div className="space-y-2">
      <div className="w-fit">
        <StatusBadge status={dok.status} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onPreview({ title: label, subtitle: dok.nama_file, path: fileUrl, filename: dok.nama_file })}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-xs font-semibold transition-colors">
          <Eye className="w-3.5 h-3.5" /> Preview
        </button>
        <a href={fileUrl} download target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold transition-colors">
          <Download className="w-3.5 h-3.5" /> Download
        </a>
      </div>
    </div>
  )
}

const LOGBOOK_STATUS_CONFIG = {
  menunggu:      { label: 'Menunggu',      color: 'text-yellow-600', bg: 'bg-yellow-50' },
  disetujui:     { label: 'Disetujui',     color: 'text-green-600',  bg: 'bg-green-50' },
  ditolak:       { label: 'Ditolak',       color: 'text-red-600',    bg: 'bg-red-50' },
}

const LogbookStatusBadge = ({ status }) => {
  if (!status) return <span className="text-xs text-gray-300">-</span>
  const cfg = LOGBOOK_STATUS_CONFIG[status] || { label: status, color: 'text-gray-600', bg: 'bg-gray-100' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

const formatJam = (jam) => (jam ? String(jam).slice(0, 5) : '-')

const formatDurasi = (menit) => {
  if (menit == null) return '-'
  const j = Math.floor(menit / 60)
  const m = menit % 60
  if (j === 0) return `${m}m`
  if (m === 0) return `${j}j`
  return `${j}j ${m}m`
}

// Kolom "Pelatihan" dihapus dari sini -- nama_pelatihan itu properti per PENGAJUAN
// (detail_pengajuan.nama_pelatihan, 1 pengajuan = 1 pelatihan), bukan per baris logbook.
// Sekarang ditampilkan sekali di bagian "Informasi Mahasiswa" (lihat DetailMahasiswaModal).
const LogbookSection = ({ logbook, onPreview }) => {
  if (!logbook.length) {
    return <p className="text-sm text-gray-400 italic">Belum ada entri logbook.</p>
  }

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Tanggal</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Jam</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Kegiatan</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Durasi</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Bukti</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logbook.map((l) => {
              const isFileUpload = !!l.cloudinary_public_id
              const isLinkOnly = !isFileUpload && !!l.bukti_link
              return (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                    {l.tanggal
                      ? new Date(l.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                    {formatJam(l.jam_mulai)}–{formatJam(l.jam_selesai)}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 max-w-xs">{l.kegiatan || '-'}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-center whitespace-nowrap">{formatDurasi(l.durasi_menit)}</td>
                  <td className="px-3 py-2.5 text-center"><LogbookStatusBadge status={l.status} /></td>
                  <td className="px-3 py-2.5 text-center">
                    {isFileUpload || isLinkOnly ? (
                      <button
                        onClick={() => onPreview({
                          title: 'Bukti Kegiatan',
                          subtitle: l.kegiatan,
                          path: isFileUpload ? l.bukti_link : null,
                          link: isFileUpload ? null : l.bukti_link,
                          filename: l.kegiatan,
                        })}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
const NilaiSection = ({ nilai }) => {
  if (!nilai) {
    return <p className="text-sm text-gray-400 italic">Nilai belum tersedia</p>
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
        <p className="text-xs text-gray-400 mb-0.5">Nilai Akhir</p>
        <p className="text-sm font-semibold text-gray-800">{nilai.nilai_akhir ?? '-'}</p>
      </div>
      <div className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
        <p className="text-xs text-gray-400 mb-0.5">Dosen Pembimbing</p>
        <p className="text-sm font-semibold text-gray-800">{nilai.nama_dosen || '-'}</p>
      </div>
    </div>
  )
}
const DetailMahasiswaModal = ({ row, onClose }) => {
  const [logbook, setLogbook]   = useState([])
  const [nilai, setNilai]       = useState(null)
  const [dokumen, setDokumen]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [preview, setPreview]   = useState(null)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    try {
      const [logRes, dokRes, nilaiRes] = await Promise.all([
        api.get(ROUTE_LOGBOOK, { params: { pengajuan_id: row.pengajuan_id } }),
        api.get(ROUTE_DOKUMEN, { params: { pengajuan_id: row.pengajuan_id } }),
        api.get(ROUTE_NILAI,   { params: { pengajuan_id: row.pengajuan_id } }),
      ])
      setLogbook(logRes.data.data || [])
      setDokumen(dokRes.data.data || [])
      setNilai(nilaiRes.data.data || null)
    } catch {
      toast.error('Gagal memuat detail mahasiswa!')
    } finally {
      setLoading(false)
    }
  }, [row.pengajuan_id])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  const dokumenLaporan = dokumen.find(d => d.jenis === 'laporan_akhir') || null
  const dokumenPpt     = dokumen.find(d => d.jenis === 'ppt') || null

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
          {loading ? (
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
                    { icon: User, label: 'NIM', value: row.nim },
                    { icon: User, label: 'Nama', value: row.nama },
                    { icon: GraduationCap, label: 'Program MBKM', value: row.program_mbkm || '-' },
                    { icon: GraduationCap, label: 'Dosen PA', value: row.dosen_pa || '-' },
                    { icon: FileText, label: 'Pelatihan', value: row.nama_pelatihan || '-' },
                    { icon: Clock, label: 'Status Pengajuan', value: <StatusBadge status={row.status_pengajuan} /> },
                    { icon: FileText, label: 'Jumlah Entri Logbook', value: logbook.length },
                  ].map((f, i) => (
                    <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5">
                      <p className="text-xs text-gray-400 mb-0.5">{f.label}</p>
                      <div className="text-sm font-medium text-gray-800">{f.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Logbook Mahasiswa */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-1">Logbook Mahasiswa</h3>
                <LogbookSection logbook={logbook} onPreview={setPreview} />
              </div>

              {/* Nilai Mahasiswa */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3">Nilai Mahasiswa</h3>
                <NilaiSection nilai={nilai} />
              </div>

              {/* Dokumen */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3">Dokumen</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Laporan Akhir</p>
                    <DokumenSection dok={dokumenLaporan} label="Laporan Akhir" onPreview={setPreview} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">PPT</p>
                    <DokumenSection dok={dokumenPpt} label="PPT" onPreview={setPreview} />
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      <PreviewModal preview={preview} onClose={() => setPreview(null)} />
    </div>
  )
}

export default function StaffMonitoring() {
  const [data, setData]                       = useState([])
  const [search, setSearch]                   = useState('')
  const [loading, setLoading]                 = useState(true)
  const [currentPage, setCurrentPage]         = useState(1)
  const [selectedRow, setSelectedRow]         = useState(null)
  const PAGE_SIZE = 10

  const {
    periodeId: selectedPeriode,
    periodeList: periode,
    setLocalPeriode,
  } = usePeriodeFilter('staff_akademik')

  const fetchMonitoring = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(ROUTE_LIST, { params: { periode_id: selectedPeriode } })
      setData(res.data.data || [])
    } catch {
      toast.error('Gagal memuat data monitoring!')
    } finally {
      setLoading(false)
    }
  }, [selectedPeriode])

  useEffect(() => { if (selectedPeriode) fetchMonitoring() }, [selectedPeriode, fetchMonitoring])

  const filtered = data.filter(m =>
    m.nama?.toLowerCase().includes(search.toLowerCase()) ||
    m.nim?.toLowerCase().includes(search.toLowerCase())
  )
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Monitoring MBKM</h1>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
            placeholder="Cari nama atau NIM..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
        </div>
 <select
  value={selectedPeriode ?? ''}
  onChange={e => {
    setLocalPeriode(periode.find(p => String(p.id) === String(e.target.value)))
    setCurrentPage(1)
  }}
  className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
  {periode.map(p => (
    <option key={p.id} value={p.id}>{p.nama_periode}</option>
  ))}
</select>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">Progress Mahasiswa</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">No</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">NIM</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Nama</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Pembimbing Akademik</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Nilai</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Aksi</th>
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
                <tr key={m.pengajuan_id || i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-500">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-700">{m.nim}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-800">{m.nama}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{m.dosen_pa || '-'}</td>
                  <td className="px-6 py-4 text-center"><StatusBadge status={m.status_pengajuan} /></td>
                  <td className="px-6 py-4 text-center">
                    {/* Cukup tampilkan grade -- nilai_akhir angkanya udah ada di modal detail */}
                    {m.grade ? (
                      <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded">
                        {m.grade}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">Belum ada</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button onClick={() => setSelectedRow(m)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-semibold transition-colors">
                      <Eye className="w-3.5 h-3.5" /> Lihat Detail
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
                  <button onClick={() => setCurrentPage(groupStart - GROUP)} disabled={isFirstGroup}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    ‹ Prev
                  </button>
                  {Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map(page => (
                    <button key={page} onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
                        page === currentPage
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}>
                      {page}
                    </button>
                  ))}
                  <button onClick={() => setCurrentPage(groupStart + GROUP)} disabled={isLastGroup}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
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