import { useEffect, useState, useCallback } from 'react'
import {
  BookOpen, CheckCircle, AlertCircle, Clock, MessageSquare, Eye, Search, X,
  Users, ChevronLeft,
} from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { getCache, setCache } from '../../utils/offlineCache'  
import usePeriodeFilter from '../../hooks/usePeriodeFilter'
import PeriodeDropdown from '../../components/common/PeriodeDropdown'
import { FileBuktiPreview, LinkBukti } from '../../components/common/BuktiPreview'

const CACHE_MHS     = 'dosen_mahasiswa'

const CACHE_LOGBOOK = (periodeId, mahasiswaId) => `dosen_logbook_${periodeId}_${mahasiswaId}`

const STATUS_CONFIG = {
  draft:        { label: 'Draft',        color: 'text-gray-500',   bg: 'bg-gray-50',    border: 'border-gray-200',  icon: Clock },
  disubmit:     { label: 'Menunggu',     color: 'text-yellow-600', bg: 'bg-yellow-50',  border: 'border-yellow-200', icon: Clock },
  diverifikasi: { label: 'Diverifikasi', color: 'text-green-600',  bg: 'bg-green-50',   border: 'border-green-200',  icon: CheckCircle },
  revisi:       { label: 'Perlu Revisi', color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200',    icon: AlertCircle },
}

const formatDurasi = (menit) => {
  const totalMenit = Math.round(Number(menit))
  const j = Math.floor(totalMenit / 60)
  const m = totalMenit % 60
  if (m === 0) return `${j} jam`
  if (j === 0) return `${m} menit`
  return `${j} jam ${m} menit`
}

// Format total jam terverifikasi (nilai desimal, mis. 12.5) jadi "12 jam 30 menit"
const formatJamTotal = (jamDesimal) => {
  const totalMenit = Math.round((Number(jamDesimal) || 0) * 60)
  return formatDurasi(totalMenit)
}

// Progress jam terverifikasi terhadap minimal jam yang ditentukan Kaprodi (per periode)
// Desain ring/donut -- sengaja beda dari card "Progres Logbook" di dashboard
// mahasiswa (yang pakai angka besar + bar linear), supaya tetap ringkas di
// baris list/tabel dosen & kaprodi.
const RING_SIZE = 40
const RING_STROKE = 4
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRC = 2 * Math.PI * RING_RADIUS

const ProgressJam = ({ jam, minJam, jumlahEntri }) => {
  const jamNum = Number(jam) || 0
  const min = Number(minJam) || 0
  const percent = min > 0 ? Math.min(100, Math.round((jamNum / min) * 100)) : 0
  const done = min > 0 && jamNum >= min
  const offset = RING_CIRC - (percent / 100) * RING_CIRC

  return (
    <div className="flex items-center gap-2.5 min-w-[150px] justify-end">
      {min > 0 && (
        <div className="relative flex-shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
          <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
            <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
              fill="none" stroke="#f3f4f6" strokeWidth={RING_STROKE} />
            <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
              fill="none" stroke={done ? '#22c55e' : '#3b82f6'} strokeWidth={RING_STROKE}
              strokeDasharray={RING_CIRC} strokeDashoffset={offset} strokeLinecap="round"
              className="transition-all duration-500" />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-bold ${done ? 'text-green-600' : 'text-blue-600'}`}>
            {percent}%
          </span>
        </div>
      )}
      <div className="flex flex-col items-end">
        <span className={`text-sm font-semibold ${done ? 'text-green-600' : 'text-gray-700'}`}>
          {formatJamTotal(jamNum)}
          {min > 0 && <span className="text-gray-400 font-normal"> / {formatJamTotal(min)}</span>}
        </span>
        {typeof jumlahEntri === 'number' && (
          <span className="text-[10px] text-gray-400">{jumlahEntri} entri</span>
        )}
      </div>
    </div>
  )
}

export default function DosenLogbook() {
  const [mahasiswa, setMahasiswa]         = useState([])
  const [loading, setLoading]             = useState(true)
  const [isOffline, setIsOffline]         = useState(!navigator.onLine)  
 
  const [view, setView]                   = useState('mahasiswa') 
  const [selectedMhs, setSelectedMhs]     = useState(null)
  const [mhsSearch, setMhsSearch]         = useState('')


  const [logbooks, setLogbooks]           = useState([])
  const [loadingLogbook, setLoadingLogbook] = useState(false)
  const [expanded, setExpanded]           = useState(null)
  const [feedback, setFeedback]           = useState('')
  const [processing, setProcessing]       = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')

  const {
    periodeId: selectedPeriode,
    periodeList: periode,
    loading: loadingPeriode,
    setLocalPeriode,
  } = usePeriodeFilter('dosen_pembimbing')

  // ── Offline listener ──────────────────────────────────────────
  useEffect(() => {
    const onOnline  = () => setIsOffline(false)
    const onOffline = () => setIsOffline(true)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    if (loadingPeriode) return
    if (periode.length === 0) {
      const cached = getCache(CACHE_MHS, [])
      setMahasiswa(cached)
      setLoading(false)
    }
  }, [periode, loadingPeriode])

  useEffect(() => {
    if (!selectedPeriode) return
    setView('mahasiswa')
    setSelectedMhs(null)
    setLogbooks([])
    setExpanded(null)
    setFeedback('')
    setSearchQuery('')
    setMhsSearch('')

    fetchMahasiswa(selectedPeriode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriode])

  const fetchMahasiswa = useCallback(async (periodeId) => {
    setLoading(true)
    try {
      const mhsRes = await api.get('/dosen/mahasiswa-bimbingan', { params: { periode_id: periodeId } })
      const list   = mhsRes.data.data || []
      setMahasiswa(list)
      setCache(CACHE_MHS, list)
    } catch {
      // Offline
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchLogbook = useCallback(async (periodeId, mahasiswaId) => {
    setLoadingLogbook(true)
    try {
      const res  = await api.get('/dosen/logbook', { params: { periode_id: periodeId, mahasiswa_id: mahasiswaId } })
      const list = res.data.data || []
      console.log(list);
      setLogbooks(list)
      setCache(CACHE_LOGBOOK(periodeId, mahasiswaId), list)
    } catch {
      // Offline
    } finally {
      setLoadingLogbook(false)
    }
  }, [])

  const handlePilihMhs = (mhs) => {
    setSelectedMhs(mhs)
    setExpanded(null)
    setFeedback('')
    setSearchQuery('')
    setView('logbook')
    const cached = getCache(CACHE_LOGBOOK(selectedPeriode, mhs.id), null)
    setLogbooks(cached || [])

    fetchLogbook(selectedPeriode, mhs.id)
  }

  const handleBack = () => {
    setView('mahasiswa')
    setSelectedMhs(null)
    setLogbooks([])
    setExpanded(null)
    setFeedback('')
  }
  const handleVerifikasi = async (id, status) => {
    setProcessing(true)
    try {
      await api.patch(`/dosen/logbook/${id}/verifikasi`, { status, feedback_dosen: feedback })
      toast.success(status === 'diverifikasi' ? 'Logbook diverifikasi!' : 'Logbook dikembalikan untuk revisi!')
      setExpanded(null)
      setFeedback('')
      fetchLogbook(selectedPeriode, selectedMhs.id)
    } catch {
      toast.error('Gagal memproses logbook')
    } finally {
      setProcessing(false)
    }
  }

  const filteredMahasiswa = mahasiswa.filter(m => {
    if (!mhsSearch.trim()) return true
    const q = mhsSearch.toLowerCase()
    return (m.nama || '').toLowerCase().includes(q) || (m.nim || '').toLowerCase().includes(q)
  })

  const filteredLogbooks = logbooks.filter(log => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (log.kegiatan || '').toLowerCase().includes(q) ||
      (log.deskripsi || '').toLowerCase().includes(q)
    )
  })


  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (view === 'mahasiswa') {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Logbook Mahasiswa</h1>
        </div>

        {isOffline && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-700 font-medium">
            ⚠️ Kamu sedang offline. Menampilkan data terakhir yang tersimpan.
          </div>
        )}

        {/* Search & Periode */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input type="text" value={mhsSearch}
              onChange={e => setMhsSearch(e.target.value)}
              placeholder="Cari nama atau NIM mahasiswa..."
              className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            />
            {mhsSearch && (
              <button onClick={() => setMhsSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <PeriodeDropdown
            value={selectedPeriode}
            onChange={(id) => setLocalPeriode(periode.find(p => String(p.id) === String(id)))}
            options={periode}
          />
        </div>

        {/* Daftar mahasiswa */}
        <div className="space-y-3">
          {filteredMahasiswa.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 font-medium">
                {mhsSearch ? `Tidak ada hasil untuk "${mhsSearch}"` : 'Belum ada mahasiswa bimbingan'}
              </p>
              {isOffline && (
                <p className="text-xs text-yellow-600 mt-2 bg-yellow-50 border border-yellow-100 rounded-xl px-3 py-2 inline-block">
                  Data tidak ditemukan di cache lokal
                </p>
              )}
            </div>
          ) : filteredMahasiswa.map(mhs => (
            <div key={mhs.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between gap-4 hover:border-blue-200 transition">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                  {mhs.nama?.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 text-sm truncate">{mhs.nama}</p>
                  <p className="text-xs text-gray-400">{mhs.nim} · {mhs.nama_periode}</p>
                  {mhs.judul && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{mhs.judul}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <ProgressJam jam={mhs.total_jam_terverifikasi} minJam={mhs.min_jam_pengajuan} jumlahEntri={mhs.jumlah_logbook} />
                <button
                  onClick={() => handlePilihMhs(mhs)}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition"
                >
                  Lihat Logbook
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={handleBack} className="p-2 rounded-xl hover:bg-gray-100 transition">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Logbook {selectedMhs?.nama}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedMhs?.nim} · {selectedMhs?.nama_periode}
            {selectedMhs && (
              <>
                {' · '}
                <span className={`font-medium ${
                  Number(selectedMhs.min_jam_pengajuan) > 0 &&
                  Number(selectedMhs.total_jam_terverifikasi) >= Number(selectedMhs.min_jam_pengajuan)
                    ? 'text-green-700' : 'text-emerald-700'
                }`}>
                  {formatJamTotal(selectedMhs.total_jam_terverifikasi)}
                  {Number(selectedMhs.min_jam_pengajuan) > 0 && ` / ${formatJamTotal(selectedMhs.min_jam_pengajuan)}`} terverifikasi
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Banner offline */}
      {isOffline && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-700 font-medium">
          ⚠️ Kamu sedang offline. 
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input type="text" value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setExpanded(null); setFeedback('') }}
            placeholder="Cari kegiatan atau deskripsi..."
            className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setExpanded(null); setFeedback('') }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {loadingLogbook ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredLogbooks.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200">
            <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">
              {searchQuery ? `Tidak ada logbook untuk "${searchQuery}"` : 'Belum ada logbook'}
            </p>
            {isOffline && (
              <p className="text-xs text-yellow-600 mt-2 bg-yellow-50 border border-yellow-100 rounded-xl px-3 py-2 inline-block">
                Data tidak ditemukan di cache lokal
              </p>
            )}
          </div>
        ) : filteredLogbooks.map(log => {
          const statusCfg = STATUS_CONFIG[log.status] || STATUS_CONFIG.disubmit
          const StatusIcon = statusCfg.icon
          const isExpanded = expanded === log.id

          return (
            <div key={log.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => { setExpanded(isExpanded ? null : log.id); setFeedback('') }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-800 text-sm">{log.kegiatan}</p>
                      <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusCfg.label}
                      </span>
                      {log.nama_pelatihan && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                          {log.nama_pelatihan}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(log.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {' · '}{formatDurasi(log.durasi_menit)}
                    </p>
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : log.id); setFeedback('') }}
                  className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${isExpanded ? 'text-blue-600 bg-blue-100' : 'text-blue-600 bg-blue-50'}`}>
                  <Eye className="w-4 h-4" />
                </button>
              </div>

              {/* Detail */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-4 space-y-3 max-w-4xl mx-auto">
                  {log.deskripsi && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Deskripsi</p>
                      <p className="text-sm text-gray-700 text-justify">{log.deskripsi}</p>
                    </div>
                  )}
                  {log.bukti_link && (() => {
                   
                    const isFileUpload = !!log.cloudinary_public_id
                    return (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                          {isFileUpload ? 'Bukti' : 'Bukti (Link)'}
                        </p>
                        {isFileUpload ? (
                          <>
                            <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: '420px' }}>
                              <FileBuktiPreview path={log.bukti_link} filename={log.kegiatan} />
                            </div>
                            <p className="text-xs text-gray-400 mt-2 truncate">{log.bukti_link.split('/').pop()}</p>
                          </>
                        ) : (
                          <LinkBukti url={log.bukti_link} />
                        )}
                      </div>
                    )
                  })()}
                  {log.feedback_dosen && (
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                        <p className="text-xs font-semibold text-purple-700">Feedback Sebelumnya</p>
                      </div>
                      <p className="text-sm text-purple-900">{log.feedback_dosen}</p>
                    </div>
                  )}

                  {/* Panel verifikasi */}
                  {log.status === 'disubmit' && (
                    <div className="pt-2 space-y-3 border-t border-gray-100">
                      {isOffline ? (
                        <p className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-100 rounded-xl px-3 py-2">
                          ⚠️ Tidak bisa memverifikasi saat offline.
                        </p>
                      ) : (
                        <>
                          <p className="text-xs font-semibold text-gray-600">Feedback / Catatan (opsional)</p>
                          <textarea value={feedback} onChange={e => setFeedback(e.target.value)}
                            onClick={e => e.stopPropagation()} rows={2}
                            placeholder="Tambahkan catatan untuk mahasiswa..."
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none" />
                          <div className="flex gap-2">
                            <button onClick={e => { e.stopPropagation(); handleVerifikasi(log.id, 'revisi') }}
                              disabled={processing}
                              className="flex-1 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                              <AlertCircle className="w-4 h-4" /> Revisi
                            </button>
                            <button onClick={e => { e.stopPropagation(); handleVerifikasi(log.id, 'diverifikasi') }}
                              disabled={processing}
                              className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                              <CheckCircle className="w-4 h-4" />
                              {processing ? 'Memproses...' : 'Verifikasi'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {log.status === 'diverifikasi' && (
                    <div className="flex items-center gap-2 text-green-600 pt-1">
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                      <p className="text-xs font-medium">Logbook telah diverifikasi</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}