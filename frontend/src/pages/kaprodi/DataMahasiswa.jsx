import { useEffect, useState } from 'react'
import { Search, Users } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import usePeriodeFilter from '../../hooks/usePeriodeFilter'

export default function KaprodiDataMahasiswa() {
  const [mahasiswa, setMahasiswa] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  const {
    periodeId: selectedPeriode,
    periodeList: periode,
    setLocalPeriode,
  } = usePeriodeFilter('kaprodi')

useEffect(() => {
  if (selectedPeriode) {
    fetchMahasiswa()
  } else {
    setLoading(false)
  }
}, [selectedPeriode])

  const fetchMahasiswa = async () => {
    setLoading(true)
    try {
      const res = await api.get('/kaprodi/mahasiswa', {
        params: { periode_id: selectedPeriode, _t: Date.now() }
      })
      setMahasiswa(res.data.data || [])
    } catch {
      toast.error('Gagal memuat data mahasiswa!')
    } finally {
      setLoading(false)
    }
  }

  const filtered = mahasiswa.filter(m =>
    m.nama?.toLowerCase().includes(search.toLowerCase()) ||
    m.nim?.toLowerCase().includes(search.toLowerCase())
  )
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Data Mahasiswa</h1>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
            placeholder="Cari nama atau NIM..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
        </div>
        <select value={selectedPeriode}
          onChange={e => {
            setLocalPeriode(periode.find(p => String(p.id) === String(e.target.value)))
            setCurrentPage(1)
          }}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
          {periode.map(p => <option key={p.id} value={p.id}>{p.nama_periode}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">Daftar Mahasiswa</h2>
          <span className="text-sm text-gray-400">{filtered.length} mahasiswa</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">No</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">NIM</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Nama</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Program Studi</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">
                  <Users className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  Belum ada data mahasiswa
                </td></tr>
              ) : paginated.map((m, i) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-500">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-700">{m.nim}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-800">{m.nama}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{m.program_studi || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{m.email || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
              const groupEnd = Math.min(groupStart + GROUP - 1, totalPages)
              return (
                <>
                  <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    ‹ Prev
                  </button>
                  {Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map(page => (
                    <button key={page} onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
                        page === currentPage ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}>
                      {page}
                    </button>
                  ))}
                  <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
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