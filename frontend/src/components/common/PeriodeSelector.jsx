import { useState, useRef, useEffect } from 'react'
import { CalendarDays, ChevronDown, Check } from 'lucide-react'
import useAuthStore from '../../store/authStore'
import usePeriodeStore from '../../store/periodeStore'
import api from '../../utils/api'
import toast from 'react-hot-toast'

export default function PeriodeSelector() {
  const [open, setOpen] = useState(false)
  const [periodeList, setPeriodeList] = useState([])
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  const { user } = useAuthStore()
  const {
    selectedPeriode, setSelectedPeriode,
    selectedPeriodeKaprodi, setSelectedPeriodeKaprodi,
    selectedPeriodeStaff, setSelectedPeriodeStaff,
  } = usePeriodeStore()

  const isDosen = user?.role === 'dosen'
  const isStaff = user?.role === 'staff_akademik'

  const endpoint = isDosen ? '/dosen/periode' : isStaff ? '/staff/periode' : '/kaprodi/periode'
  const activePeriode = isDosen ? selectedPeriode : isStaff ? selectedPeriodeStaff : selectedPeriodeKaprodi
  const setActivePeriode = isDosen ? setSelectedPeriode : isStaff ? setSelectedPeriodeStaff : setSelectedPeriodeKaprodi

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open && periodeList.length === 0) fetchPeriode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const fetchPeriode = async () => {
    setLoading(true)
    try {
      const res = await api.get(endpoint)
      setPeriodeList(res.data.data || res.data || [])
    } catch {
      toast.error('Gagal memuat daftar periode')
    } finally {
      setLoading(false)
    }
  }

  const handlePilih = (p) => {
    setActivePeriode(p)
    toast.success(`Periode: ${p.nama_periode}`)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
      >
        <CalendarDays className="w-4 h-4 text-blue-600" />
        <span className="text-sm text-gray-700 font-medium">
          {activePeriode ? activePeriode.nama_periode : 'Periode aktif'}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 p-2">
          {loading ? (
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
                  onClick={() => handlePilih(p)}
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
      )}
    </div>
  )
}