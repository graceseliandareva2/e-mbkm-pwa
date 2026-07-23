import { useEffect, useState } from 'react'
import { Upload, Search, GraduationCap, X, Check, UserPlus, Pencil, Trash2 } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import usePeriodeFilter from '../../hooks/usePeriodeFilter'

// Halaman "Pembimbing Akademik".
//
// PERUBAHAN BESAR: sebelumnya halaman ini berbasis kolom statis
// `dosen.is_dosen_pa` (toggle permanen). Sekarang backend sudah pindah ke
// sistem roster per periode (tabel `roster_dosen_pa`), jadi:
//   - Tidak ada lagi toggle/checkbox "Jadikan Dosen PA" di form manapun.
//   - Halaman ini punya dropdown Periode di header. SEMUA operasi (tampil,
//     cari, tambah, import, hapus) mengikuti periode yang lagi dipilih.
//   - "Tambah" dosen di sini otomatis: (a) buat data dosen baru di master
//     kalau ID Dosen belum pernah ada, ATAU (b) pakai data dosen yang sudah
//     ada kalau ID Dosen sudah terdaftar -- lalu keduanya otomatis
//     dimasukkan ke roster_dosen_pa untuk periode yang lagi dipilih.
//   - "Edit" tetap mengedit data MASTER dosen (nama/email/prodi/status
//     aktif) lewat PUT /staff/dosen/:id -- ini akan konsisten kelihatan
//     juga di halaman Pembimbing MBKM karena satu dosen = satu data master.
//   - "Hapus" cuma menghapus baris roster periode ini (DELETE
//     /staff/roster-dosen-pa/:id), BUKAN menghapus data dosen master.
//     Dosen tetap ada di master data dan tetap bisa
//     ditambahkan/di-roster lagi di periode lain.

const emptyTambahForm = {
  id_dosen: '',
  nama: '',
  email: '',
  program_studi: '',
}

const emptyEditForm = {
  id_dosen: '',
  nama: '',
  email: '',
  program_studi: '',
  is_active: true,
}

export default function StaffDosenAkademik() {
  const {
    periodeId: selectedPeriode,
    periodeList: periode,
    setLocalPeriode,
  } = usePeriodeFilter('staff_akademik')

  const [roster, setRoster] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const [showTambah, setShowTambah] = useState(false)
  const [tambahForm, setTambahForm] = useState(emptyTambahForm)
  const [tambahLoading, setTambahLoading] = useState(false)

  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState(emptyEditForm)
  const [editDosenId, setEditDosenId] = useState(null)
  const [editLoading, setEditLoading] = useState(false)

  const [removingId, setRemovingId] = useState(null)

  useEffect(() => {
    if (selectedPeriode) fetchRoster(selectedPeriode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriode])

  const fetchRoster = async (periodeId) => {
    setLoading(true)
    try {
      const res = await api.get('/staff/roster-dosen-pa', { params: { periode_id: periodeId } })
      setRoster(res.data.data || [])
    } catch {
      toast.error('Gagal memuat roster Dosen PA!')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!selectedPeriode) {
      toast.error('Pilih periode terlebih dahulu!')
      e.target.value = ''
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('periode_id', selectedPeriode)
      const res = await api.post('/staff/roster-dosen-pa/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success(res.data.message)
      fetchRoster(selectedPeriode)
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
    const { id_dosen, nama, email, program_studi } = tambahForm
    if (!id_dosen.trim() || !nama.trim() || !email.trim() || !program_studi.trim()) {
      toast.error('Semua field wajib diisi!')
      return
    }
    if (!selectedPeriode) {
      toast.error('Pilih periode terlebih dahulu!')
      return
    }
    setTambahLoading(true)
    try {
      const res = await api.post('/staff/roster-dosen-pa', {
        ...tambahForm,
        periode_id: selectedPeriode,
      })
      toast.success(res.data.message || 'Dosen berhasil ditambahkan ke roster PA!')
      setShowTambah(false)
      setTambahForm(emptyTambahForm)
      fetchRoster(selectedPeriode)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menambahkan dosen ke roster PA!')
    } finally {
      setTambahLoading(false)
    }
  }

  const handleCloseTambah = () => {
    setShowTambah(false)
    setTambahForm(emptyTambahForm)
  }

  const handleOpenEdit = (row) => {
    setEditDosenId(row.dosen_id)
    setEditForm({
      id_dosen: row.id_dosen || '',
      nama: row.nama || '',
      email: row.email || '',
      program_studi: row.program_studi || '',
      is_active: row.is_active,
    })
    setShowEdit(true)
  }

  const handleEditChange = (e) => {
    const { name, value } = e.target
    setEditForm(prev => ({ ...prev, [name]: value }))
  }

  const handleEditSubmit = async () => {
    const { id_dosen, nama, email, program_studi } = editForm
    if (!id_dosen.trim() || !nama.trim() || !email.trim() || !program_studi.trim()) {
      toast.error('Semua field wajib diisi!')
      return
    }
    setEditLoading(true)
    try {
      const res = await api.put(`/staff/dosen/${editDosenId}`, editForm)
      toast.success(res.data.message || 'Data dosen berhasil diperbarui!')
      setShowEdit(false)
      setEditForm(emptyEditForm)
      setEditDosenId(null)
      fetchRoster(selectedPeriode)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal memperbarui data dosen!')
    } finally {
      setEditLoading(false)
    }
  }

  const handleCloseEdit = () => {
    setShowEdit(false)
    setEditForm(emptyEditForm)
    setEditDosenId(null)
  }

  const handleHapusRoster = async (row) => {
    if (!window.confirm(`Hapus ${row.nama} dari roster PA periode ini? (data dosen tidak akan terhapus)`)) return
    setRemovingId(row.roster_id)
    try {
      const res = await api.delete(`/staff/roster-dosen-pa/${row.roster_id}`)
      toast.success(res.data.message || 'Dosen berhasil dihapus dari roster.')
      fetchRoster(selectedPeriode)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menghapus dosen dari roster!')
    } finally {
      setRemovingId(null)
    }
  }

  const filtered = roster.filter(d =>
    d.nama?.toLowerCase().includes(search.toLowerCase()) ||
    d.id_dosen?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pembimbing Akademik</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola roster Dosen Pembimbing Akademik (PA) per periode</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTambah(true)}
            disabled={!selectedPeriode}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-md bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus className="w-4 h-4" />
            Tambah
          </button>
          <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-md cursor-pointer
            ${uploading || !selectedPeriode ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
            <Upload className="w-4 h-4" />
            {uploading ? 'Mengimport...' : 'Import'}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="hidden" disabled={uploading || !selectedPeriode} />
          </label>
        </div>
      </div>

      {/* Search + Periode */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama atau ID Dosen..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50" />
        </div>
        <select
          value={selectedPeriode ?? ''}
          onChange={(e) => setLocalPeriode(periode.find(p => String(p.id) === String(e.target.value)))}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
        >
          {periode.map((p) => (
            <option key={p.id} value={p.id}>{p.nama_periode}</option>
          ))}
        </select>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">Roster Dosen Pembimbing Akademik</h2>
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
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && selectedPeriode ? (
                <tr><td colSpan={7} className="text-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto" />
                </td></tr>
              ) : !selectedPeriode ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                  Belum ada periode yang bisa dipilih.
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                  <GraduationCap className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  Belum ada Dosen PA untuk periode ini
                </td></tr>
              ) : filtered.map((d, i) => (
                <tr key={d.roster_id} className="hover:bg-gray-50 transition-colors">
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
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEdit(d)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-semibold transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleHapusRoster(d)}
                        disabled={removingId === d.roster_id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition-colors disabled:opacity-50"
                        title="Hapus dari roster periode ini (data dosen tidak dihapus)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {removingId === d.roster_id ? '...' : 'Hapus'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah */}
      {showTambah && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-600" />
                <h2 className="font-bold text-gray-800">Tambah Dosen ke Roster PA</h2>
              </div>
              <button onClick={handleCloseTambah} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">ID Dosen <span className="text-red-500">*</span></label>
                <input type="text" name="id_dosen" value={tambahForm.id_dosen} onChange={handleTambahChange}
                  placeholder="Contoh: 19.321.008"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Nama Lengkap <span className="text-red-500">*</span></label>
                <input type="text" name="nama" value={tambahForm.nama} onChange={handleTambahChange}
                  placeholder="Nama lengkap dosen"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Email <span className="text-red-500">*</span></label>
                <input type="email" name="email" value={tambahForm.email} onChange={handleTambahChange}
                  placeholder="email@itbss.ac.id"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Program Studi <span className="text-red-500">*</span></label>
                <input type="text" name="program_studi" value={tambahForm.program_studi} onChange={handleTambahChange}
                  placeholder="Contoh: Sistem dan Teknologi Informasi"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50" />
              </div>
              <p className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                Kalau ID Dosen sudah pernah terdaftar sebelumnya (misalnya lewat halaman Pembimbing MBKM), data yang sudah ada itu yang dipakai -- dosen ini langsung ditambahkan ke roster PA periode terpilih tanpa membuat data ganda.
              </p>
              <div className="flex gap-3 pt-2">
                <button onClick={handleCloseTambah}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
                  Batal
                </button>
                <button onClick={handleTambahSubmit} disabled={tambahLoading}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />
                  {tambahLoading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-amber-500" />
                <h2 className="font-bold text-gray-800">Edit Data Dosen</h2>
              </div>
              <button onClick={handleCloseEdit} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">ID Dosen <span className="text-red-500">*</span></label>
                <input type="text" name="id_dosen" value={editForm.id_dosen} onChange={handleEditChange}
                  placeholder="Contoh: 19.321.008"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Nama Lengkap <span className="text-red-500">*</span></label>
                <input type="text" name="nama" value={editForm.nama} onChange={handleEditChange}
                  placeholder="Nama lengkap dosen"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Email <span className="text-red-500">*</span></label>
                <input type="email" name="email" value={editForm.email} onChange={handleEditChange}
                  placeholder="email@itbss.ac.id"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Program Studi <span className="text-red-500">*</span></label>
                <input type="text" name="program_studi" value={editForm.program_studi} onChange={handleEditChange}
                  placeholder="Contoh: Sistem dan Teknologi Informasi"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-gray-50" />
              </div>
              <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl border border-gray-200">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Status Dosen</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {editForm.is_active ? 'Dosen saat ini aktif' : 'Dosen saat ini nonaktif'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm(prev => ({ ...prev, is_active: !prev.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
                    ${editForm.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                    ${editForm.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleCloseEdit}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
                  Batal
                </button>
                <button onClick={handleEditSubmit} disabled={editLoading}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />
                  {editLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}