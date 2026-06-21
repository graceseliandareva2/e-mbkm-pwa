// pages/dosen/DosenLogbook.jsx
// PERUBAHAN: tambah cache localStorage via offlineCache.js
//   - Saat mount: langsung tampilkan data terakhir dari cache
//   - Saat fetch sukses: update cache
//   - Saat offline: fetch gagal tapi data dari cache tetap muncul

import { useEffect, useState, useCallback } from 'react'
import {
  BookOpen, CheckCircle, AlertCircle, Clock, MessageSquare, Eye, Search, X,
} from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { getCache, setCache } from '../../utils/offlineCache'   // ← BARU
import usePeriodeFilter from '../../hooks/usePeriodeFilter'
import PeriodeDropdown from '../../components/common/PeriodeDropdown'

// ── Cache key ─────────────────────────────────────────────────────
const CACHE_MHS     = 'dosen_mahasiswa'
const CACHE_LOGBOOK = (periodeId) => `dosen_logbook_${periodeId}`

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

export default function DosenLogbook() {
  const [mahasiswa, setMahasiswa]         = useState([])
  const [selectedPeriode, setSelectedPeriode] = useState('')
  const [periode, setPeriode]             = useState([])
  const [logbooks, setLogbooks]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [loadingLogbook, setLoadingLogbook] = useState(false)
  const [expanded, setExpanded]           = useState(null)
  const [feedback, setFeedback]           = useState('')
  const [processing, setProcessing]       = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const [isOffline, setIsOffline]         = useState(!navigator.onLine)   // ← BARU

  const { periodeId: periodeIdFromStore } = usePeriodeFilter('dosen_pembimbing')

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

  // ── 1. Ambil daftar periode ────────────────────────────────────
  useEffect(() => {
    const fetchPeriode = async () => {
      try {
        const res  = await api.get('/dosen/periode')
        const list = res.data.data || res.data || []
        setPeriode(list)
        if (list.length === 0) { setMahasiswa([]); setLoading(false) }
      } catch {
        setPeriode([])
        setMahasiswa([])
        // Saat offline, coba load mahasiswa dari cache
        const cached = getCache(CACHE_MHS, [])   // ← BARU
        setMahasiswa(cached)
        setLoading(false)
      }
    }
    fetchPeriode()
  }, [])

  // ── 2. Sync selectedPeriode dari ProfileDropdown ──────────────
  useEffect(() => {
    if (periodeIdFromStore) { setSelectedPeriode(String(periodeIdFromStore)); return }
    if (periode.length > 0) {
      const aktif     = periode.find(p => p.is_active == 1)
      const fallbackId = aktif?.id ?? periode[0]?.id ?? null
      if (fallbackId) setSelectedPeriode(String(fallbackId))
    }
  }, [periodeIdFromStore, periode])

  // ── 3. Fetch data saat periode berubah ────────────────────────
  useEffect(() => {
    if (!selectedPeriode) return
    setExpanded(null)
    setFeedback('')
    setSearchQuery('')

    // Tampilkan cache dulu sebelum fetch ── ← BARU
    const cachedLogbooks = getCache(CACHE_LOGBOOK(selectedPeriode), null)
    if (cachedLogbooks) setLogbooks(cachedLogbooks)

    fetchPageData(selectedPeriode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriode])

  const fetchPageData = useCallback(async (periodeId) => {
    try {
      const mhsRes = await api.get('/dosen/mahasiswa-bimbingan', { params: { periode_id: periodeId } })
      const list   = mhsRes.data.data || []
      setMahasiswa(list)
      setCache(CACHE_MHS, list)   // ← BARU: simpan cache mahasiswa
    } catch {
      // Offline: tetap pakai state sebelumnya yang sudah di-load dari cache
    } finally {
      setLoading(false)
    }
    fetchLogbook(periodeId)
  }, [])

  const fetchLogbook = useCallback(async (periodeId) => {
    setLoadingLogbook(true)
    try {
      const res  = await api.get('/dosen/logbook', { params: { periode_id: periodeId } })
      const list = res.data.data || []
      setLogbooks(list)
      setCache(CACHE_LOGBOOK(periodeId), list)   // ← BARU: simpan cache logbook per periode
    } catch {
      // Offline: tetap pakai state dari cache yang sudah diisi di atas
    } finally {
      setLoadingLogbook(false)
    }
  }, [])

  // ── Verifikasi ────────────────────────────────────────────────
  const handleVerifikasi = async (id, status) => {
    setProcessing(true)
    try {
      await api.patch(`/dosen/logbook/${id}/verifikasi`, { status, feedback_dosen: feedback })
      toast.success(status === 'diverifikasi' ? 'Logbook diverifikasi!' : 'Logbook dikembalikan untuk revisi!')
      setExpanded(null)
      setFeedback('')
      fetchLogbook(selectedPeriode)
    } catch {
      toast.error('Gagal memproses logbook')
    } finally {
      setProcessing(false)
    }
  }

  // ── Filter ────────────────────────────────────────────────────
  const filteredLogbooks = logbooks.filter(log => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (log.kegiatan || '').toLowerCase().includes(q) ||
      (log.deskripsi || '').toLowerCase().includes(q) ||
      (log.nama_mahasiswa || '').toLowerCase().includes(q)
    )
  })

  // ── Loading ───────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Logbook Mahasiswa</h1>
        <p className="text-sm text-gray-500 mt-0.5">Verifikasi logbook kegiatan mahasiswa bimbingan</p>
      </div>

      {/* Banner offline ── ← BARU */}
      {isOffline && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-700 font-medium">
          ⚠️ Kamu sedang offline. Menampilkan data terakhir yang tersimpan. Verifikasi tidak bisa dilakukan saat offline.
        </div>
      )}

      {/* Search & Periode */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input type="text" value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setExpanded(null); setFeedback('') }}
            placeholder="Cari kegiatan, deskripsi, atau nama mahasiswa..."
            className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setExpanded(null); setFeedback('') }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <PeriodeDropdown value={selectedPeriode} onChange={setSelectedPeriode} options={periode} />
      </div>

      {/* List logbook */}
      <div className="space-y-3">
        {loadingLogbook ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredLogbooks.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200">
            <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">
              {searchQuery
                ? `Tidak ada logbook untuk "${searchQuery}"`
                : mahasiswa.length === 0 ? 'Belum ada mahasiswa bimbingan' : 'Belum ada logbook'}
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
                      {log.nama_mahasiswa && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                          {log.nama_mahasiswa}
                        </span>
                      )}
                      <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusCfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(log.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {' · '}{formatDurasi(log.jam)}
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
                  {log.bukti_path && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Bukti Kegiatan</p>
                      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: '420px' }}>
                        {/\.(jpg|jpeg|png)$/i.test(log.bukti_path) ? (
                          <img src={`/uploads/${log.bukti_path.replace(/^.*uploads\//, '')}`}
                            className="w-full h-full object-contain bg-gray-50" alt="Bukti kegiatan" />
                        ) : (
                          <iframe src={`/uploads/${log.bukti_path.replace(/^.*uploads\//, '')}#toolbar=1&navpanes=0`}
                            className="w-full h-full" title="Bukti PDF" type="application/pdf" />
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">{log.bukti_path.split('/').pop()}</p>
                    </div>
                  )}
                  {log.bukti_link && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Bukti (Link)</p>
                      <a href={log.bukti_link} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2.5">
                        🔗 <span className="truncate max-w-xs">{log.bukti_link}</span>
                      </a>
                    </div>
                  )}
                  {log.feedback_dosen && (
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                        <p className="text-xs font-semibold text-purple-700">Feedback Sebelumnya</p>
                      </div>
                      <p className="text-sm text-purple-900">{log.feedback_dosen}</p>
                    </div>
                  )}

                  {/* Panel verifikasi — nonaktif saat offline */}
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