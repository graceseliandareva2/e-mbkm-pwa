import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../utils/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async () => {
    if (!email) return toast.error('Email wajib diisi!')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      toast.success('Link reset password telah dikirim ke email!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal mengirim email reset!')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-sm sm:max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Lupa Password</h1>
          <p className="text-gray-500 text-sm mb-6">Masukkan email untuk menerima link reset password</p>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Masukkan email Anda"
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
              />
            </div>
          </div>

          <p className="text-orange-600 text-sm mb-6">
            Pastikan email Anda terdaftar di sistem. Dengan melakukan Reset Kata Sandi maka sistem
            akan mengirimkan email berisi informasi perubahan kata Sandi.
          </p>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all text-sm shadow-md disabled:opacity-60 disabled:cursor-not-allowed mb-3">
            {loading ? 'Mengirim...' : 'Reset Password'}
          </button>

          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 text-blue-600 hover:text-blue-800 font-semibold text-sm transition-colors">
            Kembali ke Halaman Login
          </button>
        </div>

        <p className="text-center text-gray-400 text-xs mt-4">© 2026 Grace</p>
      </div>
    </div>
  )
}