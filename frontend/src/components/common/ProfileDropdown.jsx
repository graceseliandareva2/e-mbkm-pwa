import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Lock, LogOut, KeyRound, X, CalendarDays, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/authStore'
import usePeriodeStore from '../../store/periodeStore'
import api from '../../utils/api'
import toast from 'react-hot-toast'

export default function ProfileDropdown() {
  const [open, setOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showPeriode, setShowPeriode] = useState(false)
  const [periodeList, setPeriodeList] = useState([])
  const [loadingPeriode, setLoadingPeriode] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ password_lama: '', password_baru: '', konfirmasi: '' })
  const [loadingPassword, setLoadingPassword] = useState(false)

  const { user, logout } = useAuthStore()
  const {
    selectedPeriode, setSelectedPeriode, clearPeriode,
    selectedPeriodeKaprodi, setSelectedPeriodeKaprodi, clearPeriodeKaprodi,
  } = usePeriodeStore()

  const navigate = useNavigate()
  const dropdownRef = useRef(null)

  const isDosen = user?.role === 'dosen_pembimbing'
  const showPeriodePicker = false

  // periode yg sedang aktif di store (sesuai role)
  const activePeriode = isDosen ? selectedPeriode : selectedPeriodeKaprodi
  const setActivePeriode = isDosen ? setSelectedPeriode : setSelectedPeriodeKaprodi

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
        setShowPassword(false)
        setShowPeriode(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (showPeriode && periodeList.length === 0) fetchPeriode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPeriode])

  const fetchPeriode = async () => {
    setLoadingPeriode(true)
    try {
      const endpoint = isDosen ? '/dosen/periode' : '/kaprodi/periode'
      const res = await api.get(endpoint)
      setPeriodeList(res.data.data || res.data || [])
    } catch {
      toast.error('Gagal memuat daftar periode')
    } finally {
      setLoadingPeriode(false)
    }
  }

  const handleLogout = () => {
    logout()
    clearPeriode()
    clearPeriodeKaprodi()
    toast.success('Berhasil logout!')
    navigate('/login')
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (passwordForm.password_baru !== passwordForm.konfirmasi) {
      toast.error('Konfirmasi password tidak cocok!')
      return
    }
    if (passwordForm.password_baru.length < 6) {
      toast.error('Password baru minimal 6 karakter!')
      return
    }
    setLoadingPassword(true)
    try {
      await api.put('/auth/ganti-password', {
        password_lama: passwordForm.password_lama,
        password_baru: passwordForm.password_baru,
      })
      toast.success('Password berhasil diubah!')
      setPasswordForm({ password_lama: '', password_baru: '', konfirmasi: '' })
      setShowPassword(false)
      setOpen(false)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal mengubah password!')
    } finally {
      setLoadingPassword(false)
    }
  }

  const handlePilihPeriode = (periode) => {
    setActivePeriode(periode)
    toast.success(`Periode: ${periode.nama_periode}`)
    setOpen(false)
    setShowPeriode(false)
  }

  const getInitials = (nama) => {
    if (!nama) return '?'
    return nama.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  }

  const fotoUrl = user?.foto?.startsWith('http') ? user.foto : null

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => { setOpen(!open); setShowPassword(false); setShowPeriode(false) }}
        className="flex items-center gap-2 hover:bg-gray-50 rounded-xl px-2 py-1.5 transition-colors"
      >
        {fotoUrl ? (
          <img src={fotoUrl} alt="foto" className="w-8 h-8 rounded-full object-cover border-2 border-gray-200" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {getInitials(user?.nama)}
          </div>
        )}
        <div className="hidden sm:flex flex-col items-start">
          <span className="text-sm font-medium text-gray-700 max-w-24 truncate leading-tight">
            {user?.nama?.split(' ')[0]}
          </span>
          {showPeriodePicker && activePeriode && (
            <span className="text-xs text-blue-600 font-medium max-w-24 truncate leading-tight">
              {activePeriode.nama_periode}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">

          {/* ── VIEW: GANTI PASSWORD ── */}
          {showPassword ? (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setShowPassword(false)}
                  className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-blue-600" />
                  <p className="font-semibold text-gray-800 text-sm">Ubah Kata Sandi</p>
                </div>
              </div>
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Password Lama</label>
                  <input type="password"
                    value={passwordForm.password_lama}
                    onChange={e => setPasswordForm({ ...passwordForm, password_lama: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    placeholder="••••••••" required />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Password Baru</label>
                  <input type="password"
                    value={passwordForm.password_baru}
                    onChange={e => setPasswordForm({ ...passwordForm, password_baru: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    placeholder="••••••••" required />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Konfirmasi Password Baru</label>
                  <input type="password"
                    value={passwordForm.konfirmasi}
                    onChange={e => setPasswordForm({ ...passwordForm, konfirmasi: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    placeholder="••••••••" required />
                </div>
                <button type="submit" disabled={loadingPassword}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60">
                  {loadingPassword ? 'Menyimpan...' : 'Simpan Password'}
                </button>
              </form>
            </div>

          /* ── VIEW: PILIH PERIODE ── */
          ) : showPeriode ? (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => setShowPeriode(false)}
                  className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-blue-600" />
                  <p className="font-semibold text-gray-800 text-sm">Pilih Periode</p>
                </div>
              </div>

              {loadingPeriode ? (
                <div className="flex justify-center py-6">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : periodeList.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Tidak ada periode tersedia</p>
              ) : (
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {periodeList.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handlePilihPeriode(p)}
                      className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-sm transition-colors
                        ${activePeriode?.id === p.id
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'text-gray-700 hover:bg-gray-50'}`}
                    >
                      <span>{p.nama_periode}</span>
                      {activePeriode?.id === p.id && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

          /* ── VIEW: MENU UTAMA ── */
          ) : (
            <>
              <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 border-b border-blue-100">
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    {fotoUrl ? (
                      <img src={fotoUrl} alt="foto"
                        className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-md" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white text-lg font-bold border-2 border-white shadow-md">
                        {getInitials(user?.nama)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm leading-tight">{user?.nama}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{user?.nim || user?.nidn || user?.username}</p>
                    {user?.program_studi && (
                      <p className="text-xs text-blue-600 font-medium mt-0.5 truncate">{user?.program_studi}</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {user?.angkatan && (
                    <div className="bg-white rounded-lg p-2">
                      <p className="text-xs text-gray-400">Angkatan</p>
                      <p className="text-xs font-semibold text-gray-700">{user.angkatan}</p>
                    </div>
                  )}
                  {user?.periode_aktif && (
                    <div className="bg-white rounded-lg p-2">
                      <p className="text-xs text-gray-400">Periode</p>
                      <p className="text-xs font-semibold text-gray-700">{user.periode_aktif}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-2">
                {/* Filter Periode — dosen & kaprodi */}
                {showPeriodePicker && (
                  <button
                    onClick={() => setShowPeriode(true)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <CalendarDays className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm text-gray-700">Periode</p>
                      {activePeriode ? (
                        <p className="text-xs text-blue-600 font-medium">{activePeriode.nama_periode}</p>
                      ) : (
                        <p className="text-xs text-gray-400">Periode aktif (default)</p>
                      )}
                    </div>
                    <ChevronDown className="w-4 h-4 text-gray-400 -rotate-90" />
                  </button>
                )}

                <button
                  onClick={() => setShowPassword(true)}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Lock className="w-4 h-4 text-orange-600" />
                  </div>
                  <span>Ubah Kata Sandi</span>
                </button>

                <div className="border-t border-gray-100 mt-1 pt-1">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <LogOut className="w-4 h-4 text-red-600" />
                    </div>
                    <span>Keluar</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}