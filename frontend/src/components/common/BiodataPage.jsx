import { useState, useRef } from 'react'
import { Camera, Save, Pencil, X } from 'lucide-react'
import useAuthStore from '../../store/authStore'
import api from '../../utils/api'
import toast from 'react-hot-toast'

export default function BiodataPage() {
  const { user, updateUser } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [isEdit, setIsEdit] = useState(false)
  const [preview, setPreview] = useState(null)
  const [fotoFile, setFotoFile] = useState(null)
  const fileRef = useRef()

  const [form, setForm] = useState({
    nama: user?.nama || '',
    email: user?.email || '',
    program_studi: user?.program_studi || '',
    angkatan: user?.angkatan || '',
  })

  const fotoUrl = preview || (user?.foto ? `http://localhost:5000/${user.foto}` : null)

  const getInitials = (nama) => {
    if (!nama) return '?'
    return nama.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  }

  const handleFoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Ukuran foto maksimal 2MB!')
      return
    }
    setFotoFile(file)
    setPreview(URL.createObjectURL(file))
  }

  const handleCancel = () => {
    setIsEdit(false)
    setPreview(null)
    setFotoFile(null)
    setForm({
      nama: user?.nama || '',
      email: user?.email || '',
      program_studi: user?.program_studi || '',
      angkatan: user?.angkatan || '',
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('nama', form.nama)
      formData.append('email', form.email)
      formData.append('program_studi', form.program_studi)
      formData.append('angkatan', form.angkatan)
      if (fotoFile) formData.append('foto', fotoFile)

      const res = await api.put('/auth/update-profile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      updateUser({ ...user, ...res.data.user })
      toast.success('Profil berhasil diupdate!')
      setIsEdit(false)
      setPreview(null)
      setFotoFile(null)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal update profil!')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = (editable) =>
    `w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none transition-colors
    ${editable
      ? 'border-gray-200 focus:ring-2 focus:ring-blue-500 bg-gray-50'
      : 'border-gray-100 bg-gray-100 text-gray-500 cursor-not-allowed'}`

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Biodata</h1>
          <p className="text-gray-500 text-sm mt-1">Informasi profil akun kamu</p>
        </div>
        {!isEdit ? (
          <button
            onClick={() => setIsEdit(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors"
          >
            <Pencil className="w-4 h-4" />
            Edit Profil
          </button>
        ) : (
          <button
            onClick={handleCancel}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <X className="w-4 h-4" />
            Batal
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Foto Profil */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-700 mb-4">Foto Profil</h2>
          <div className="flex items-center gap-6">
            <div className="relative">
              {fotoUrl ? (
                <img src={fotoUrl} alt="foto profil"
                  className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold border-4 border-white shadow-lg">
                  {getInitials(user?.nama)}
                </div>
              )}
              {isEdit && (
                <button type="button"
                  onClick={() => fileRef.current.click()}
                  className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center shadow-md hover:bg-blue-700 transition-colors border-2 border-white">
                  <Camera className="w-4 h-4 text-white" />
                </button>
              )}
            </div>
            <div>
              {isEdit ? (
                <>
                  <p className="text-sm font-medium text-gray-700">Upload foto profil</p>
                  <p className="text-xs text-gray-400 mt-1">Format: JPG, PNG. Maks 2MB</p>
                  <button type="button"
                    onClick={() => fileRef.current.click()}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors">
                    Pilih Foto
                  </button>
                </>
              ) : (
                <p className="text-sm text-gray-400">Klik tombol Edit Profil untuk mengubah foto</p>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFoto} className="hidden" />
            </div>
          </div>
        </div>

        {/* Info Profil */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-700">Informasi Profil</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Nama Lengkap</label>
              <input type="text" value={form.nama}
                onChange={e => setForm({ ...form, nama: e.target.value })}
                disabled={!isEdit}
                className={inputClass(isEdit)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Email</label>
              <input type="email" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                disabled={!isEdit}
                className={inputClass(isEdit)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Username</label>
              <input type="text" value={user?.username || user?.nim || user?.nidn || '-'}
                disabled
                className={inputClass(false)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Role</label>
              <input type="text" value={user?.role || '-'}
                disabled
                className={`${inputClass(false)} capitalize`} />
            </div>
           {user?.role === 'mahasiswa' && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Program Studi</label>
                <input type="text" value={form.program_studi}
                  onChange={e => setForm({ ...form, program_studi: e.target.value })}
                  disabled={!isEdit}
                  className={inputClass(isEdit)} />
              </div>
            )}
            {user?.role === 'mahasiswa' && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Angkatan</label>
                <input type="text" value={form.angkatan}
                  onChange={e => setForm({ ...form, angkatan: e.target.value })}
                  disabled={!isEdit}
                  className={inputClass(isEdit)} />
              </div>
            )}
          </div>
        </div>

        {/* Submit — hanya tampil saat mode edit */}
        {isEdit && (
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 shadow-md">
            <Save className="w-4 h-4" />
            {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        )}
      </form>
    </div>
  )
}