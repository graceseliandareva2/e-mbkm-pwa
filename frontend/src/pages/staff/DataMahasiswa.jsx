import { useEffect, useState } from 'react'
import { Upload, Search, Users, X, Check, UserPlus, Pencil, Trash2, KeyRound } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import usePeriodeFilter from '../../hooks/usePeriodeFilter'

const emptyForm = {
  nim: '',
  nama: '',
  email: '',
  program_studi: '',
}

const emptyEditForm = {
  nim: '',
  nama: '',
  email: '',
  program_studi: '',
}

export default function StaffDataMahasiswa() {
  const [mahasiswa, setMahasiswa] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  const {
    periodeId: selectedPeriode,
    periodeList: periode,
    setLocalPeriode,
  } = usePeriodeFilter('staff_akademik')

  const [showTambah, setShowTambah] = useState(false)
  const [tambahForm, setTambahForm] = useState(emptyForm)
  const [tambahLoading, setTambahLoading] = useState(false)

  const [showEdit, setShowEdit] = useState(false)
  const [editData, setEditData] = useState(null)
  const [editForm, setEditForm] = useState(emptyEditForm)
  const [editLoading, setEditLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const res = await api.get('/staff/mahasiswa', {
        params: { periode_id: selectedPeriode, _t: Date.now() }
      })
      setMahasiswa(res.data.data || [])
    } catch {
      toast.error('Gagal memuat data mahasiswa!')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const periodeAktif = periode.find(p => p.is_active)
    if (!periodeAktif) { toast.error('Tidak ada periode aktif saat ini!'); return }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('periode_id', selectedPeriode)
      const res = await api.post('/staff/import-mahasiswa', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      console.log('IMPORT ERRORS:', res.data.errors)
      toast.success(res.data.message)
      fetchMahasiswa()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal import!')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleTambahChange = (e) => {
    const { name, value } = e.target
    setTambahForm(prev => ({ ...prev, [name]: value }))
  }

  const handleTambahSubmit = async () => {
    const { nim, nama, email, program_studi } = tambahForm
    if (!nim.trim() || !nama.trim() || !email.trim() || !program_studi.trim()) {
      toast.error('Semua field wajib diisi!')
      return
    }

    const periodeAktif = periode.find(p => p.is_active)
    if (!periodeAktif) {
      toast.error('Tidak ada periode aktif saat ini! Mahasiswa tidak bisa ditambahkan.')
      return
    }

    setTambahLoading(true)
    try {
      const res = await api.post('/staff/mahasiswa', { ...tambahForm, periode_id: periodeAktif.id })
      toast.success(res.data.message || 'Mahasiswa berhasil ditambahkan!')
      setShowTambah(false)
      setTambahForm(emptyForm)
      fetchMahasiswa()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menambahkan mahasiswa!')
    } finally {
      setTambahLoading(false)
    }
  }

  const handleCloseTambah = () => {
    setShowTambah(false)
    setTambahForm(emptyForm)
  }

  // ── EDIT MAHASISWA ──
  const openEdit = (m) => {
    setEditData(m)
    setEditForm({
      nim: m.nim || '',
      nama: m.nama || '',
      email: m.email || '',
      program_studi: m.program_studi || '',
    })
    setShowEdit(true)
  }

  const handleCloseEdit = () => {
    setShowEdit(false)
    setEditData(null)
    setEditForm(emptyEditForm)
  }

  const handleEditChange = (e) => {
    const { name, value } = e.target
    setEditForm(prev => ({ ...prev, [name]: value }))
  }

  const handleEditSubmit = async () => {
    const { nim, nama, email, program_studi } = editForm
    if (!nim.trim() || !nama.trim() || !email.trim() || !program_studi.trim()) {
      toast.error('Semua field wajib diisi!')
      return
    }
    setEditLoading(true)
    try {
      const res = await api.put(`/staff/mahasiswa/${editData.id}`, editForm)
      toast.success(res.data.message || 'Data mahasiswa berhasil diperbarui!')
      handleCloseEdit()
      fetchMahasiswa()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal memperbarui data mahasiswa!')
    } finally {
      setEditLoading(false)
    }
  }

  // ── HAPUS MAHASISWA ──
  const handleDelete = async (m) => {
    if (!window.confirm(`Hapus mahasiswa ${m.nama} (${m.nim})? Semua data terkait (logbook, dokumen, bimbingan, pengajuan) akan ikut terhapus dan tidak bisa dikembalikan.`)) {
      return
    }
    try {
      const res = await api.delete(`/staff/mahasiswa/${m.id}`)
      toast.success(res.data.message || 'Mahasiswa berhasil dihapus!')
      fetchMahasiswa()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menghapus mahasiswa!')
    }
  }

  // ── RESET PASSWORD  ──
  const handleResetPassword = async () => {
    if (!editData) return
    if (!window.confirm(`Reset password ${editData.nama} ke NIM (${editData.nim})? Mahasiswa perlu login ulang menggunakan NIM sebagai password.`)) {
      return
    }
    setResetLoading(true)
    try {
      const res = await api.patch(`/staff/mahasiswa/${editData.id}/reset-password`)
      toast.success(res.data.message || 'Password berhasil direset!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal mereset password!')
    } finally {
      setResetLoading(false)
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
          <p className="text-gray-500 text-sm mt-1">Kelola data mahasiswa</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTambah(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 shadow-sm transition-colors">
            <UserPlus className="w-4 h-4" />
            Tambah
          </button>
          <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm cursor-pointer transition-colors
            ${uploading ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
            <Upload className="w-4 h-4" />
            {uploading ? 'Mengimport...' : 'Import'}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="hidden" disabled={uploading} />
          </label>
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
        <select
          value={selectedPeriode ?? ''}
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
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Aksi</th>
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
                  Belum ada data mahasiswa
                </td></tr>
              ) : paginated.map((m, i) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-500">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-700">{m.nim}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-800">{m.nama}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{m.program_studi || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{m.email || '-'}</td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(m)}
                        className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Edit mahasiswa">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(m)}
                        className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                        title="Hapus mahasiswa">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
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

      {/* Modal Tambah */}
      {showTambah && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <h2 className="font-bold text-gray-800">Tambah Mahasiswa</h2>
              </div>
              <button onClick={handleCloseTambah} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {periode.find(p => p.is_active) ? (
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2.5">
                  <p className="text-xs text-blue-500 mb-0.5">Mahasiswa akan didaftarkan ke periode aktif</p>
                  <p className="text-sm font-semibold text-blue-800">
                    {periode.find(p => p.is_active)?.nama_periode}
                  </p>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
                  <p className="text-sm font-semibold text-red-700">Tidak ada periode aktif saat ini</p>
                  <p className="text-xs text-red-500 mt-0.5">Aktifkan sebuah periode terlebih dahulu sebelum menambah mahasiswa.</p>
                </div>
              )}
              {[
                { name: 'nim',           label: 'NIM',           type: 'text',  placeholder: 'Contoh: 23100001' },
                { name: 'nama',          label: 'Nama Lengkap',  type: 'text',  placeholder: 'Nama lengkap mahasiswa' },
                { name: 'email',         label: 'Email',         type: 'email', placeholder: 'email@mahasiswa.ac.id' },
                { name: 'program_studi', label: 'Program Studi', type: 'text',  placeholder: 'Contoh: Sistem dan Teknologi Informasi' },
              ].map(f => (
                <div key={f.name}>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                    {f.label} <span className="text-red-500">*</span>
                  </label>
                  <input type={f.type} name={f.name} value={tambahForm[f.name]}
                    onChange={handleTambahChange} placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button onClick={handleCloseTambah}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
                  Batal
                </button>
                <button onClick={handleTambahSubmit} disabled={tambahLoading}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />
                  {tambahLoading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit  */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-600" />
                <h2 className="font-bold text-gray-800">Edit Mahasiswa</h2>
              </div>
              <button onClick={handleCloseEdit} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { name: 'nim',           label: 'NIM',           type: 'text',  placeholder: 'Contoh: 23100001' },
                { name: 'nama',          label: 'Nama Lengkap',  type: 'text',  placeholder: 'Nama lengkap mahasiswa' },
                { name: 'email',         label: 'Email',         type: 'email', placeholder: 'email@mahasiswa.ac.id' },
                { name: 'program_studi', label: 'Program Studi', type: 'text',  placeholder: 'Contoh: Sistem dan Teknologi Informasi' },
              ].map(f => (
                <div key={f.name}>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                    {f.label} <span className="text-red-500">*</span>
                  </label>
                  <input type={f.type} name={f.name} value={editForm[f.name]}
                    onChange={handleEditChange} placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
                </div>
              ))}

              {/* Reset Password */}
              <div className="border-t border-gray-100 pt-4">
                <button onClick={handleResetPassword} disabled={resetLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-60">
                  <KeyRound className="w-4 h-4" />
                  {resetLoading ? 'Mereset...' : 'Reset Password ke NIM'}
                </button>
                <p className="text-xs text-gray-400 mt-1.5">
                  Password mahasiswa akan direset menjadi NIM mahasiswa
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={handleCloseEdit}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
                  Batal
                </button>
                <button onClick={handleEditSubmit} disabled={editLoading}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />
                  {editLoading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}