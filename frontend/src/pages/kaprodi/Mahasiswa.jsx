import { useEffect, useState } from 'react'
import { Upload, Search, Users, UserCheck, X, Check, UserPlus, GraduationCap, BookOpen } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'

const emptyForm = {
  nim: '',
  nama: '',
  email: '',
  program_studi: '',
  periode_id: '',
}

export default function KaprodiMahasiswa() {
  const [activeTab, setActiveTab] = useState('data')

  // ── Data Mahasiswa ──
  const [mahasiswa, setMahasiswa] = useState([])
  const [dosen, setDosen] = useState([])
  const [periode, setPeriode] = useState([])
  const [selectedPeriode, setSelectedPeriode] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  // ── Assign Dosen ──
  const [pengajuanList, setPengajuanList] = useState([])
  const [loadingPengajuan, setLoadingPengajuan] = useState(true)
  const [searchAssign, setSearchAssign] = useState('')
  const [currentPageAssign, setCurrentPageAssign] = useState(1)
  const [showAssign, setShowAssign] = useState(null)
  const [selectedDosen, setSelectedDosen] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [selectedPeriodeAssign, setSelectedPeriodeAssign] = useState('')

  // ── Modal Tambah ──
  const [showTambah, setShowTambah] = useState(false)
  const [tambahForm, setTambahForm] = useState(emptyForm)
  const [tambahLoading, setTambahLoading] = useState(false)

  useEffect(() => { fetchAll() }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedPeriode) fetchMahasiswa() }, [selectedPeriode])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedPeriodeAssign) fetchPengajuan() }, [selectedPeriodeAssign])

  const fetchAll = async () => {
    try {
      const [dosenRes, periodeRes] = await Promise.all([
        api.get('/kaprodi/dosen'),
        api.get('/kaprodi/periode'),
      ])
      setDosen(dosenRes.data.data || [])
      const periodeData = periodeRes.data.data || []
      setPeriode(periodeData)
      const aktif = periodeData.find(p => p.is_active)
      const defaultId = aktif?.id ?? periodeData[0]?.id ?? ''
      if (defaultId) {
        setSelectedPeriode(defaultId)
        setSelectedPeriodeAssign(defaultId)
        setTambahForm(prev => ({ ...prev, periode_id: defaultId }))
      }
    } catch {
      toast.error('Gagal memuat data!')
    }
  }

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

  const fetchPengajuan = async () => {
    setLoadingPengajuan(true)
    try {
      const res = await api.get('/kaprodi/pengajuan-disetujui', {
        params: {
          ...(selectedPeriodeAssign ? { periode_id: selectedPeriodeAssign } : {}),
          _t: Date.now(),
        }
      })
      setPengajuanList(res.data.data || [])
    } catch {
      toast.error('Gagal memuat data pengajuan!')
    } finally {
      setLoadingPengajuan(false)
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!selectedPeriode) { toast.error('Pilih periode terlebih dahulu!'); return }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('periode_id', selectedPeriode)
      const res = await api.post('/kaprodi/import-mahasiswa', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success(res.data.message)
      fetchMahasiswa()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal import!')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleAssign = async () => {
    if (!selectedDosen || !showAssign) {
      toast.error('Pilih dosen terlebih dahulu!')
      return
    }
    setAssigning(true)
    try {
      await api.post('/kaprodi/assign-dosen', {
        mahasiswa_id: showAssign.mahasiswa_id,
        dosen_id: selectedDosen,
        periode_id: showAssign.periode_id || selectedPeriodeAssign,
      })
      toast.success('Dosen pembimbing berhasil di-assign!')
      setShowAssign(null)
      setSelectedDosen('')
      fetchPengajuan()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal assign dosen!')
    } finally {
      setAssigning(false)
    }
  }

  const handleTambahChange = (e) => {
    const { name, value } = e.target
    setTambahForm(prev => ({ ...prev, [name]: value }))
  }

  const handleTambahSubmit = async () => {
    const { nim, nama, email, program_studi, periode_id } = tambahForm
    if (!nim.trim() || !nama.trim() || !email.trim() || !program_studi.trim() || !periode_id) {
      toast.error('Semua field wajib diisi!')
      return
    }
    setTambahLoading(true)
    try {
      const res = await api.post('/kaprodi/mahasiswa', tambahForm)
      toast.success(res.data.message || 'Mahasiswa berhasil ditambahkan!')
      setShowTambah(false)
      setTambahForm({ ...emptyForm, periode_id: periode.find(p => p.is_active)?.id || '' })
      fetchMahasiswa()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menambahkan mahasiswa!')
    } finally {
      setTambahLoading(false)
    }
  }

  const handleCloseTambah = () => {
    setShowTambah(false)
    setTambahForm({ ...emptyForm, periode_id: periode.find(p => p.is_active)?.id || '' })
  }

  // ── Filtered & paginated ──
  const filteredMhs = mahasiswa.filter(m =>
    m.nama?.toLowerCase().includes(search.toLowerCase()) ||
    m.nim?.toLowerCase().includes(search.toLowerCase())
  )
  const totalPagesMhs = Math.ceil(filteredMhs.length / PAGE_SIZE)
  const paginatedMhs = filteredMhs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const filteredAssign = pengajuanList.filter(p =>
    p.nama?.toLowerCase().includes(searchAssign.toLowerCase()) ||
    p.nim?.toLowerCase().includes(searchAssign.toLowerCase()) ||
    p.judul?.toLowerCase().includes(searchAssign.toLowerCase())
  )
  const totalPagesAssign = Math.ceil(filteredAssign.length / PAGE_SIZE)
  const paginatedAssign = filteredAssign.slice((currentPageAssign - 1) * PAGE_SIZE, currentPageAssign * PAGE_SIZE)

  // ── Pagination renderer ──
  const renderPagination = (current, total, onPageChange, totalItems, label = 'data') => {
    if (total <= 1) return null
    const GROUP = 5
    const groupIndex = Math.floor((current - 1) / GROUP)
    const groupStart = groupIndex * GROUP + 1
    const groupEnd = Math.min(groupStart + GROUP - 1, total)
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-3 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          Menampilkan {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, totalItems)} dari {totalItems} {label}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => onPageChange(groupStart - GROUP)} disabled={groupStart === 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
            ‹ Prev
          </button>
          {Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map(page => (
            <button key={page} onClick={() => onPageChange(page)}
              className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
                page === current ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {page}
            </button>
          ))}
          <button onClick={() => onPageChange(groupStart + GROUP)} disabled={groupEnd === total}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
            Next ›
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Kelola Mahasiswa</h1>
        <p className="text-gray-500 text-sm mt-1">Manajemen data mahasiswa dan penugasan dosen pembimbing</p>
      </div>

      {/* Tab */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('data')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'data' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          Data Mahasiswa
        </button>
        <button
          onClick={() => setActiveTab('assign')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'assign' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          Assign Dosen
        </button>
      </div>

      {/* ══════════════ TAB: DATA MAHASISWA ══════════════ */}
      {activeTab === 'data' && (
        <>
          <div className="flex items-center justify-end gap-2">
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

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
                placeholder="Cari nama atau NIM..."
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
            </div>
            <select value={selectedPeriode}
              onChange={e => { setSelectedPeriode(e.target.value); setCurrentPage(1) }}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
              {periode.map(p => <option key={p.id} value={p.id}>{p.nama_periode}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">Daftar Mahasiswa</h2>
              <span className="text-sm text-gray-400">{filteredMhs.length} mahasiswa</span>
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
                  ) : filteredMhs.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">
                      <Users className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                      Belum ada data mahasiswa
                    </td></tr>
                  ) : paginatedMhs.map((m, i) => (
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

          {renderPagination(currentPage, totalPagesMhs, setCurrentPage, filteredMhs.length, 'mahasiswa')}
        </>
      )}

      {/* ══════════════ TAB: ASSIGN DOSEN ══════════════ */}
      {activeTab === 'assign' && (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={searchAssign}
                onChange={e => { setSearchAssign(e.target.value); setCurrentPageAssign(1) }}
                placeholder="Cari nama, NIM, atau judul..."
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
            </div>
            <select value={selectedPeriodeAssign}
              onChange={e => { setSelectedPeriodeAssign(e.target.value); setCurrentPageAssign(1) }}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
              {periode.map(p => <option key={p.id} value={p.id}>{p.nama_periode}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">Pengajuan Disetujui</h2>
              <span className="text-sm text-gray-400">{filteredAssign.length} mahasiswa</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">No</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">NIM</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Nama</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Program Studi</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Judul Capstone</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Dosen Pembimbing</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingPengajuan ? (
                    <tr><td colSpan={7} className="text-center py-12">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
                    </td></tr>
                  ) : filteredAssign.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                      <BookOpen className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                      Belum ada pengajuan yang disetujui
                    </td></tr>
                  ) : paginatedAssign.map((p, i) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-500">{(currentPageAssign - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-6 py-4 text-sm font-mono text-gray-700">{p.nim}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-800">{p.nama}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{p.program_studi || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-[220px]">
                        <p className="line-clamp-2">{p.judul || '-'}</p>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {p.nama_dosen ? (
                          <span className="flex items-center gap-1.5 text-green-700">
                            <UserCheck className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="line-clamp-1">{p.nama_dosen}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400 italic text-xs">Belum di-assign</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => { setShowAssign(p); setSelectedDosen(p.dosen_id || '') }}
                          className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap">
                          {p.nama_dosen ? 'Ganti Dosen' : 'Assign Dosen'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {renderPagination(currentPageAssign, totalPagesAssign, setCurrentPageAssign, filteredAssign.length, 'pengajuan')}
        </>
      )}

      {/* ══════════════ MODAL TAMBAH MAHASISWA ══════════════ */}
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
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                  Periode <span className="text-red-500">*</span>
                </label>
                <select name="periode_id" value={tambahForm.periode_id} onChange={handleTambahChange}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
                  <option value="">-- Pilih Periode --</option>
                  {periode.map(p => (
                    <option key={p.id} value={p.id}>{p.nama_periode}{p.is_active ? ' (Aktif)' : ''}</option>
                  ))}
                </select>
              </div>
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

      {/* ══════════════ MODAL ASSIGN DOSEN ══════════════ */}
      {showAssign && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600" />
                <h2 className="font-bold text-gray-800">Assign Dosen Pembimbing</h2>
              </div>
              <button onClick={() => { setShowAssign(null); setSelectedDosen('') }}
                className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Info mahasiswa */}
              <div className="bg-blue-50 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <p className="font-semibold text-gray-800 text-sm">{showAssign.nama}</p>
                </div>
                <p className="text-xs text-blue-600 font-mono ml-6">{showAssign.nim}</p>
                {showAssign.program_studi && (
                  <p className="text-xs text-gray-500 ml-6">{showAssign.program_studi}</p>
                )}
                {showAssign.judul && (
                  <div className="ml-6 mt-2 flex items-start gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-gray-600 italic leading-relaxed">{showAssign.judul}</p>
                  </div>
                )}
              </div>

              {/* Select dosen */}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                  Pilih Dosen Pembimbing <span className="text-red-500">*</span>
                </label>
                <select value={selectedDosen} onChange={e => setSelectedDosen(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50">
                  <option value="">-- Pilih Dosen --</option>
                  {dosen.map(d => (
                    <option key={d.id} value={d.id}>{d.nama} ({d.nidn})</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowAssign(null); setSelectedDosen('') }}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
                  Batal
                </button>
                <button onClick={handleAssign} disabled={assigning}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />
                  {assigning ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 