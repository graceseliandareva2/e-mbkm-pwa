import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutDashboard, Calendar, Users, UserCheck,
  BarChart3, CheckSquare, LogOut, Menu, X, Bell, User, GraduationCap
} from 'lucide-react'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'
import ProfileDropdown from '../common/ProfileDropdown'
import PeriodeSelector from '../common/PeriodeSelector'

const navItems = [
  { to: '/kaprodi/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/kaprodi/periode',    icon: Calendar,        label: 'Kelola Periode' },
  { to: '/kaprodi/mahasiswa',  icon: Users,           label: 'Data Mahasiswa' },
  { to: '/kaprodi/dosen',      icon: UserCheck,       label: 'Data Dosen' },
  { to: '/kaprodi/monitoring', icon: BarChart3,       label: 'Monitoring' },
  { to: '/kaprodi/verifikasi', icon: CheckSquare,     label: 'Pengajuan' },
  { to: '/kaprodi/biodata',    icon: User,            label: 'Biodata' },
]

export default function KaprodiLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    toast.success('Berhasil logout!')
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f0f2f5' }}>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`flex-shrink-0 w-56 h-full flex flex-col z-30
          transition-transform duration-300 ease-in-out
          fixed top-0 left-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static`}
        style={{ background: 'linear-gradient(180deg, #1e4db7 0%, #1a44a8 100%)' }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center py-6 px-4 border-b border-white/10">
          <img src="/logo-itbss.png" alt="ITBSS"
            className="h-16 w-16 object-contain mb-2 drop-shadow-lg" />
          <p className="text-white text-xs font-bold text-center leading-tight">ITB SABDA SETIA</p>
          <button className="lg:hidden absolute top-4 right-4 p-1 rounded-lg hover:bg-white/10"
            onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.to} to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${isActive
                    ? 'bg-white text-blue-800 font-semibold shadow-sm'
                    : 'text-white/80 hover:bg-white/15 hover:text-white'}`
                }>
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-white/10 flex-shrink-0">
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white w-full transition-all">
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3.5 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
          <button className="lg:hidden p-2 rounded-xl hover:bg-gray-100"
            onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <p className="text-sm text-gray-600">
            Anda Masuk Sebagai <span className="font-bold text-blue-700">Kaprodi</span>
          </p>
          <div className="flex-1" />
          <PeriodeSelector />
          <div className="pl-2 border-l border-gray-200">
            <ProfileDropdown />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}