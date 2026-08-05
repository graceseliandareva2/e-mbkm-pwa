import { useEffect, useState } from 'react'
import { Users, BookOpen, FileText, Clock, Upload } from 'lucide-react'
import api from '../../utils/api'
import { useNavigate } from 'react-router-dom'
import usePeriodeFilter from '../../hooks/usePeriodeFilter'

const formatWaktu = (date) => {
  const d = new Date(date)
  const now = new Date()
  const diff = Math.floor((now - d) / 1000)
  if (diff < 60) return 'Baru saja'
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`
  return `${Math.floor(diff / 86400)} hari lalu`
}

export default function DosenDashboard() {
  const [stats, setStats] = useState({
    total_mahasiswa: 0,
    logbook_menunggu: 0,
    dokumen_lengkap: 0,
  })
  const [aktivitas, setAktivitas] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  // ─── ambil periode dari sumber tunggal (global, auto-init kalau kosong) ───
  const { periodeId, activePeriode: selectedPeriode } = usePeriodeFilter('dosen_pembimbing')

  // re-fetch setiap kali periode berubah
  useEffect(() => { fetchData() }, [periodeId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = periodeId ? { periode_id: periodeId } : {}

      const [mhsRes, aktivitasRes] = await Promise.all([
        api.get('/dosen/mahasiswa-bimbingan', { params }),
        api.get('/dosen/aktivitas-terbaru', { params }),
      ])

      const mhsList = mhsRes.data.data || []
      setAktivitas(aktivitasRes.data.data || [])

      let logbookMenunggu = 0
      let dokumenLengkap  = 0

     await Promise.all(mhsList.map(async (m) => {
  try {
    const mhsParams = { mahasiswa_id: m.id, ...(periodeId ? { periode_id: periodeId } : {}) }
    const [lbRes, dkRes] = await Promise.all([
      api.get('/dosen/logbook', { params: mhsParams }),
      api.get('/dosen/dokumen',  { params: mhsParams }),
    ])
    const lbs = lbRes.data.data || []
    const dks = dkRes.data.data || []

    logbookMenunggu += lbs.filter(l => l.status === 'disubmit').length

    const laporan = dks.find(d => d.jenis === 'laporan_akhir')
    const ppt     = dks.find(d => d.jenis === 'ppt')
    const totalJam = lbs
      .filter(l => l.status === 'diverifikasi')
      .reduce((sum, l) => sum + (Number(l.durasi_menit) || 0), 0) / 60
    const minJam = Number(selectedPeriode?.min_jam_pengajuan) || 0

    if (laporan?.status === 'diverifikasi' && ppt?.status === 'diverifikasi' && totalJam >= minJam) {
      dokumenLengkap++
    }
  } catch { /* ignore per-mahasiswa error */ }
}))

      setStats({
        total_mahasiswa:  mhsList.length,
        logbook_menunggu: logbookMenunggu,
        dokumen_lengkap:  dokumenLengkap,
      })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Dashboard Dosen Pembimbing</h1>
        <p className="text-sm text-gray-500">
          {selectedPeriode
            ? `Menampilkan data periode: ${selectedPeriode.nama_periode}`
            : 'Selamat datang kembali'}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div onClick={() => navigate('/dosen/mahasiswa')}
          className="bg-blue-500 rounded-2xl p-5 text-white shadow-md cursor-pointer hover:bg-blue-600 active:scale-95 transition-all">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium opacity-90">Mahasiswa</p>
            <Users className="w-5 h-5 opacity-70" />
          </div>
          <p className="text-4xl font-bold">{stats.total_mahasiswa}</p>
          <p className="text-xs opacity-70 mt-1">Total mahasiswa</p>
        </div>

        <div onClick={() => navigate('/dosen/logbook')}
          className="bg-yellow-500 rounded-2xl p-5 text-white shadow-md cursor-pointer hover:bg-yellow-600 active:scale-95 transition-all">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium opacity-90">Logbook</p>
            <Clock className="w-5 h-5 opacity-70" />
          </div>
          <p className="text-4xl font-bold">{stats.logbook_menunggu}</p>
          <p className="text-xs opacity-70 mt-1">Menunggu verifikasi</p>
        </div>

        <div onClick={() => navigate('/dosen/dokumen')}
          className="bg-orange-500 rounded-2xl p-5 text-white shadow-md cursor-pointer hover:bg-orange-600 active:scale-95 transition-all">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium opacity-90">Dokumen</p>
            <FileText className="w-5 h-5 opacity-70" />
          </div>
          <p className="text-4xl font-bold">{stats.dokumen_lengkap}</p>
          <p className="text-xs opacity-70 mt-1">Dokumen lengkap</p>
        </div>
      </div>

      {/* Aktivitas Terbaru */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">Aktivitas Terbaru</h2>
          <p className="text-xs text-gray-400 mt-0.5">Update logbook & dokumen dari mahasiswa bimbingan</p>
        </div>
        <div className="divide-y divide-gray-50">
          {aktivitas.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">
              <Clock className="w-8 h-8 mx-auto mb-2 text-gray-200" />
              Belum ada aktivitas terbaru
            </div>
          ) : aktivitas.map((a, i) => (
            <div key={i} className="px-6 py-3.5 flex items-center gap-3 hover:bg-gray-50 cursor-pointer"
              onClick={() => navigate(a.tipe === 'logbook' ? '/dosen/logbook' : '/dosen/dokumen')}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0
                ${a.tipe === 'logbook' ? 'bg-blue-100' : 'bg-red-100'}`}>
                {a.tipe === 'logbook'
                  ? <BookOpen className="w-4 h-4 text-blue-600" />
                  : <Upload className="w-4 h-4 text-red-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{a.nama_mahasiswa}
                  <span className="font-normal text-gray-500"> · {a.nim}</span>
                </p>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {a.tipe === 'logbook' ? '📖 Isi logbook: ' : '📎 Upload dokumen: '}
                  {a.deskripsi}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-xs text-gray-400">{formatWaktu(a.created_at)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                  ${['diverifikasi', 'disetujui_dospem', 'disetujui_kaprodi'].includes(a.status)
                    ? 'bg-green-100 text-green-700'
                    : a.status === 'disubmit' || a.status === 'diupload'
                    ? 'bg-yellow-100 text-yellow-700'
                    : a.status === 'revisi' || a.status === 'revisi_dospem' || a.status === 'revisi_kaprodi'
                    ? 'bg-red-100 text-red-600'
                    : 'bg-gray-100 text-gray-600'}`}>
                  {a.status === 'disubmit'         ? 'Menunggu' :
                   a.status === 'diupload'          ? 'Menunggu' :
                   a.status === 'diverifikasi'      ? 'Terverifikasi' :
                   a.status === 'disetujui_dospem'  ? 'Terverifikasi' :
                   a.status === 'disetujui_kaprodi' ? 'Disetujui Kaprodi' :
                   a.status === 'revisi_dospem'     ? 'Perlu Revisi' :
                   a.status === 'revisi_kaprodi'    ? 'Perlu Revisi' :
                   a.status === 'revisi'            ? 'Perlu Revisi' : a.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}