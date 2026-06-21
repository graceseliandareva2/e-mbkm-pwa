import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export default function PeriodeDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selected = options.find(p => String(p.id) === String(value))

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px] justify-between"
      >
        <span className="truncate text-gray-700">
          {selected?.nama_periode || 'Pilih periode...'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {options.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onChange(String(p.id)); setOpen(false) }}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors
                ${String(p.id) === String(value)
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
                }`}
            >
              {p.nama_periode}
              {String(p.id) === String(value) && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}