import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutDashboard, ClipboardList, Archive, LogOut, Menu, X, Bell, User, Users,
  UserCheck, BarChart3, ChevronDown, GraduationCap, BookUser
} from 'lucide-react'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'
import ProfileDropdown from '../common/ProfileDropdown'
import PeriodeSelector from '../common/PeriodeSelector'

// PERUBAHAN (split Pembimbing MBKM / Pembimbing Akademik):
// Menu "Data Dosen" yang tadinya 1 item link langsung, sekarang jadi 1
// item PARENT dengan submenu (2 anak: Pembimbing MBKM & Pembimbing
// Akademik). navItems dipecah jadi array flat item (dashboard, pengajuan,
// dst) dan 1 objek khusus `dosenSubmenu` supaya gampang di-render beda
// (parent-nya bisa expand/collapse, item lain tetap link biasa seperti semula).
const navItems = [
  { to: '/staff/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/staff/pengajuan',    icon: ClipboardList,   label: 'Pengajuan MBKM' },
  // PERUBAHAN (item #6): CRUD mahasiswa & dosen pindah ke sini dari Kaprodi.
  { to: '/staff/mahasiswa',    icon: Users,           label: 'Data Mahasiswa' },
]

const dosenSubmenu = {
  label: 'Data Dosen',
  icon: UserCheck,
  children: [
    { to: '/staff/dosen/mbkm',     icon: BookUser,      label: 'Pembimbing MBKM' },
    { to: '/staff/dosen/akademik', icon: GraduationCap, label: 'Pembimbing Akademik' },
  ],
}

const navItemsBawah = [
  // BARU: menu Monitoring (logbook + dokumen mahasiswa, view-only).
  { to: '/staff/monitoring',   icon: BarChart3,       label: 'Monitoring' },
  { to: '/staff/biodata',      icon: User,            label: 'Biodata' },
]

export default function StaffLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  // Submenu "Data Dosen" otomatis kebuka kalau user lagi ada di salah satu
  // halaman anaknya (misal habis refresh langsung di /staff/dosen/akademik).
  const isDosenActive = location.pathname.startsWith('/staff/dosen')
const [dosenMenuOpen, setDosenMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    toast.success('Berhasil logout!')
    navigate('/login')
  }

  const renderNavItem = (item) => {
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
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
          {navItems.map(renderNavItem)}

          {/* Submenu Data Dosen */}
          <div>
            <button
              type="button"
              onClick={() => setDosenMenuOpen((prev) => !prev)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isDosenActive
                  ? 'bg-white/10 text-white font-semibold'
                  : 'text-white/80 hover:bg-white/15 hover:text-white'}`}
            >
              <dosenSubmenu.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">{dosenSubmenu.label}</span>
              <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${dosenMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {dosenMenuOpen && (
              <div className="mt-1 ml-3 pl-3 border-l border-white/15 space-y-1">
                {dosenSubmenu.children.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink key={item.to} to={item.to}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all
                        ${isActive
                          ? 'bg-white text-blue-800 font-semibold shadow-sm'
                          : 'text-white/70 hover:bg-white/15 hover:text-white'}`
                      }>
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  )
                })}
              </div>
            )}
          </div>

          {navItemsBawah.map(renderNavItem)}
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
            Anda Masuk Sebagai <span className="font-bold text-blue-700">Staff Akademik</span>
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