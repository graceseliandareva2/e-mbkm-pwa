import { useEffect, useState } from 'react'
import { FileText, CheckCircle, Clock, XCircle, Eye, MessageSquare, X, Search, AlertCircle } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import usePeriodeFilter from '../../hooks/usePeriodeFilter'
import PeriodeDropdown from '../../components/common/PeriodeDropdown'
import BuktiPreview, { FileBuktiPreview } from '../../components/common/BuktiPreview'
const BASE_URL = ''

const getFileUrl = (doc) => {
  if (!doc) return null
  return doc.cloudinary_url || doc.path_file || null
}

const STATUS_CONFIG = {
  diupload:          { label: 'Menunggu Review',   color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: Clock },
  disetujui_kaprodi: { label: 'Disetujui Kaprodi', color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200',   icon: Clock },
  diverifikasi:      { label: 'Diverifikasi',      color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200',  icon: CheckCircle },
  ditolak:           { label: 'Ditolak',           color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    icon: XCircle },
  disetujui_dospem:  { label: 'Menunggu Kaprodi',  color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200',   icon: Clock },
  revisi_dospem:     { label: 'Perlu Revisi',      color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', icon: XCircle },
  revisi_kaprodi:    { label: 'Revisi Kaprodi',    color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    icon: XCircle },
}

const JENIS_LABEL = {
  laporan_akhir:     'Laporan Akhir',
  ppt:               'PPT',
  dokumen_pendukung: 'Dokumen Pendukung',
}

const JENIS_TABS = [
  { key: 'semua',         label: 'Semua' },
  { key: 'laporan_akhir', label: 'Laporan Akhir' },
  { key: 'ppt',           label: 'PPT' },
]

//Modal Detail 
function DetailModal({ doc, onClose, onRefresh }) {
  const [feedback, setFeedback]     = useState('')
  const [processing, setProcessing] = useState(false)

  const statusCfg  = STATUS_CONFIG[doc.status] || STATUS_CONFIG.diupload
  const StatusIcon = statusCfg.icon

  const canAksi = doc.jenis === 'ppt'
    ? ['diupload', 'revisi_dospem'].includes(doc.status)
    : doc.status === 'diupload'

  const handleVerifikasi = async (status) => {
    setProcessing(true)
    try {
      await api.patch(`/dosen/dokumen/${doc.id}/verifikasi`, { status, feedback })
      toast.success(status === 'disetujui_dospem' ? 'Dokumen disetujui!' : 'Dokumen diminta revisi!')
      onRefresh()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal memproses dokumen')
    } finally {
      setProcessing(false)
    }
  }

  const getInfoMessage = () => {
    if (doc.jenis === 'laporan_akhir') {
      switch (doc.status) {
        case 'revisi_kaprodi':
          return { text: 'Kaprodi meminta revisi dari mahasiswa. Menunggu mahasiswa mengupload ulang.', icon: XCircle, cfg: statusCfg }
        case 'diverifikasi':
          return { text: 'Laporan Akhir telah diverifikasi oleh Kaprodi dan Dosen Pembimbing.', icon: CheckCircle, cfg: statusCfg }
        case 'disetujui_dospem':
          return { text: 'Kamu sudah menyetujui. Menunggu verifikasi Kaprodi.', icon: Clock, cfg: statusCfg }
        case 'revisi_dospem':
          return { text: `Kamu telah meminta revisi.${doc.feedback_dospem ? ` Catatan: ${doc.feedback_dospem}` : ''}`, icon: XCircle, cfg: statusCfg }
        default:
          return null
      }
    } else {
      switch (doc.status) {
        case 'diverifikasi':
          return { text: 'PPT telah diverifikasi oleh Dosen Pembimbing.', icon: CheckCircle, cfg: statusCfg }
        default:
          return null
      }
    }
  }

  const infoMsg = !canAksi ? getInfoMessage() : null

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col" style={{ height: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-gray-800 text-sm">
                {JENIS_LABEL[doc.jenis] || doc.jenis}
              </p>
              {doc.nama_mahasiswa && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {doc.nama_mahasiswa} · {doc.nim}
                </span>
              )}
              <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}>
                <StatusIcon className="w-3 h-3" />
                {statusCfg.label}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{doc.nama_file}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview PDF */}
        <div className="flex-1 overflow-hidden bg-gray-50 p-5">
          <FileBuktiPreview path={getFileUrl(doc)} filename={doc.nama_file} />
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 p-4 flex-shrink-0 space-y-3">
          {canAksi ? (
            <>
              {doc.feedback_dospem && (
                <div className="flex items-start gap-2 bg-purple-50 border border-purple-100 rounded-xl px-3.5 py-3">
                  <MessageSquare className="w-3.5 h-3.5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-purple-700 mb-0.5">Feedback sebelumnya</p>
                    <p className="text-sm text-purple-900">{doc.feedback_dospem}</p>
                  </div>
                </div>
              )}
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                rows={2}
                placeholder="Tambahkan catatan untuk mahasiswa... (opsional)"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleVerifikasi('revisi_dospem')}
                  disabled={processing}
                  className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                >
                  <XCircle className="w-4 h-4" /> Revisi
                </button>
                <button
                  onClick={() => handleVerifikasi('disetujui_dospem')}
                  disabled={processing}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  {processing ? 'Memproses...' : 'Setujui'}
                </button>
              </div>
            </>
          ) : infoMsg ? (
            <div className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 ${infoMsg.cfg.bg} border ${infoMsg.cfg.border}`}>
              <infoMsg.icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${infoMsg.cfg.color}`} />
              <p className={`text-sm font-medium ${infoMsg.cfg.color}`}>
                {infoMsg.text}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function DosenDokumen() {
  const [mahasiswa, setMahasiswa]             = useState([])
  const [dokumen, setDokumen]                 = useState([])
  const [loading, setLoading]                 = useState(true)
  const [loadingDok, setLoadingDok]           = useState(false)
  const [detailDoc, setDetailDoc]             = useState(null)
  const [searchQuery, setSearchQuery]         = useState('')
  const [activeTab, setActiveTab]             = useState('semua')

  const {
    periodeId: selectedPeriode,
    periodeList,
    loading: loadingPeriode,
    setLocalPeriode,
  } = usePeriodeFilter('dosen_pembimbing')

  useEffect(() => {
    if (loadingPeriode) return
    if (periodeList.length === 0) {
      setMahasiswa([])
      setLoading(false)
      return
    }
    if (selectedPeriode) fetchPageData(selectedPeriode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriode, periodeList, loadingPeriode])

  const fetchPageData = async (periodeId) => {
    try {
      const mhsRes = await api.get('/dosen/mahasiswa-bimbingan', {
        params: { periode_id: periodeId },
      })
      setMahasiswa(mhsRes.data.data || [])
    } catch {
      setMahasiswa([])
    } finally {
      setLoading(false)
    }
    fetchDokumen(periodeId)
  }

  const fetchDokumen = async (periodeId) => {
    setLoadingDok(true)
    try {
      const res = await api.get('/dosen/dokumen', { params: { periode_id: periodeId } })
      setDokumen(res.data.data || [])
    } catch {
      setDokumen([])
    } finally {
      setLoadingDok(false)
    }
  }

  const countByJenis = (jenis) => {
    if (jenis === 'semua') return dokumen.length
    return dokumen.filter(d => d.jenis === jenis).length
  }

  const filteredDokumen = dokumen.filter(doc => {
    const matchTab = activeTab === 'semua' || doc.jenis === activeTab
    if (!matchTab) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    const jenisLabel = (JENIS_LABEL[doc.jenis] || doc.jenis || '').toLowerCase()
    const namaFile   = (doc.nama_file || '').toLowerCase()
    const namaMhs    = (doc.nama_mahasiswa || '').toLowerCase()
    return jenisLabel.includes(q) || namaFile.includes(q) || namaMhs.includes(q)
  })

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Dokumen Mahasiswa</h1>
        <p className="text-sm text-gray-500 mt-0.5">Verifikasi dokumen mahasiswa bimbingan</p>
      </div>

      {/* Search & Periode — selalu tampil */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari judul dokumen atau nama mahasiswa..."
            className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <PeriodeDropdown
          value={selectedPeriode}
          onChange={(id) => setLocalPeriode(periodeList.find(p => String(p.id) === String(id)))}
          options={periodeList}
        />
      </div>
      
      <div className="flex items-center gap-2 flex-wrap">
        {JENIS_TABS.map(tab => {
          const count    = countByJenis(tab.key)
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearchQuery('') }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all border
                ${isActive
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                }`}
            >
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold
                ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* List dokumen */}
      <div className="space-y-3">
        {loadingDok ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredDokumen.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">
              {searchQuery
                ? `Tidak ada dokumen untuk "${searchQuery}"`
                : mahasiswa.length === 0
                ? 'Belum ada mahasiswa bimbingan'
                : `Belum ada dokumen${activeTab !== 'semua' ? ` ${JENIS_TABS.find(t => t.key === activeTab)?.label}` : ''}`
              }
            </p>
          </div>
        ) : filteredDokumen.map(doc => {
          const statusCfg  = STATUS_CONFIG[doc.status] || STATUS_CONFIG.diupload
          const StatusIcon = statusCfg.icon

          return (
            <div key={doc.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-gray-800">
                      {JENIS_LABEL[doc.jenis] || doc.jenis}
                    </p>
                    {doc.nama_mahasiswa && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {doc.nama_mahasiswa}
                      </span>
                    )}
                    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}>
                      <StatusIcon className="w-3 h-3" />
                      {statusCfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {doc.nama_file} · {new Date(doc.created_at).toLocaleDateString('id-ID')}
                  </p>
                </div>

                <button
                  onClick={() => setDetailDoc(doc)}
                  className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex-shrink-0"
                  title="Lihat detail & verifikasi"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {detailDoc && (
        <DetailModal
          doc={detailDoc}
          onClose={() => setDetailDoc(null)}
          onRefresh={() => fetchDokumen(selectedPeriode)}
        />
      )}
    </div>
  )
}