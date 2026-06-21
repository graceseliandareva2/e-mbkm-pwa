import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, UserCheck, FileCheck, FileText, Clock, CheckCircle, XCircle } from 'lucide-react'
import api from '../../utils/api'
import { formatTanggal } from '../../utils/helpers'
import usePeriodeStore from '../../store/periodeStore'

export default function KaprodiDashboard() {
  const [stats, setStats] = useState({
    total_mahasiswa: 0,
    total_dosen: 0,
    dokumen_lengkap: 0,
    total_pengajuan: 0,
    pengajuan_diajukan: 0,
    pengajuan_disetujui: 0,
    pengajuan_ditolak: 0,
  })
  const [pengajuan, setPengajuan] = useState([])
  const [periode, setPeriode] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { selectedPeriodeKaprodi } = usePeriodeStore()
// eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [selectedPeriodeKaprodi])

  const fetchData = async () => {
  try {
    const periodeParam = selectedPeriodeKaprodi ? { periode_id: selectedPeriodeKaprodi.id } : {}

    const [statsRes, pengajuanRes, periodeRes] = await Promise.all([
      api.get('/kaprodi/dashboard-stats', { params: periodeParam }),
      api.get('/kaprodi/verifikasi-pengajuan', { params: periodeParam }),
      api.get('/kaprodi/periode'),
    ])

    const statsData = statsRes.data.data || {}
    const pngj = pengajuanRes.data.data || []
    const prd = periodeRes.data.data || []

    setStats({
      total_mahasiswa: statsData.total_mahasiswa ?? 0,
      total_dosen: statsData.total_dosen ?? 0,
      dokumen_lengkap: statsData.dokumen_lengkap ?? 0,
      total_pengajuan: statsData.total_pengajuan ?? 0,
      pengajuan_diajukan:   pngj.filter(p => p.status === 'diajukan').length,
      pengajuan_disetujui:  pngj.filter(p => p.status === 'disetujui_kaprodi').length,
      pengajuan_ditolak:    pngj.filter(p => p.status === 'ditolak').length,
    })

    setPengajuan(pngj.slice(0, 5))
    setPeriode(prd)
  } catch (err) {
    console.error(err)
  } finally {
    setLoading(false)
  }
}

  const getStatusBadge = (status) => {
    const map = {
      diajukan: { cls: 'bg-yellow-100 text-yellow-800', label: 'Diajukan' },
      disetujui_kaprodi: { cls: 'bg-green-100 text-green-800', label: 'Disetujui' },
      ditolak: { cls: 'bg-red-100 text-red-800', label: 'Ditolak' },
      revisi: { cls: 'bg-orange-100 text-orange-800', label: 'Revisi' },
    }
    return map[status] || { cls: 'bg-gray-100 text-gray-800', label: status }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Dashboard Kaprodi</h1>
          <p className="text-sm text-gray-500">Selamat datang kembali</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div onClick={() => navigate('/kaprodi/mahasiswa')}
          className="bg-green-500 rounded-2xl p-5 text-white shadow-md cursor-pointer hover:bg-green-600 active:scale-95 transition-all">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium opacity-90">Total Mahasiswa</p>
            <Users className="w-5 h-5 opacity-70" />
          </div>
          <p className="text-4xl font-bold">{stats.total_mahasiswa}</p>
        </div>

        <div onClick={() => navigate('/kaprodi/dosen')}
          className="bg-blue-500 rounded-2xl p-5 text-white shadow-md cursor-pointer hover:bg-blue-600 active:scale-95 transition-all">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium opacity-90">Total Dosen</p>
            <UserCheck className="w-5 h-5 opacity-70" />
          </div>
          <p className="text-4xl font-bold">{stats.total_dosen}</p>
        </div>

        <div onClick={() => navigate('/kaprodi/verifikasi')}
          className="bg-red-500 rounded-2xl p-5 text-white shadow-md cursor-pointer hover:bg-red-600 active:scale-95 transition-all">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium opacity-90">Total Pengajuan</p>
            <FileText className="w-5 h-5 opacity-70" />
          </div>
          <p className="text-4xl font-bold">{stats.total_pengajuan}</p>
        </div>

        <div onClick={() => navigate('/kaprodi/monitoring')}
          className="bg-orange-500 rounded-2xl p-5 text-white shadow-md cursor-pointer hover:bg-orange-600 active:scale-95 transition-all">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium opacity-90">Dokumen Lengkap</p>
            <FileCheck className="w-5 h-5 opacity-70" />
          </div>
          <p className="text-4xl font-bold">{stats.dokumen_lengkap}</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div onClick={() => navigate('/kaprodi/verifikasi')}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow-md hover:border-yellow-200 active:scale-95 transition-all group">
          <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-yellow-200 transition-colors">
            <Clock className="w-6 h-6 text-yellow-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{stats.pengajuan_diajukan}</p>
            <p className="text-sm text-gray-500">Menunggu Verifikasi</p>
          </div>
        </div>

        <div onClick={() => navigate('/kaprodi/verifikasi')}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow-md hover:border-green-200 active:scale-95 transition-all group">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-green-200 transition-colors">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{stats.pengajuan_disetujui}</p>
            <p className="text-sm text-gray-500">Pengajuan Disetujui</p>
          </div>
        </div>

        <div onClick={() => navigate('/kaprodi/verifikasi')}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow-md hover:border-red-200 active:scale-95 transition-all group">
          <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-red-200 transition-colors">
            <XCircle className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{stats.pengajuan_ditolak}</p>
            <p className="text-sm text-gray-500">Pengajuan Ditolak</p>
          </div>
        </div>
      </div>

      {/* Tabel & Periode */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-800">Kelola Pengajuan MBKM</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">No</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Nama Mahasiswa</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">NIM</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pengajuan.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-gray-400 text-sm">
                      Belum ada data pengajuan
                    </td>
                  </tr>
                ) : pengajuan.map((p, i) => {
                  const { cls, label } = getStatusBadge(p.status)
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-600">{i + 1}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-800">{p.nama_mahasiswa}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{p.nim}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>{label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-800">Periode Aktif</h2>
          </div>
          <div className="p-4 space-y-3">
            {periode.filter(p => p.is_active).length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Belum ada periode aktif</p>
            ) : periode.filter(p => p.is_active).map(p => (
              <div key={p.id} className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                <p className="font-semibold text-blue-800 text-sm">{p.nama_periode}</p>
                <p className="text-xs text-blue-500 mt-0.5 capitalize">{p.jenis}</p>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Form Pengajuan</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.form_pengajuan_buka ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {p.form_pengajuan_buka ? 'Buka' : 'Tutup'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Form Logbook</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.form_logbook_buka ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {p.form_logbook_buka ? 'Buka' : 'Tutup'}
                    </span>
                  </div>
                  {p.tanggal_selesai_pengajuan && (
                    <p className="text-xs text-gray-400 pt-1">
                      Deadline: {formatTanggal(p.tanggal_selesai_pengajuan)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}