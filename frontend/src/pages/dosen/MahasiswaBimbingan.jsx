import { useEffect, useState } from 'react'
import { Users, Search, BookOpen, FileText, ExternalLink, ChevronDown, ChevronUp, Clock, CheckCircle, XCircle, AlertCircle, X, Eye } from 'lucide-react'
import api from '../../utils/api'
import usePeriodeFilter from '../../hooks/usePeriodeFilter'
import PeriodeDropdown from '../../components/common/PeriodeDropdown'

const getPelatihanArray = (pelatihan) => {
  try {
    if (!pelatihan) return []
    return typeof pelatihan === 'string' ? JSON.parse(pelatihan) : pelatihan
  } catch { return [] }
}

const getStatusBadge = (status) => {
  const map = {
    diajukan:          { cls: 'bg-yellow-100 text-yellow-800', label: 'Menunggu Review' },
    disetujui_kaprodi: { cls: 'bg-green-100 text-green-800',   label: 'Disetujui' },
    ditolak:           { cls: 'bg-red-100 text-red-800',       label: 'Ditolak' },
    revisi:            { cls: 'bg-orange-100 text-orange-800', label: 'Perlu Revisi' },
  }
  return map[status] || { cls: 'bg-gray-100 text-gray-600', label: status }
}

export default function DosenMahasiswaBimbingan() {
  const [mahasiswa, setMahasiswa]         = useState([])
  const [periodeList, setPeriodeList]     = useState([])
  const [selectedPeriode, setSelectedPeriode] = useState('')
  const [search, setSearch]               = useState('')
  const [loading, setLoading]             = useState(true)
  const [expanded, setExpanded]           = useState(null)
  const [showDetail, setShowDetail]       = useState(null)

  const { periodeId: periodeIdFromStore } = usePeriodeFilter('dosen_pembimbing')

  // 1) Ambil daftar periode sekali saat mount
  useEffect(() => {
    const fetchPeriode = async () => {
      try {
        const res = await api.get('/dosen/periode')
        const list = res.data.data || res.data || []
        setPeriodeList(list)
        if (list.length === 0) {
          setMahasiswa([])
          setLoading(false)
        }
      } catch {
        setPeriodeList([])
        setMahasiswa([])
        setLoading(false)
      }
    }
    fetchPeriode()
  }, [])

  // 2) Sinkronisasi ke global store — tiap kali periodeIdFromStore atau periodeList berubah
  useEffect(() => {
    if (periodeIdFromStore) {
      setSelectedPeriode(String(periodeIdFromStore))
      return
    }
    if (periodeList.length > 0) {
      const aktif = periodeList.find(p => p.is_active == 1)
      const fallbackId = aktif?.id ?? periodeList[0]?.id ?? null
      if (fallbackId) setSelectedPeriode(String(fallbackId))
    }
  }, [periodeIdFromStore, periodeList])

  // 3) Fetch data mahasiswa tiap kali selectedPeriode berubah
  useEffect(() => {
    if (!selectedPeriode) return
    fetchMahasiswa(selectedPeriode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriode])

  const fetchMahasiswa = async (periodeId) => {
    setLoading(true)
    try {
      const params = periodeId ? { periode_id: periodeId } : {}
      const res = await api.get('/dosen/mahasiswa-bimbingan', { params })
      setMahasiswa(res.data.data || [])
    } catch {
      setMahasiswa([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = mahasiswa.filter(m =>
    m.nama?.toLowerCase().includes(search.toLowerCase()) ||
    m.nim?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Mahasiswa Bimbingan</h1>
        <p className="text-sm text-gray-500 mt-0.5">Daftar mahasiswa yang kamu bimbing</p>
      </div>

      {/* Filter — selalu tampil */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama atau NIM..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
        </div>
        <PeriodeDropdown
          value={selectedPeriode}
          onChange={setSelectedPeriode}
          options={periodeList}
        />
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">
              {search
                ? `Tidak ada mahasiswa untuk "${search}"`
                : 'Belum ada mahasiswa bimbingan'
              }
            </p>
          </div>
        ) : filtered.map(m => {
          const isExpanded = expanded === m.id

          return (
            <div key={m.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-blue-700 text-sm">
                    {m.nama?.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-800 text-sm">{m.nama}</p>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{m.nim} · {m.nama_periode}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : m.id)}
                    className="p-1.5 rounded-lg text-blue-600 bg-blue-50"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100 p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Email</p>
                      <p className="text-sm text-gray-700">{m.email || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Dosen PA</p>
                      <p className="text-sm text-gray-700">{m.dosen_pembimbing_akademik || '-'}</p>
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setShowDetail(m) }}
                    className="flex items-center gap-2 text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 px-4 py-2 rounded-xl font-medium transition-colors"
                  >
                    <BookOpen className="w-4 h-4" />
                    Lihat Detail Pengajuan
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal Detail Pengajuan */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="font-bold text-gray-800">Detail Pengajuan</h2>
              <button onClick={() => setShowDetail(null)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">Mahasiswa</span>
                  <span className="text-xs font-semibold text-gray-700">{showDetail.nama}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">NIM</span>
                  <span className="text-xs font-semibold text-gray-700">{showDetail.nim}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">Status</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(showDetail.status_pengajuan).cls}`}>
                    {getStatusBadge(showDetail.status_pengajuan).label}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Email</p>
                  <p className="text-sm text-gray-700">{showDetail.email || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Dosen Pembimbing Akademik</p>
                  <p className="text-sm text-gray-700">{showDetail.dosen_pembimbing_akademik || '-'}</p>
                </div>

                {getPelatihanArray(showDetail.pelatihan).map((p, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-1">
                    <p className="text-xs font-bold text-gray-600">
                      Pelatihan {idx + 1}{idx === 0 ? ' (Utama)' : ' (Tambahan)'}
                    </p>
                    <p className="text-xs text-gray-400">Nama</p>
                    <p className="text-sm text-gray-700">{p.nama || '-'}</p>
                    <p className="text-xs text-gray-400 mt-1">Link</p>
                    <a href={p.link} target="_blank" rel="noreferrer"
                      className="text-sm text-blue-600 hover:underline break-all">{p.link || '-'}</a>
                    <p className="text-xs text-gray-400 mt-1">Durasi</p>
                    <p className="text-sm text-gray-700">{p.durasi_jam} jam</p>
                  </div>
                ))}

                {(() => {
                  const total = getPelatihanArray(showDetail.pelatihan)
                    .reduce((sum, p) => sum + (Number(p.durasi_jam) || 0), 0)
                  return (
                    <div className={`flex justify-between px-3 py-2 rounded-xl text-sm font-semibold
                      ${total >= 48 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                      <span>Total Waktu Pembelajaran</span>
                      <span>{total} jam {total >= 48 ? '✓' : `(kurang ${48 - total} jam)`}</span>
                    </div>
                  )
                })()}
              </div>

              {showDetail.catatan_kaprodi && (
                <div className="bg-yellow-50 rounded-xl p-3 border border-yellow-100">
                  <p className="text-xs text-yellow-700 font-semibold mb-1">Catatan Kaprodi:</p>
                  <p className="text-sm text-yellow-800">{showDetail.catatan_kaprodi}</p>
                </div>
              )}

              <button
                onClick={() => setShowDetail(null)}
                className="w-full py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}