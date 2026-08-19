import { useEffect, useState } from 'react'
import { Search, CheckCircle, XCircle, FileText, X } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { formatTanggal } from '../../utils/helpers'
import usePeriodeFilter from '../../hooks/usePeriodeFilter'

export default function KaprodiVerifikasi() {
  const [pengajuan, setPengajuan] = useState([])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [showDetail, setShowDetail] = useState(null)
  const [catatan, setCatatan] = useState('')
  const [processing, setProcessing] = useState(false)


  const {
    periodeId: selectedPeriode,
    periodeList: periode,
    setLocalPeriode,
  } = usePeriodeFilter('kaprodi')

  useEffect(() => {
  if (selectedPeriode) {
    fetchPengajuan()
  } else {
    setLoading(false)
  }
}, [selectedPeriode])

 const fetchPengajuan = async () => {
  setLoading(true)
  try {
    const res = await api.get('/kaprodi/verifikasi-pengajuan', {
      params: { periode_id: selectedPeriode }
    })
    setPengajuan(res.data.data || [])
  } catch {
    toast.error('Gagal memuat data pengajuan!')
  } finally {
    setLoading(false)
  }
}

  const fetchAll = async () => {
    fetchPengajuan()
  }

  const handleVerifikasi = async (status) => {
    setProcessing(true)
    try {
      await api.patch(`/kaprodi/pengajuan/${showDetail.id}/verifikasi`, {
        status,
        catatan_kaprodi: catatan,
      })
      toast.success(status === 'disetujui_kaprodi' ? 'Pengajuan disetujui!' : 'Pengajuan ditolak!')
      setShowDetail(null)
      setCatatan('')
      fetchAll()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal memproses!')
    } finally {
      setProcessing(false)
    }
  }

 const handleHapus = async (id) => {
  if (!confirm('Hapus pengajuan ini? Tindakan ini tidak bisa dibatalkan.')) return
  try {
    await api.delete(`/kaprodi/pengajuan/${id}`)
    toast.success('Pengajuan berhasil dihapus!')
    setShowDetail(null)
    fetchAll()
  } catch (err) {
    toast.error(err.response?.data?.message || 'Gagal menghapus pengajuan!')
  }
}

  const getStatusBadge = (status) => {
    const map = {
      diajukan:          { cls: 'bg-yellow-100 text-yellow-800', label: 'Diajukan' },
      disetujui_kaprodi: { cls: 'bg-green-100 text-green-800',   label: 'Disetujui' },
      ditolak:           { cls: 'bg-red-100 text-red-800',       label: 'Ditolak' },
      draft:             { cls: 'bg-gray-100 text-gray-600',     label: 'Draft' },
    }
    return map[status] || { cls: 'bg-gray-100 text-gray-600', label: status }
  }

  const filtered = pengajuan.filter(p => {
    const matchSearch = p.nama_mahasiswa?.toLowerCase().includes(search.toLowerCase()) ||
      p.nim?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus ? p.status === filterStatus : true
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Pengajuan Capstone & MBKM</h1>
        <p className="text-gray-500 text-sm mt-1">Verifikasi pengajuan dari mahasiswa</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama atau NIM..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
          <option value="">Semua Status</option>
          <option value="diajukan">Diajukan</option>
          <option value="disetujui_kaprodi">Disetujui</option>
          <option value="ditolak">Ditolak</option>
        </select>
       <select
  value={selectedPeriode ?? ''}
  onChange={e => setLocalPeriode(periode.find(p => String(p.id) === String(e.target.value)))}
  className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
  {periode.map(p => (
    <option key={p.id} value={String(p.id)}>{p.nama_periode}</option>
  ))}
</select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">Daftar Pengajuan</h2>
          <span className="text-sm text-gray-400">{filtered.length} pengajuan</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">No</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Mahasiswa</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Pelatihan</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Tanggal</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                  <FileText className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  Belum ada pengajuan
                </td></tr>
              ) : filtered.map((p, i) => {
                const { cls, label } = getStatusBadge(p.status)
                const pelatihanUtama = p.nama_pelatihan || '-'

                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-500 align-top">{i + 1}</td>
                    <td className="px-6 py-4 align-top">
                      <p className="text-sm font-medium text-gray-800">{p.nama_mahasiswa}</p>
                      <p className="text-xs text-gray-400">{p.nim}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 max-w-xs align-top">
                      <p className="truncate">{pelatihanUtama}</p>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500 align-top">{formatTanggal(p.created_at)}</td>
                    <td className="px-6 py-4 align-top">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>{label}</span>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setShowDetail(p); setCatatan('') }}
                          className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium transition-colors">
                          Detail
                        </button>
                        <button onClick={() => handleHapus(p.id)}
                          className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg font-medium transition-colors">
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

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
                  <span className="text-xs font-semibold text-gray-700">{showDetail.nama_mahasiswa}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">NIM</span>
                  <span className="text-xs font-semibold text-gray-700">{showDetail.nim}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">Status</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(showDetail.status).cls}`}>
                    {getStatusBadge(showDetail.status).label}
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
                  <p className="text-sm text-gray-700">{showDetail.nama_dosen_pa || '-'}</p>
                </div>

                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-1">
                  <p className="text-xs font-bold text-gray-600">Pelatihan</p>
                  <p className="text-xs text-gray-400">Judul Pelatihan</p>
                  <p className="text-sm text-gray-700">{showDetail.nama_pelatihan || '-'}</p>
                  <p className="text-xs text-gray-400 mt-1">Link</p>
                  <a href={showDetail.link_pelatihan} target="_blank" rel="noreferrer"
                    className="text-sm text-blue-600 hover:underline break-all">{showDetail.link_pelatihan || '-'}</a>
                  <p className="text-xs text-gray-400 mt-1">Durasi</p>
                  <p className="text-sm text-gray-700">{Number(showDetail.durasi_pelatihan_jam ?? 0)} jam</p>
                </div>

                <div className={`flex justify-between px-3 py-2 rounded-xl text-sm font-semibold ${Number(showDetail.durasi_pelatihan_jam ?? 0) >= 48 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                  <span>Total Waktu Pembelajaran</span>
                  <span>{Number(showDetail.durasi_pelatihan_jam ?? 0)} jam</span>
                </div>
              </div>

              {showDetail.status === 'diajukan' && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Catatan (opsional)</label>
                  <textarea value={catatan} onChange={e => setCatatan(e.target.value)} rows={3}
                    placeholder="Tambahkan catatan untuk mahasiswa..."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 resize-none" />
                </div>
              )}

              {showDetail.status === 'diajukan' && (
                <div className="flex gap-2 pt-2">
                  <button onClick={() => handleVerifikasi('ditolak')} disabled={processing}
                    className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                    <XCircle className="w-4 h-4" /> Tolak
                  </button>
                  <button onClick={() => handleVerifikasi('disetujui_kaprodi')} disabled={processing}
                    className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4" /> {processing ? 'Memproses...' : 'Setujui'}
                  </button>
                </div>
              )}

              {showDetail.catatan_kaprodi && (
                <div className="bg-yellow-50 rounded-xl p-3 border border-yellow-100">
                  <p className="text-xs text-yellow-700 font-semibold mb-1">Catatan Kaprodi:</p>
                  <p className="text-sm text-yellow-800">{showDetail.catatan_kaprodi}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}