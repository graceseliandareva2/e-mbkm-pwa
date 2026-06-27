import { useEffect, useState } from 'react'
import { History, BookOpen, FileText, CheckCircle, XCircle, Clock, AlertCircle, X, Eye } from 'lucide-react'
import api from '../../utils/api'

const LOGBOOK_STATUS = {
  draft:        { label: 'Draft',        color: 'text-gray-500',   bg: 'bg-gray-100',  icon: Clock },
  disubmit:     { label: 'Menunggu',     color: 'text-yellow-600', bg: 'bg-yellow-50', icon: Clock },
  diverifikasi: { label: 'Diverifikasi', color: 'text-green-600',  bg: 'bg-green-50',  icon: CheckCircle },
  revisi:       { label: 'Perlu Revisi', color: 'text-red-500',    bg: 'bg-red-50',    icon: AlertCircle },
}

const getDokumenStatusInfo = (status) => {
  switch (status) {
    case 'revisi_kaprodi':
    case 'revisi_dospem':
      return { label: 'Revisi', color: 'text-red-500', icon: XCircle }
    case 'diverifikasi':
    case 'disetujui_dospem':
    case 'disetujui_kaprodi':
      return { label: 'Diverifikasi', color: 'text-green-500', icon: CheckCircle }
    default:
      return { label: 'Menunggu Review', color: 'text-yellow-500', icon: Clock }
  }
}

const formatDurasi = (jam) => {
  const totalMenit = Math.round(Number(jam) * 60)
  const j = Math.floor(totalMenit / 60)
  const m = totalMenit % 60
  if (m === 0) return `${j} jam`
  if (j === 0) return `${m} menit`
  return `${j} jam ${m} menit`
}

const isImageUrl = (url) => {
  if (!url) return false
  return /\.(jpg|jpeg|png)$/i.test(url) || url.includes('/image/')
}

function DetailRow({ label, value }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <div className="bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5">
        <p className="text-sm text-gray-800 leading-relaxed">{value}</p>
      </div>
    </div>
  )
}

export default function MahasiswaRiwayat() {
  const [logbooks, setLogbooks]       = useState([])
  const [dokumens, setDokumens]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [activeTab, setActiveTab]     = useState('semua')
  const [selectedLog, setSelectedLog] = useState(null)
  const [selectedDoc, setSelectedDoc] = useState(null)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [logRes, dokRes] = await Promise.all([
          api.get('/mahasiswa/logbook'),
          api.get('/mahasiswa/dokumen'),
        ])
        const logData = logRes.data?.data ?? logRes.data
        const dokData = dokRes.data?.data ?? dokRes.data
        setLogbooks(Array.isArray(logData) ? logData : [])
        setDokumens(Array.isArray(dokData) ? dokData : [])
      } catch {
        setLogbooks([])
        setDokumens([])
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  const allItems = [
    ...logbooks.map(l => ({ ...l, _type: 'logbook' })),
    ...dokumens.map(d => ({ ...d, _type: 'dokumen' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const filtered = activeTab === 'semua'
    ? allItems
    : allItems.filter(item => item._type === activeTab)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Riwayat Aktivitas</h1>
        <p className="text-sm text-gray-500 mt-0.5">Riwayat logbook dan dokumen Capstone Project kamu</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'semua',   label: 'Semua',   count: allItems.length },
          { key: 'logbook', label: 'Logbook', count: logbooks.length },
          { key: 'dokumen', label: 'Dokumen', count: dokumens.length },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all
              ${activeTab === tab.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
          >
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold
              ${activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-gray-200">
          <History className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 font-medium">Belum ada riwayat</p>
          <p className="text-sm text-gray-400 mt-1">Aktivitas logbook dan dokumen akan muncul di sini</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          {filtered.map(item => {

            // ── LOGBOOK ──
            if (item._type === 'logbook') {
              const cfg = LOGBOOK_STATUS[item.status] || LOGBOOK_STATUS.disubmit
              const Icon = cfg.icon
              return (
                <div key={`logbook-${item.id}`} className="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors">
                  <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                    <BookOpen className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800 truncate">{item.kegiatan}</p>
                      <span className={`flex items-center gap-1 text-xs font-medium flex-shrink-0 ${cfg.color}`}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">Logbook</span>
                      <p className="text-xs text-gray-400">
                        {new Date(item.tanggal || item.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric', month: 'long', year: 'numeric'
                        })}
                        {item.jam && ` · ${formatDurasi(item.jam)}`}
                      </p>
                    </div>
                    {item.feedback_dosen && (
                      <p className="text-xs text-purple-600 mt-1 bg-purple-50 rounded-lg px-2 py-1 line-clamp-1">
                        💬 {item.feedback_dosen}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedLog(item)}
                    className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg flex-shrink-0 mt-0.5"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              )
            }

            // ── DOKUMEN ──
            const info        = getDokumenStatusInfo(item.status)
            const Icon        = info.icon
            const hasFeedback = item.feedback_kaprodi || item.feedback_dospem
            const feedbackText = item.feedback_dospem || item.feedback_kaprodi
            const jenisLabel  = item.jenis === 'laporan_akhir' ? 'Laporan Akhir' : 'PPT'

            return (
              <div key={`dokumen-${item.id}`} className="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors">
                <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                  <FileText className="w-4 h-4 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {item.nama_dokumen || item.nama_file}
                    </p>
                    <span className={`flex items-center gap-1 text-xs font-medium flex-shrink-0 ${info.color}`}>
                      <Icon className="w-3 h-3" />
                      {info.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full font-medium">
                      {jenisLabel}
                    </span>
                    <p className="text-xs text-gray-400">
                      {new Date(item.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'long', year: 'numeric'
                      })}
                    </p>
                  </div>
                  {hasFeedback && (
                    <p className="text-xs text-purple-600 mt-1 bg-purple-50 rounded-lg px-2 py-1 line-clamp-1">
                      💬 {feedbackText}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedDoc(item)}
                  className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg flex-shrink-0 mt-0.5"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Detail Logbook */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
              <h2 className="font-bold text-gray-800 text-lg">Detail Logbook</h2>
              <button onClick={() => setSelectedLog(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Kiri — Bukti Preview */}
              <div className="w-1/2 bg-gray-900 flex flex-col flex-shrink-0 rounded-bl-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800 flex-shrink-0">
                  <p className="text-xs font-semibold text-gray-300">Bukti Kegiatan</p>
                  {selectedLog.bukti_path && (
                    <p className="text-xs text-gray-300 truncate max-w-[160px]">
                      {selectedLog.bukti_path.split('/').pop()}
                    </p>
                  )}
                </div>
                <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
                  {selectedLog.bukti_path ? (
                    isImageUrl(selectedLog.bukti_path) ? (
                      <img
                        src={selectedLog.bukti_path}
                        alt="Bukti kegiatan"
                        className="max-w-full max-h-full object-contain rounded-lg"
                      />
                    ) : (
                      <iframe
                        src={selectedLog.bukti_path}
                        className="w-full h-full"
                        title="Bukti PDF"
                        style={{ minHeight: '360px' }}
                      />
                    )
                  ) : selectedLog.bukti_link ? (
                    
                      href={selectedLog.bukti_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-blue-400 hover:underline bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2.5 max-w-full"
                    >
                      🔗 <span className="truncate">{selectedLog.bukti_link}</span>
                    </a>
                  ) : (
                    <div className="text-center">
                      <div className="w-16 h-16 bg-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <FileText className="w-8 h-8 text-gray-500" />
                      </div>
                      <p className="text-sm text-gray-500">Tidak ada bukti</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Kanan — Info */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <DetailRow
                  label="Tanggal"
                  value={new Date(selectedLog.tanggal).toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'long', year: 'numeric'
                  })}
                />
                <DetailRow label="Judul Kegiatan" value={selectedLog.kegiatan} />
                {selectedLog.deskripsi && <DetailRow label="Deskripsi Kegiatan" value={selectedLog.deskripsi} />}
                <DetailRow label="Durasi" value={formatDurasi(selectedLog.jam)} />

                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Status</p>
                  {(() => {
                    const cfg = LOGBOOK_STATUS[selectedLog.status] || LOGBOOK_STATUS.disubmit
                    const Icon = cfg.icon
                    return (
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold ${cfg.color} ${cfg.bg}`}>
                        <Icon className="w-4 h-4" />
                        {cfg.label}
                      </div>
                    )
                  })()}
                </div>

                {selectedLog.feedback_dosen && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Catatan Revisi</p>
                    <div className="bg-purple-50 border border-purple-100 rounded-xl px-3.5 py-3">
                      <p className="text-sm text-purple-900 leading-relaxed">{selectedLog.feedback_dosen}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t flex-shrink-0">
              <button onClick={() => setSelectedLog(null)}
                className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail Dokumen */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col" style={{ height: '90vh' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-gray-800 text-sm">
                    {selectedDoc.jenis === 'laporan_akhir' ? 'Laporan Akhir' : 'PPT'}
                  </p>
                  {(() => {
                    const info = getDokumenStatusInfo(selectedDoc.status)
                    const Icon = info.icon
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${info.color}`}>
                        <Icon className="w-3 h-3" />
                        {info.label}
                      </span>
                    )
                  })()}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{selectedDoc.nama_file}</p>
              </div>
              <button onClick={() => setSelectedDoc(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {(selectedDoc.feedback_kaprodi || selectedDoc.feedback_dospem) && (
              <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex-shrink-0">
                <p className="text-xs font-semibold text-red-600 mb-0.5">Catatan Revisi:</p>
                <p className="text-sm text-red-800 leading-relaxed">
                  {selectedDoc.feedback_dospem || selectedDoc.feedback_kaprodi}
                </p>
              </div>
            )}

            <div className="flex-1 overflow-hidden bg-gray-50 rounded-b-2xl">
              {selectedDoc.path_file ? (
                isImageUrl(selectedDoc.path_file) ? (
                  <img
                    src={selectedDoc.path_file}
                    alt={selectedDoc.nama_file}
                    className="w-full h-full object-contain p-4"
                  />
                ) : (
                  <iframe
                    src={selectedDoc.path_file}
                    className="w-full h-full"
                    title={selectedDoc.nama_file}
                  />
                )
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">File tidak tersedia</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}