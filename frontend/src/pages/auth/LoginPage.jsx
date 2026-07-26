import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Eye, EyeOff, User, Lock } from 'lucide-react'
import useAuthStore from '../../store/authStore'
import api from '../../utils/api'
import { subscribeToPush } from '../../utils/push'

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const { register, handleSubmit, formState: { errors } } = useForm()

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      const res = await api.post('/auth/login', data)
console.log('RESPONSE LOGIN:', res.data)
login(res.data.user, res.data.token)
toast.success(res.data.message)
      const redirectMap = {
        mahasiswa: '/mahasiswa/dashboard',
        dosen_pembimbing: '/dosen/dashboard',
        kaprodi: '/kaprodi/dashboard',
        staff_akademik: '/staff/dashboard',
      }
      navigate(redirectMap[res.data.user.role] || '/')
       setTimeout(() => {
      subscribeToPush()
    }, 2500)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Username atau password salah!')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-sm sm:max-w-md">

        {/* Logos */}
        <div className="flex items-center justify-center gap-4 sm:gap-6 mb-6 sm:mb-8">
          <img src="/logo-kampus-merdeka.png" alt="Kampus Merdeka"
            className="h-14 sm:h-16 md:h-20 object-contain drop-shadow-sm" />
          <div className="w-px h-12 sm:h-14 bg-gray-300 rounded-full" />
          <img src="/logo-itbss.png" alt="ITBSS"
            className="h-14 sm:h-16 md:h-20 object-contain drop-shadow-sm" />
        </div>

        {/* Title */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
            Sistem Pengelolaan MBKM
          </h1>
          <p className="text-gray-600 text-sm sm:text-base mt-1.5 font-medium">
            Selamat Datang di Portal MBKM
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

            {/* Username */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Username</label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  {...register('username', { required: 'Username wajib diisi' })}
                  type="text"
                  placeholder="Masukkan username"
                  autoComplete="username"
                  className={`w-full pl-10 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-gray-50 focus:bg-white
                    ${errors.username ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                />
              </div>
              {errors.username && <p className="text-red-500 text-xs mt-1">{errors.username.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  {...register('password', { required: 'Password wajib diisi' })}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••"
                  autoComplete="current-password"
                  className={`w-full pl-10 pr-12 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-gray-50 focus:bg-white
                    ${errors.password ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
              <div className="flex justify-end mt-2">
                <button type="button" onClick={() => navigate('/forgot-password')}
  className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
  Lupa Password?
</button>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl transition-all duration-200 text-sm tracking-widest uppercase shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed mt-2">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Memproses...
                </span>
              ) : 'Login'}
            </button>

          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-400 text-xs mt-4">
          © 2026 Grace
        </p>
      </div>
    </div>
  )
}