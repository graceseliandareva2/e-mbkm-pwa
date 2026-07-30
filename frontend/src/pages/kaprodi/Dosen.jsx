import { useEffect, useState } from 'react'
import { Search, Users } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
export default function KaprodiDosen() {
  const [dosen, setDosen] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchDosen() }, [])

  const fetchDosen = async () => {
    try {
      const res = await api.get('/kaprodi/dosen')
      setDosen(res.data.data || [])
    } catch {
      toast.error('Gagal memuat data dosen!')
    } finally {
      setLoading(false)
    }
  }

  const filtered = dosen.filter(d =>
    d.nama?.toLowerCase().includes(search.toLowerCase()) ||
    d.id_dosen?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Data Dosen</h1>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama atau ID Dosen..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
        </div>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">Daftar Dosen Pembimbing</h2>
          <span className="text-sm text-gray-400">{filtered.length} dosen</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">No</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">ID Dosen</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Nama</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Program Studi</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                  <Users className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  Belum ada data dosen
                </td></tr>
              ) : filtered.map((d, i) => (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-500">{i + 1}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-700">{d.id_dosen}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-800">{d.nama}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{d.program_studi || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{d.email || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium
                      ${d.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {d.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}